import { MigrationInterface, QueryRunner } from 'typeorm';

type LessonTarget = Readonly<{
  lessonId: number;
  paymentCycleLessonId: number;
  oldPaymentCycleId: number;
  newPaymentCycleId: number;
  oldDueDate: string;
  newDueDate: string;
  lessonDate: string;
  originalDate: string;
  expectedBalance: string;
  expectedPaymentTotal: string;
}>;

/**
 * Repairs the audited monthly payment-cycle graph for Woodbridge enrolment
 * 31180.
 *
 * A historical reset combined October and November into one cycle despite the
 * enrolment being Monthly. It also attached a December 25 billing occurrence,
 * rescheduled to October 30, to that combined cycle.
 *
 * The repair restores separate October, November, and December billing cycles.
 * It changes only payment-cycle boundaries/membership, the frequency effective
 * date, and lesson due dates. Payments, allocations, private-lesson amounts,
 * invoices, and recurring-payment configuration are preserved and verified.
 */
export class RepairWoodbridgeEnrolment31180PaymentCycle1792200000000 implements MigrationInterface {
  name = 'RepairWoodbridgeEnrolment31180PaymentCycle1792200000000';

  private readonly migrationName =
    'RepairWoodbridgeEnrolment31180PaymentCycle1792200000000';
  private readonly backupTable =
    'migration_woodbridge_31180_monthly_cycle_backup';
  private readonly customerId = 13710;
  private readonly locationId = 9;
  private readonly enrolmentId = 31180;
  private readonly octoberCycleId = 773103;
  private readonly novemberCycleId = 664047;
  private readonly decemberCycleId = 773104;

  private readonly lessonTargets: readonly LessonTarget[] = [
    {
      lessonId: 4912328,
      paymentCycleLessonId: 3780399,
      oldPaymentCycleId: 773103,
      newPaymentCycleId: 664047,
      oldDueDate: '2026-09-15',
      newDueDate: '2026-10-15',
      lessonDate: '2026-11-06 17:30:00',
      originalDate: '2026-11-06 17:30:00',
      expectedBalance: '0.0000',
      expectedPaymentTotal: '32.6300',
    },
    {
      lessonId: 4912329,
      paymentCycleLessonId: 3780400,
      oldPaymentCycleId: 773103,
      newPaymentCycleId: 664047,
      oldDueDate: '2026-09-15',
      newDueDate: '2026-10-15',
      lessonDate: '2026-11-13 17:30:00',
      originalDate: '2026-11-13 17:30:00',
      expectedBalance: '0.0000',
      expectedPaymentTotal: '32.6300',
    },
    {
      lessonId: 4912330,
      paymentCycleLessonId: 3780401,
      oldPaymentCycleId: 773103,
      newPaymentCycleId: 664047,
      oldDueDate: '2026-09-15',
      newDueDate: '2026-10-15',
      lessonDate: '2026-11-20 17:30:00',
      originalDate: '2026-11-20 17:30:00',
      expectedBalance: '0.0000',
      expectedPaymentTotal: '32.6300',
    },
    {
      lessonId: 4912331,
      paymentCycleLessonId: 3780402,
      oldPaymentCycleId: 773103,
      newPaymentCycleId: 664047,
      oldDueDate: '2026-09-15',
      newDueDate: '2026-10-15',
      lessonDate: '2026-11-27 17:30:00',
      originalDate: '2026-11-27 17:30:00',
      expectedBalance: '0.0000',
      expectedPaymentTotal: '32.6300',
    },
    {
      lessonId: 5462390,
      paymentCycleLessonId: 3780403,
      oldPaymentCycleId: 773103,
      newPaymentCycleId: 773104,
      oldDueDate: '2026-09-15',
      newDueDate: '2026-11-15',
      lessonDate: '2026-10-30 17:30:00',
      originalDate: '2026-12-25 17:30:00',
      expectedBalance: '32.6300',
      expectedPaymentTotal: '0.0000',
    },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createBackupTable(queryRunner);

    const backupCount = await this.getBackupCount(queryRunner);
    if (backupCount > 0) {
      this.assertBackupCount(backupCount);
      await this.assertState(queryRunner, true);
      return;
    }

    const baselineCount = await this.getStateMatchCount(queryRunner, false);
    if (baselineCount === 0) {
      const finalCount = await this.getStateMatchCount(queryRunner, true);
      if (finalCount === this.lessonTargets.length) {
        return;
      }

      // This production-specific repair is intentionally a safe no-op in
      // databases where the complete audited graph is absent or has drifted.
      return;
    }

    if (baselineCount !== this.lessonTargets.length) {
      return;
    }

    await this.captureBaseline(queryRunner);
    this.assertBackupCount(await this.getBackupCount(queryRunner));

    await this.updateFrequencyAndCycles(queryRunner, true);
    await this.updateLessons(queryRunner, true);
    await this.assertState(queryRunner, true);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.createBackupTable(queryRunner);
    const backupCount = await this.getBackupCount(queryRunner);
    if (backupCount === 0) {
      return;
    }

    this.assertBackupCount(backupCount);
    await this.assertState(queryRunner, true);

    await this.updateLessons(queryRunner, false);
    await this.updateFrequencyAndCycles(queryRunner, false);
    await this.assertState(queryRunner, false);

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
        \`enrolmentId\` int unsigned NOT NULL,
        \`paymentCycleLessonId\` int unsigned NOT NULL,
        \`oldPaymentCycleId\` int unsigned NOT NULL,
        \`newPaymentCycleId\` int unsigned NOT NULL,
        \`oldDueDate\` date NOT NULL,
        \`newDueDate\` date NOT NULL,
        \`oldLessonUpdatedOn\` timestamp NULL DEFAULT NULL,
        \`privateLessonId\` int unsigned NOT NULL,
        \`privateLessonTotal\` decimal(12,4) NOT NULL,
        \`privateLessonBalance\` decimal(12,4) NOT NULL,
        \`lessonPaymentCount\` int unsigned NOT NULL,
        \`lessonPaymentTotal\` decimal(12,4) NOT NULL,
        \`invoiceReferenceCount\` int unsigned NOT NULL,
        \`frequencyRecordId\` int unsigned NOT NULL,
        \`oldFrequencyStartDate\` date NOT NULL,
        \`newFrequencyStartDate\` date NOT NULL,
        \`oldOctoberCycleEndDate\` date NOT NULL,
        \`newOctoberCycleEndDate\` date NOT NULL,
        \`oldNovemberCycleIsDeleted\` int NOT NULL,
        \`newNovemberCycleIsDeleted\` int NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`lessonId\`),
        KEY \`idx_woodbridge_31180_monthly_pcl\` (\`paymentCycleLessonId\`)
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

  private assertBackupCount(count: number): void {
    if (count !== this.lessonTargets.length) {
      throw new Error(
        `${this.migrationName}: expected ${this.lessonTargets.length} backup rows, found ${count}`,
      );
    }
  }

  private async getStateMatchCount(
    queryRunner: QueryRunner,
    repaired: boolean,
  ): Promise<number> {
    const lessonStatePredicate = repaired
      ? `pcl.paymentCycleId = target.newPaymentCycleId
           AND DATE(l.dueDate) = target.newDueDate`
      : `(
             (
               pcl.paymentCycleId = target.oldPaymentCycleId
               AND DATE(l.dueDate) = target.oldDueDate
             )
             OR (
               pcl.paymentCycleId = target.newPaymentCycleId
               AND DATE(l.dueDate) = target.newDueDate
             )
           )`;
    const frequencyStartDate = repaired ? '2026-10-01' : '2026-12-01';
    const octoberEndDate = repaired ? '2026-10-31' : '2026-11-30';
    const novemberDeleted = repaired ? 0 : 1;

    const rows = (await queryRunner.query(`
      SELECT COALESCE(SUM(
        CASE
          WHEN l.id = target.lessonId
           AND e.id = ${this.enrolmentId}
           AND e.paymentFrequencyId = 1
           AND e.isDeleted = 0
           AND e.isConfirmed = 1
           AND s.customer_id = ${this.customerId}
           AND c.locationId = ${this.locationId}
           AND l.courseId = e.courseId
           AND l.date = target.lessonDate
           AND l.originalDate = target.originalDate
           AND ${lessonStatePredicate}
           AND l.status IN (1, 2)
           AND l.isDeleted = 0
           AND l.isConfirmed = 1
           AND pcl.id = target.paymentCycleLessonId
           AND pcl.isDeleted = 0
           AND linkedPc.enrolmentId = e.id
           AND linkedPc.isDeleted = 0
           AND pl.total = 32.6300
           AND pl.balance = target.expectedBalance
           AND epf.paymentFrequencyId = 1
           AND epf.paymentCycleStartDate = '${frequencyStartDate}'
           AND octoberPc.startDate = '2026-10-01'
           AND octoberPc.endDate = '${octoberEndDate}'
           AND octoberPc.isDeleted = 0
           AND novemberPc.startDate = '2026-11-01'
           AND novemberPc.endDate = '2026-11-30'
           AND novemberPc.isDeleted = ${novemberDeleted}
           AND decemberPc.startDate = '2026-12-01'
           AND decemberPc.endDate = '2026-12-31'
           AND decemberPc.isDeleted = 0
           AND (
             SELECT COUNT(*)
             FROM payment_cycle_lesson activePcl
             INNER JOIN payment_cycle activePc
               ON activePc.id = activePcl.paymentCycleId
              AND activePc.enrolmentId = e.id
              AND activePc.isDeleted = 0
             WHERE activePcl.lessonId = l.id
               AND activePcl.isDeleted = 0
           ) = 1
           AND NOT EXISTS (
             SELECT 1
             FROM invoice_item_payment_cycle_lesson iipcl
             WHERE iipcl.paymentCycleLessonId = pcl.id
           )
           AND ((
             SELECT COALESCE(SUM(lp.amount), 0.0000)
             FROM lesson_payment lp
             INNER JOIN payment pay
               ON pay.id = lp.paymentId
              AND pay.isDeleted = 0
             WHERE lp.lessonId = l.id
               AND lp.isDeleted = 0
           ) <=> target.expectedPaymentTotal)
          THEN 1
          ELSE 0
        END
      ), 0) AS matchingCount
      FROM (${this.targetScope()}) target
      LEFT JOIN lesson l ON l.id = target.lessonId
      LEFT JOIN enrolment e ON e.id = ${this.enrolmentId}
      LEFT JOIN student s ON s.id = e.studentId
      LEFT JOIN course c ON c.id = e.courseId
      LEFT JOIN private_lesson pl ON pl.lessonId = l.id
      LEFT JOIN payment_cycle_lesson pcl
        ON pcl.id = target.paymentCycleLessonId
       AND pcl.lessonId = target.lessonId
      LEFT JOIN payment_cycle linkedPc ON linkedPc.id = pcl.paymentCycleId
      LEFT JOIN enrolment_payment_frequency epf
        ON epf.enrolmentId = e.id
       AND epf.isDeleted = 0
      LEFT JOIN payment_cycle octoberPc ON octoberPc.id = ${this.octoberCycleId}
      LEFT JOIN payment_cycle novemberPc ON novemberPc.id = ${this.novemberCycleId}
      LEFT JOIN payment_cycle decemberPc ON decemberPc.id = ${this.decemberCycleId}
    `)) as Array<{ matchingCount: number | string }>;

    return Number(rows[0]?.matchingCount ?? 0);
  }

  private async captureBaseline(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT INTO \`${this.backupTable}\` (
        migrationName,
        lessonId,
        enrolmentId,
        paymentCycleLessonId,
        oldPaymentCycleId,
        newPaymentCycleId,
        oldDueDate,
        newDueDate,
        oldLessonUpdatedOn,
        privateLessonId,
        privateLessonTotal,
        privateLessonBalance,
        lessonPaymentCount,
        lessonPaymentTotal,
        invoiceReferenceCount,
        frequencyRecordId,
        oldFrequencyStartDate,
        newFrequencyStartDate,
        oldOctoberCycleEndDate,
        newOctoberCycleEndDate,
        oldNovemberCycleIsDeleted,
        newNovemberCycleIsDeleted
      )
      SELECT
        ?,
        l.id,
        e.id,
        pcl.id,
        pcl.paymentCycleId,
        target.newPaymentCycleId,
        DATE(l.dueDate),
        target.newDueDate,
        l.updatedOn,
        pl.id,
        pl.total,
        pl.balance,
        (
          SELECT COUNT(*)
          FROM lesson_payment lp
          INNER JOIN payment pay
            ON pay.id = lp.paymentId
           AND pay.isDeleted = 0
          WHERE lp.lessonId = l.id
            AND lp.isDeleted = 0
        ),
        (
          SELECT COALESCE(SUM(lp.amount), 0.0000)
          FROM lesson_payment lp
          INNER JOIN payment pay
            ON pay.id = lp.paymentId
           AND pay.isDeleted = 0
          WHERE lp.lessonId = l.id
            AND lp.isDeleted = 0
        ),
        (
          SELECT COUNT(*)
          FROM invoice_item_payment_cycle_lesson iipcl
          WHERE iipcl.paymentCycleLessonId = pcl.id
        ),
        epf.id,
        epf.paymentCycleStartDate,
        '2026-10-01',
        octoberPc.endDate,
        '2026-10-31',
        novemberPc.isDeleted,
        0
      FROM (${this.targetScope()}) target
      INNER JOIN lesson l ON l.id = target.lessonId
      INNER JOIN enrolment e
        ON e.id = ${this.enrolmentId}
       AND e.courseId = l.courseId
      INNER JOIN private_lesson pl ON pl.lessonId = l.id
      INNER JOIN payment_cycle_lesson pcl
        ON pcl.id = target.paymentCycleLessonId
       AND pcl.lessonId = l.id
       AND pcl.isDeleted = 0
      INNER JOIN enrolment_payment_frequency epf
        ON epf.enrolmentId = e.id
       AND epf.paymentFrequencyId = 1
       AND epf.paymentCycleStartDate = '2026-12-01'
       AND epf.isDeleted = 0
      INNER JOIN payment_cycle octoberPc
        ON octoberPc.id = ${this.octoberCycleId}
       AND octoberPc.enrolmentId = e.id
       AND octoberPc.isDeleted = 0
      INNER JOIN payment_cycle novemberPc
        ON novemberPc.id = ${this.novemberCycleId}
       AND novemberPc.enrolmentId = e.id
       AND novemberPc.isDeleted = 1
      `,
      [this.migrationName],
    );
  }

  private async updateFrequencyAndCycles(
    queryRunner: QueryRunner,
    repaired: boolean,
  ): Promise<void> {
    const frequencyDateColumn = repaired
      ? 'b.newFrequencyStartDate'
      : 'b.oldFrequencyStartDate';
    const octoberEndColumn = repaired
      ? 'b.newOctoberCycleEndDate'
      : 'b.oldOctoberCycleEndDate';
    const novemberDeletedColumn = repaired
      ? 'b.newNovemberCycleIsDeleted'
      : 'b.oldNovemberCycleIsDeleted';

    await queryRunner.query(
      `
      UPDATE enrolment_payment_frequency epf
      INNER JOIN \`${this.backupTable}\` b
        ON b.frequencyRecordId = epf.id
       AND b.migrationName = ?
      SET epf.paymentCycleStartDate = ${frequencyDateColumn}
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE payment_cycle pc
      INNER JOIN \`${this.backupTable}\` b
        ON pc.id = ${this.octoberCycleId}
       AND b.enrolmentId = pc.enrolmentId
       AND b.migrationName = ?
      SET pc.endDate = ${octoberEndColumn}
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE payment_cycle pc
      INNER JOIN \`${this.backupTable}\` b
        ON pc.id = ${this.novemberCycleId}
       AND b.enrolmentId = pc.enrolmentId
       AND b.migrationName = ?
      SET pc.isDeleted = ${novemberDeletedColumn}
      `,
      [this.migrationName],
    );
  }

  private async updateLessons(
    queryRunner: QueryRunner,
    repaired: boolean,
  ): Promise<void> {
    const cycleColumn = repaired
      ? 'b.newPaymentCycleId'
      : 'b.oldPaymentCycleId';
    const dueDateColumn = repaired ? 'b.newDueDate' : 'b.oldDueDate';

    await queryRunner.query(
      `
      UPDATE payment_cycle_lesson pcl
      INNER JOIN \`${this.backupTable}\` b
        ON b.paymentCycleLessonId = pcl.id
       AND b.migrationName = ?
      SET pcl.paymentCycleId = ${cycleColumn}
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE lesson l
      INNER JOIN \`${this.backupTable}\` b
        ON b.lessonId = l.id
       AND b.migrationName = ?
      SET
        l.dueDate = ${dueDateColumn},
        l.updatedOn = b.oldLessonUpdatedOn
      `,
      [this.migrationName],
    );
  }

  private async assertState(
    queryRunner: QueryRunner,
    repaired: boolean,
  ): Promise<void> {
    const cycleColumn = repaired
      ? 'b.newPaymentCycleId'
      : 'b.oldPaymentCycleId';
    const dueDateColumn = repaired ? 'b.newDueDate' : 'b.oldDueDate';
    const frequencyDateColumn = repaired
      ? 'b.newFrequencyStartDate'
      : 'b.oldFrequencyStartDate';
    const octoberEndColumn = repaired
      ? 'b.newOctoberCycleEndDate'
      : 'b.oldOctoberCycleEndDate';
    const novemberDeletedColumn = repaired
      ? 'b.newNovemberCycleIsDeleted'
      : 'b.oldNovemberCycleIsDeleted';

    const rows = (await queryRunner.query(
      `
      SELECT COUNT(*) AS invalidCount
      FROM \`${this.backupTable}\` b
      LEFT JOIN lesson l ON l.id = b.lessonId
      LEFT JOIN private_lesson pl ON pl.id = b.privateLessonId
      LEFT JOIN payment_cycle_lesson pcl
        ON pcl.id = b.paymentCycleLessonId
       AND pcl.lessonId = b.lessonId
      LEFT JOIN payment_cycle linkedPc
        ON linkedPc.id = pcl.paymentCycleId
       AND linkedPc.enrolmentId = b.enrolmentId
       AND linkedPc.isDeleted = 0
      LEFT JOIN enrolment_payment_frequency epf
        ON epf.id = b.frequencyRecordId
       AND epf.isDeleted = 0
      LEFT JOIN payment_cycle octoberPc
        ON octoberPc.id = ${this.octoberCycleId}
       AND octoberPc.enrolmentId = b.enrolmentId
      LEFT JOIN payment_cycle novemberPc
        ON novemberPc.id = ${this.novemberCycleId}
       AND novemberPc.enrolmentId = b.enrolmentId
      WHERE b.migrationName = ?
        AND (
          l.id IS NULL
          OR NOT (DATE(l.dueDate) <=> ${dueDateColumn})
          OR NOT (l.updatedOn <=> b.oldLessonUpdatedOn)
          OR pcl.id IS NULL
          OR pcl.paymentCycleId <> ${cycleColumn}
          OR pcl.isDeleted <> 0
          OR linkedPc.id IS NULL
          OR epf.id IS NULL
          OR NOT (epf.paymentCycleStartDate <=> ${frequencyDateColumn})
          OR octoberPc.id IS NULL
          OR NOT (octoberPc.endDate <=> ${octoberEndColumn})
          OR octoberPc.isDeleted <> 0
          OR novemberPc.id IS NULL
          OR novemberPc.isDeleted <> ${novemberDeletedColumn}
          OR pl.id IS NULL
          OR NOT (pl.total <=> b.privateLessonTotal)
          OR NOT (pl.balance <=> b.privateLessonBalance)
          OR (
            SELECT COUNT(*)
            FROM payment_cycle_lesson activePcl
            INNER JOIN payment_cycle activePc
              ON activePc.id = activePcl.paymentCycleId
             AND activePc.enrolmentId = b.enrolmentId
             AND activePc.isDeleted = 0
            WHERE activePcl.lessonId = b.lessonId
              AND activePcl.isDeleted = 0
          ) <> 1
          OR (
            SELECT COUNT(*)
            FROM lesson_payment lp
            INNER JOIN payment pay
              ON pay.id = lp.paymentId
             AND pay.isDeleted = 0
            WHERE lp.lessonId = b.lessonId
              AND lp.isDeleted = 0
          ) <> b.lessonPaymentCount
          OR NOT ((
            SELECT COALESCE(SUM(lp.amount), 0.0000)
            FROM lesson_payment lp
            INNER JOIN payment pay
              ON pay.id = lp.paymentId
             AND pay.isDeleted = 0
            WHERE lp.lessonId = b.lessonId
              AND lp.isDeleted = 0
          ) <=> b.lessonPaymentTotal)
          OR (
            SELECT COUNT(*)
            FROM invoice_item_payment_cycle_lesson iipcl
            WHERE iipcl.paymentCycleLessonId = b.paymentCycleLessonId
          ) <> b.invoiceReferenceCount
        )
      `,
      [this.migrationName],
    )) as Array<{ invalidCount: number | string }>;

    if (Number(rows[0]?.invalidCount ?? 0) !== 0) {
      const state = repaired ? 'repaired' : 'rollback';
      throw new Error(
        `${this.migrationName}: ${state} state validation failed`,
      );
    }
  }

  private targetScope(): string {
    return this.lessonTargets
      .map(
        (target) =>
          `SELECT ${target.lessonId} AS lessonId, ${target.paymentCycleLessonId} AS paymentCycleLessonId, ${target.oldPaymentCycleId} AS oldPaymentCycleId, ${target.newPaymentCycleId} AS newPaymentCycleId, '${target.oldDueDate}' AS oldDueDate, '${target.newDueDate}' AS newDueDate, '${target.lessonDate}' AS lessonDate, '${target.originalDate}' AS originalDate, ${target.expectedBalance} AS expectedBalance, ${target.expectedPaymentTotal} AS expectedPaymentTotal`,
      )
      .join(' UNION ALL ');
  }
}
