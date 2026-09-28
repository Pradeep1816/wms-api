import { MigrationInterface, QueryRunner } from 'typeorm';

type RepairTarget = Readonly<{
  lessonId: number;
  privateLessonId: number;
  originalLessonPaymentId: number;
  originalPaymentId: number;
}>;

type BackupRow = {
  lessonId: number | string;
  privateLessonId: number | string;
  correctionTransactionId: number | string;
  correctionPaymentId: number | string;
  correctionLessonPaymentId: number | string;
};

/**
 * Clears two verified historical $0.01 rounding residuals for Aria Vivas.
 *
 * Each lesson has a single valid $18.12 allocation against an $18.13 total,
 * no invoice, and a $0.01 private-lesson balance. The repair follows the
 * established historical-cent pattern by recording an auditable $0.01 Account
 * Entry payment and applying it to the lesson.
 *
 * Emily Vivas lesson 5429164 is deliberately excluded because its balance is
 * connected to an invoice and an offsetting Credit Used allocation.
 */
export class RepairRichmondHillAriaCentResiduals1791500002000 implements MigrationInterface {
  name = 'RepairRichmondHillAriaCentResiduals1791500002000';

  private readonly migrationName =
    'RepairRichmondHillAriaCentResiduals1791500002000';
  private readonly backupTable = 'migration_rh_11170_cent_residual_backup';
  private readonly customerId = 11170;
  private readonly enrolmentId = 21420;
  private readonly locationId = 16;
  private readonly updatedByUserId = 727;
  private readonly lessonTotal = '18.1300';
  private readonly originalAppliedAmount = '18.1200';
  private readonly correctionAmount = '0.0100';
  private readonly notes = 'Verified Richmond Hill $0.01 rounding correction';

  private readonly targets: readonly RepairTarget[] = [
    {
      lessonId: 5341508,
      privateLessonId: 4868763,
      originalLessonPaymentId: 2012999,
      originalPaymentId: 1768668,
    },
    {
      lessonId: 5341513,
      privateLessonId: 4868768,
      originalLessonPaymentId: 2013001,
      originalPaymentId: 1787193,
    },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createBackupTable(queryRunner);

    const backupCount = await this.getBackupCount(queryRunner);
    if (backupCount > 0) {
      this.assertCompleteCount(backupCount, 'backup rows');
      await this.assertFinalState(queryRunner);
      return;
    }

    const matchingCount = await this.getMatchingBaselineCount(queryRunner);
    if (matchingCount === 0) {
      return;
    }
    this.assertCompleteCount(matchingCount, 'matching baseline lessons');

    await this.assertAccountEntryPaymentMethod(queryRunner);
    await this.captureBaseline(queryRunner);
    this.assertCompleteCount(
      await this.getBackupCount(queryRunner),
      'captured backup rows',
    );

    for (const target of this.targets) {
      await this.applyCorrection(queryRunner, target);
    }

    await this.assertFinalState(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const backupCount = await this.getBackupCount(queryRunner);
    if (backupCount === 0) {
      return;
    }
    this.assertCompleteCount(backupCount, 'backup rows');
    await this.assertFinalState(queryRunner);

    const backupRows = (await queryRunner.query(
      `
      SELECT
        lessonId,
        privateLessonId,
        correctionTransactionId,
        correctionPaymentId,
        correctionLessonPaymentId
      FROM \`${this.backupTable}\`
      WHERE migrationName = ?
      ORDER BY lessonId
      `,
      [this.migrationName],
    )) as BackupRow[];

    this.assertCompleteCount(backupRows.length, 'rollback rows');

    for (const row of backupRows) {
      await this.revertCorrection(queryRunner, row);
    }

    await this.assertRollbackState(queryRunner);
    await queryRunner.query(
      `DELETE FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
  }

  private async createBackupTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.backupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`lessonId\` int unsigned NOT NULL,
        \`privateLessonId\` int unsigned NOT NULL,
        \`originalLessonPaymentId\` int unsigned NOT NULL,
        \`originalPaymentId\` int unsigned NOT NULL,
        \`oldPrivateLessonBalance\` decimal(12,4) NOT NULL,
        \`originalAppliedAmount\` decimal(12,4) NOT NULL,
        \`originalPaymentBalance\` decimal(12,4) NOT NULL,
        \`correctionTransactionId\` int unsigned NULL,
        \`correctionPaymentId\` int unsigned NULL,
        \`correctionLessonPaymentId\` int unsigned NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`lessonId\`),
        KEY \`idx_rh11170_cent_payment\` (\`correctionPaymentId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);
  }

  private async getBackupCount(queryRunner: QueryRunner): Promise<number> {
    const rows = (await queryRunner.query(
      `SELECT COUNT(*) AS rowCount FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    )) as Array<{ rowCount: number | string }>;

    return Number(rows[0]?.rowCount ?? 0);
  }

  private assertCompleteCount(count: number, description: string): void {
    if (count !== this.targets.length) {
      throw new Error(
        `${this.migrationName}: expected ${this.targets.length} ${description}, found ${count}`,
      );
    }
  }

  private async getMatchingBaselineCount(
    queryRunner: QueryRunner,
  ): Promise<number> {
    const rows = (await queryRunner.query(`
      SELECT COALESCE(SUM(
        CASE
          WHEN l.id = target.lessonId
           AND e.id = ${this.enrolmentId}
           AND s.customer_id = ${this.customerId}
           AND c.locationId = ${this.locationId}
           AND l.courseId = e.courseId
           AND l.isDeleted = 0
           AND l.isConfirmed = 1
           AND l.status <> 4
           AND pl.id = target.privateLessonId
           AND pl.total = ${this.lessonTotal}
           AND pl.balance = ${this.correctionAmount}
           AND originalLp.id = target.originalLessonPaymentId
           AND originalLp.lessonId = l.id
           AND originalLp.paymentId = target.originalPaymentId
           AND originalLp.enrolmentId = e.id
           AND originalLp.amount = ${this.originalAppliedAmount}
           AND originalLp.isDeleted = 0
           AND originalPayment.id = target.originalPaymentId
           AND originalPayment.user_id = ${this.customerId}
           AND originalPayment.payment_method_id = 8
           AND originalPayment.balance = 0.0000
           AND originalPayment.isDeleted = 0
           AND (
             SELECT COUNT(*)
             FROM lesson_payment activeLp
             INNER JOIN payment activePayment
               ON activePayment.id = activeLp.paymentId
              AND activePayment.isDeleted = 0
             WHERE activeLp.lessonId = l.id
               AND activeLp.isDeleted = 0
           ) = 1
           AND (
             SELECT COUNT(DISTINCT invoice.id)
             FROM invoice_item_lesson iil
             INNER JOIN invoice_line_item ili
               ON ili.id = iil.invoiceLineItemId
              AND ili.isDeleted = 0
             INNER JOIN invoice
               ON invoice.id = ili.invoice_id
              AND invoice.isDeleted = 0
              AND invoice.isCanceled = 0
              AND invoice.isVoid = 0
             WHERE iil.lessonId = l.id
           ) = 0
           AND NOT EXISTS (
             SELECT 1
             FROM payment correctionPayment
             WHERE correctionPayment.user_id = ${this.customerId}
               AND correctionPayment.reference = CONCAT('ROUNDING-L-', l.id)
               AND correctionPayment.notes = '${this.notes}'
           )
          THEN 1
          ELSE 0
        END
      ), 0) AS matchingCount
      FROM (${this.targetScope()}) target
      LEFT JOIN lesson l ON l.id = target.lessonId
      LEFT JOIN private_lesson pl ON pl.id = target.privateLessonId
      LEFT JOIN enrolment e ON e.id = ${this.enrolmentId}
      LEFT JOIN student s ON s.id = e.studentId
      LEFT JOIN course c ON c.id = e.courseId
      LEFT JOIN lesson_payment originalLp
        ON originalLp.id = target.originalLessonPaymentId
      LEFT JOIN payment originalPayment
        ON originalPayment.id = target.originalPaymentId
    `)) as Array<{ matchingCount: number | string }>;

    return Number(rows[0]?.matchingCount ?? 0);
  }

  private async assertAccountEntryPaymentMethod(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT COUNT(*) AS matchingCount
      FROM payment_method
      WHERE id = 1
        AND name = 'Account Entry'
        AND active = 1
    `)) as Array<{ matchingCount: number | string }>;

    if (Number(rows[0]?.matchingCount ?? 0) !== 1) {
      throw new Error(
        `${this.migrationName}: payment method 1 is not the active Account Entry method`,
      );
    }
  }

  private async captureBaseline(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT INTO \`${this.backupTable}\` (
        migrationName,
        lessonId,
        privateLessonId,
        originalLessonPaymentId,
        originalPaymentId,
        oldPrivateLessonBalance,
        originalAppliedAmount,
        originalPaymentBalance
      )
      SELECT
        ?,
        target.lessonId,
        target.privateLessonId,
        target.originalLessonPaymentId,
        target.originalPaymentId,
        pl.balance,
        originalLp.amount,
        originalPayment.balance
      FROM (${this.targetScope()}) target
      INNER JOIN private_lesson pl
        ON pl.id = target.privateLessonId
       AND pl.lessonId = target.lessonId
      INNER JOIN lesson_payment originalLp
        ON originalLp.id = target.originalLessonPaymentId
       AND originalLp.lessonId = target.lessonId
       AND originalLp.paymentId = target.originalPaymentId
       AND originalLp.isDeleted = 0
      INNER JOIN payment originalPayment
        ON originalPayment.id = target.originalPaymentId
       AND originalPayment.isDeleted = 0
      WHERE pl.total = ${this.lessonTotal}
        AND pl.balance = ${this.correctionAmount}
        AND originalLp.amount = ${this.originalAppliedAmount}
        AND originalPayment.balance = 0.0000
      `,
      [this.migrationName],
    );
  }

  private async applyCorrection(
    queryRunner: QueryRunner,
    target: RepairTarget,
  ): Promise<void> {
    const transactionId = await this.insertAndGetId(
      queryRunner,
      `
      INSERT INTO \`transaction\` (
        createdOn, updatedOn, createdByUserId, updatedByUserId
      ) VALUES (CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)
      `,
      [this.updatedByUserId, this.updatedByUserId],
    );

    const paymentId = await this.insertAndGetId(
      queryRunner,
      `
      INSERT INTO payment (
        transactionId, user_id, payment_method_id, amount, date, reference,
        notes, isDeleted, createdOn, updatedOn, createdByUserId,
        updatedByUserId, balance
      ) VALUES (
        ?, ?, 1, ?, CURRENT_TIMESTAMP, ?, ?, 0, CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP, ?, ?, 0.0000
      )
      `,
      [
        transactionId,
        this.customerId,
        this.correctionAmount,
        `ROUNDING-L-${target.lessonId}`,
        this.notes,
        this.updatedByUserId,
        this.updatedByUserId,
      ],
    );

    const lessonPaymentId = await this.insertAndGetId(
      queryRunner,
      `
      INSERT INTO lesson_payment (
        lessonId, paymentId, enrolmentId, amount, royaltyCategoryId,
        royaltyRateApplied, isDeleted, date, createdOn, updatedOn,
        createdByUserId, updatedByUserId
      ) VALUES (
        ?, ?, ?, ?, NULL, NULL, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP, ?, ?
      )
      `,
      [
        target.lessonId,
        paymentId,
        this.enrolmentId,
        this.correctionAmount,
        this.updatedByUserId,
        this.updatedByUserId,
      ],
    );

    const lessonResult = await this.executeStatement(
      queryRunner,
      `
      UPDATE private_lesson
      SET balance = 0.0000
      WHERE id = ?
        AND lessonId = ?
        AND total = ${this.lessonTotal}
        AND balance = ${this.correctionAmount}
      `,
      [target.privateLessonId, target.lessonId],
    );
    this.assertOneAffected(lessonResult, `lesson ${target.lessonId}`);

    const backupResult = await this.executeStatement(
      queryRunner,
      `
      UPDATE \`${this.backupTable}\`
      SET
        correctionTransactionId = ?,
        correctionPaymentId = ?,
        correctionLessonPaymentId = ?
      WHERE migrationName = ?
        AND lessonId = ?
        AND correctionTransactionId IS NULL
        AND correctionPaymentId IS NULL
        AND correctionLessonPaymentId IS NULL
      `,
      [
        transactionId,
        paymentId,
        lessonPaymentId,
        this.migrationName,
        target.lessonId,
      ],
    );
    this.assertOneAffected(backupResult, `backup ${target.lessonId}`);
  }

  private async assertFinalState(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `
      SELECT COUNT(*) AS invalidCount
      FROM \`${this.backupTable}\` b
      LEFT JOIN private_lesson pl
        ON pl.id = b.privateLessonId
       AND pl.lessonId = b.lessonId
      LEFT JOIN lesson_payment originalLp
        ON originalLp.id = b.originalLessonPaymentId
      LEFT JOIN payment originalPayment
        ON originalPayment.id = b.originalPaymentId
      LEFT JOIN \`transaction\` correctionTransaction
        ON correctionTransaction.id = b.correctionTransactionId
      LEFT JOIN payment correctionPayment
        ON correctionPayment.id = b.correctionPaymentId
      LEFT JOIN lesson_payment correctionLp
        ON correctionLp.id = b.correctionLessonPaymentId
      WHERE b.migrationName = ?
        AND (
          pl.id IS NULL
          OR pl.total <> ${this.lessonTotal}
          OR pl.balance <> 0.0000
          OR originalLp.id IS NULL
          OR originalLp.lessonId <> b.lessonId
          OR originalLp.paymentId <> b.originalPaymentId
          OR originalLp.amount <> b.originalAppliedAmount
          OR originalLp.isDeleted <> 0
          OR originalPayment.id IS NULL
          OR originalPayment.balance <> b.originalPaymentBalance
          OR originalPayment.isDeleted <> 0
          OR correctionTransaction.id IS NULL
          OR correctionPayment.id IS NULL
          OR correctionPayment.transactionId <> b.correctionTransactionId
          OR correctionPayment.user_id <> ${this.customerId}
          OR correctionPayment.payment_method_id <> 1
          OR correctionPayment.amount <> ${this.correctionAmount}
          OR correctionPayment.balance <> 0.0000
          OR correctionPayment.isDeleted <> 0
          OR correctionPayment.reference <> CONCAT('ROUNDING-L-', b.lessonId)
          OR correctionPayment.notes <> '${this.notes}'
          OR correctionLp.id IS NULL
          OR correctionLp.lessonId <> b.lessonId
          OR correctionLp.paymentId <> b.correctionPaymentId
          OR correctionLp.enrolmentId <> ${this.enrolmentId}
          OR correctionLp.amount <> ${this.correctionAmount}
          OR correctionLp.isDeleted <> 0
          OR (
            SELECT COALESCE(SUM(activeLp.amount), 0)
            FROM lesson_payment activeLp
            INNER JOIN payment activePayment
              ON activePayment.id = activeLp.paymentId
             AND activePayment.isDeleted = 0
            WHERE activeLp.lessonId = b.lessonId
              AND activeLp.isDeleted = 0
          ) <> ${this.lessonTotal}
        )
      `,
      [this.migrationName],
    )) as Array<{ invalidCount: number | string }>;

    if (Number(rows[0]?.invalidCount ?? 0) !== 0) {
      throw new Error(
        `${this.migrationName}: repaired state validation failed`,
      );
    }
  }

  private async revertCorrection(
    queryRunner: QueryRunner,
    row: BackupRow,
  ): Promise<void> {
    const lessonResult = await this.executeStatement(
      queryRunner,
      `
      UPDATE private_lesson
      SET balance = ${this.correctionAmount}
      WHERE id = ?
        AND lessonId = ?
        AND total = ${this.lessonTotal}
        AND balance = 0.0000
      `,
      [Number(row.privateLessonId), Number(row.lessonId)],
    );
    this.assertOneAffected(lessonResult, `lesson ${row.lessonId}`);

    await this.deleteOne(
      queryRunner,
      `DELETE FROM lesson_payment WHERE id = ? AND lessonId = ? AND paymentId = ? AND amount = ${this.correctionAmount}`,
      [
        Number(row.correctionLessonPaymentId),
        Number(row.lessonId),
        Number(row.correctionPaymentId),
      ],
      `lesson payment ${row.correctionLessonPaymentId}`,
    );
    await this.deleteOne(
      queryRunner,
      `DELETE FROM payment WHERE id = ? AND transactionId = ? AND user_id = ? AND payment_method_id = 1 AND amount = ${this.correctionAmount} AND balance = 0.0000`,
      [
        Number(row.correctionPaymentId),
        Number(row.correctionTransactionId),
        this.customerId,
      ],
      `payment ${row.correctionPaymentId}`,
    );
    await this.deleteOne(
      queryRunner,
      'DELETE FROM `transaction` WHERE id = ?',
      [Number(row.correctionTransactionId)],
      `transaction ${row.correctionTransactionId}`,
    );
  }

  private async assertRollbackState(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `
      SELECT COUNT(*) AS invalidCount
      FROM \`${this.backupTable}\` b
      LEFT JOIN private_lesson pl
        ON pl.id = b.privateLessonId
       AND pl.lessonId = b.lessonId
      LEFT JOIN lesson_payment originalLp
        ON originalLp.id = b.originalLessonPaymentId
      LEFT JOIN payment originalPayment
        ON originalPayment.id = b.originalPaymentId
      LEFT JOIN lesson_payment correctionLp
        ON correctionLp.id = b.correctionLessonPaymentId
      LEFT JOIN payment correctionPayment
        ON correctionPayment.id = b.correctionPaymentId
      LEFT JOIN \`transaction\` correctionTransaction
        ON correctionTransaction.id = b.correctionTransactionId
      WHERE b.migrationName = ?
        AND (
          pl.id IS NULL
          OR pl.total <> ${this.lessonTotal}
          OR pl.balance <> b.oldPrivateLessonBalance
          OR originalLp.id IS NULL
          OR originalLp.amount <> b.originalAppliedAmount
          OR originalLp.isDeleted <> 0
          OR originalPayment.id IS NULL
          OR originalPayment.balance <> b.originalPaymentBalance
          OR originalPayment.isDeleted <> 0
          OR correctionLp.id IS NOT NULL
          OR correctionPayment.id IS NOT NULL
          OR correctionTransaction.id IS NOT NULL
        )
      `,
      [this.migrationName],
    )) as Array<{ invalidCount: number | string }>;

    if (Number(rows[0]?.invalidCount ?? 0) !== 0) {
      throw new Error(
        `${this.migrationName}: rollback state validation failed`,
      );
    }
  }

  private targetScope(): string {
    return this.targets
      .map(
        (target) =>
          `SELECT ${target.lessonId} AS lessonId, ${target.privateLessonId} AS privateLessonId, ${target.originalLessonPaymentId} AS originalLessonPaymentId, ${target.originalPaymentId} AS originalPaymentId`,
      )
      .join(' UNION ALL ');
  }

  private async insertAndGetId(
    queryRunner: QueryRunner,
    sql: string,
    parameters: unknown[],
  ): Promise<number> {
    const result = await this.executeStatement(queryRunner, sql, parameters);
    const raw = this.isRecord(result.raw) ? result.raw : undefined;
    const insertId = Number(result.insertId ?? raw?.insertId ?? 0);
    if (!Number.isInteger(insertId) || insertId <= 0) {
      throw new Error(`${this.migrationName}: insert did not return an ID`);
    }
    return insertId;
  }

  private async deleteOne(
    queryRunner: QueryRunner,
    sql: string,
    parameters: unknown[],
    description: string,
  ): Promise<void> {
    const result = await this.executeStatement(queryRunner, sql, parameters);
    this.assertOneAffected(result, description);
  }

  private async executeStatement(
    queryRunner: QueryRunner,
    sql: string,
    parameters: unknown[],
  ): Promise<Record<string, unknown>> {
    const result = (await queryRunner.query(sql, parameters)) as unknown;
    if (!this.isRecord(result)) {
      throw new Error(`${this.migrationName}: statement returned no result`);
    }
    return result;
  }

  private assertOneAffected(
    result: Record<string, unknown>,
    description: string,
  ): void {
    if (Number(result.affectedRows ?? 0) !== 1) {
      throw new Error(
        `${this.migrationName}: concurrent change detected for ${description}`,
      );
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
