import { MigrationInterface, QueryRunner } from 'typeorm';

type PricingTarget = readonly [
  lessonId: number,
  explodedBranchId: number,
  privateLessonId: number,
  discountId: number,
  oldProgramRate: string,
  newProgramRate: string,
  oldLessonTotal: string,
  oldPrivateTotal: string,
  oldPrivateBalance: string,
  discountValue: string,
];

/**
 * Repairs a historical one-cent overcharge across Emily Vivas's exploded
 * lesson pair. Both active 15-minute descendants were repriced to $72.50/hr
 * independently, producing $17.50 + $17.51 instead of the parent's $35.00.
 *
 * Current pricing code splits the $36.25 gross as $18.13 + $18.12 and the
 * $35.00 billed total as $17.50 + $17.50. This migration applies that same
 * result to the two verified, unpaid and uninvoiced historical lessons.
 */
export class RepairRichmondHillExplodedPairPricing1791500003000 implements MigrationInterface {
  name = 'RepairRichmondHillExplodedPairPricing1791500003000';

  private readonly migrationName =
    'RepairRichmondHillExplodedPairPricing1791500003000';
  private readonly backupTable = 'migration_rh_11170_exploded_price_backup';
  private readonly customerId = 11170;
  private readonly enrolmentId = 21536;
  private readonly courseId = 21265;
  private readonly locationId = 16;
  private readonly explodedParentId = 5077684;
  private readonly newLessonTotal = '17.5000';

  private readonly targets: readonly PricingTarget[] = [
    [
      5429167,
      5429165,
      4953298,
      5487033,
      '72.5000',
      '72.5200',
      '17.4300',
      '17.5000',
      '17.5000',
      '0.6300',
    ],
    [
      5429168,
      5429166,
      4953299,
      5487034,
      '72.5000',
      '72.4800',
      '17.4200',
      '17.5100',
      '17.5100',
      '0.6200',
    ],
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

    await this.captureBaseline(queryRunner);
    this.assertCompleteCount(
      await this.getBackupCount(queryRunner),
      'captured backup rows',
    );

    await this.applyPricing(queryRunner);
    await this.assertFinalState(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const backupCount = await this.getBackupCount(queryRunner);
    if (backupCount === 0) {
      return;
    }
    this.assertCompleteCount(backupCount, 'backup rows');
    await this.assertFinalState(queryRunner);

    await queryRunner.query(
      `
      UPDATE lesson l
      INNER JOIN \`${this.backupTable}\` b
        ON b.lessonId = l.id
       AND b.migrationName = ?
      SET
        l.programRate = b.oldProgramRate,
        l.total = b.oldLessonTotal,
        l.updatedOn = b.oldLessonUpdatedOn
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE private_lesson pl
      INNER JOIN \`${this.backupTable}\` b
        ON b.privateLessonId = pl.id
       AND b.lessonId = pl.lessonId
       AND b.migrationName = ?
      SET
        pl.total = b.oldPrivateTotal,
        pl.balance = b.oldPrivateBalance
      `,
      [this.migrationName],
    );

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
        \`discountId\` int unsigned NOT NULL,
        \`oldProgramRate\` decimal(12,4) NOT NULL,
        \`newProgramRate\` decimal(12,4) NOT NULL,
        \`oldLessonTotal\` decimal(12,4) NOT NULL,
        \`newLessonTotal\` decimal(12,4) NOT NULL,
        \`oldPrivateTotal\` decimal(12,4) NOT NULL,
        \`newPrivateTotal\` decimal(12,4) NOT NULL,
        \`oldPrivateBalance\` decimal(12,4) NOT NULL,
        \`newPrivateBalance\` decimal(12,4) NOT NULL,
        \`discountValue\` decimal(12,4) NOT NULL,
        \`oldLessonUpdatedOn\` timestamp NULL DEFAULT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`lessonId\`),
        KEY \`idx_rh11170_exploded_private\` (\`privateLessonId\`)
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
           AND l.courseId = ${this.courseId}
           AND l.courseId = e.courseId
           AND l.status = 1
           AND l.isExploded = 1
           AND l.isDeleted = 0
           AND l.isConfirmed = 1
           AND l.duration = '00:15:00'
           AND l.programRate = target.oldProgramRate
           AND l.total = target.oldLessonTotal
           AND e.id = ${this.enrolmentId}
           AND s.customer_id = ${this.customerId}
           AND c.locationId = ${this.locationId}
           AND pl.id = target.privateLessonId
           AND pl.total = target.oldPrivateTotal
           AND pl.balance = target.oldPrivateBalance
           AND ld.id = target.discountId
           AND ld.type = 3
           AND ld.valueType = 0
           AND ld.value = target.discountValue
           AND parentBranch.lessonId = ${this.explodedParentId}
           AND parentBranch.childLessonId = target.explodedBranchId
           AND parentBranch.depth = 1
           AND descendant.lessonId = target.explodedBranchId
           AND descendant.childLessonId = l.id
           AND (
             SELECT COUNT(*)
             FROM lesson_payment lp
             INNER JOIN payment p
               ON p.id = lp.paymentId
              AND p.isDeleted = 0
             WHERE lp.lessonId = l.id
               AND lp.isDeleted = 0
           ) = 0
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
          THEN 1
          ELSE 0
        END
      ), 0) AS matchingCount
      FROM (${this.targetScope()}) target
      LEFT JOIN lesson l ON l.id = target.lessonId
      LEFT JOIN enrolment e ON e.id = ${this.enrolmentId}
      LEFT JOIN student s ON s.id = e.studentId
      LEFT JOIN course c ON c.id = e.courseId
      LEFT JOIN private_lesson pl
        ON pl.id = target.privateLessonId
       AND pl.lessonId = target.lessonId
      LEFT JOIN lesson_discount ld
        ON ld.id = target.discountId
       AND ld.lessonId = target.lessonId
      LEFT JOIN lesson_hierarchy parentBranch
        ON parentBranch.lessonId = ${this.explodedParentId}
       AND parentBranch.childLessonId = target.explodedBranchId
       AND parentBranch.depth = 1
      LEFT JOIN lesson_hierarchy descendant
        ON descendant.lessonId = target.explodedBranchId
       AND descendant.childLessonId = target.lessonId
    `)) as Array<{ matchingCount: number | string }>;

    return Number(rows[0]?.matchingCount ?? 0);
  }

  private async captureBaseline(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT INTO \`${this.backupTable}\` (
        migrationName,
        lessonId,
        privateLessonId,
        discountId,
        oldProgramRate,
        newProgramRate,
        oldLessonTotal,
        newLessonTotal,
        oldPrivateTotal,
        newPrivateTotal,
        oldPrivateBalance,
        newPrivateBalance,
        discountValue,
        oldLessonUpdatedOn
      )
      SELECT
        ?,
        target.lessonId,
        target.privateLessonId,
        target.discountId,
        l.programRate,
        target.newProgramRate,
        l.total,
        ${this.newLessonTotal},
        pl.total,
        ${this.newLessonTotal},
        pl.balance,
        ${this.newLessonTotal},
        target.discountValue,
        l.updatedOn
      FROM (${this.targetScope()}) target
      INNER JOIN lesson l ON l.id = target.lessonId
      INNER JOIN private_lesson pl
        ON pl.id = target.privateLessonId
       AND pl.lessonId = target.lessonId
      `,
      [this.migrationName],
    );
  }

  private async applyPricing(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE lesson l
      INNER JOIN \`${this.backupTable}\` b
        ON b.lessonId = l.id
       AND b.migrationName = ?
      SET
        l.programRate = b.newProgramRate,
        l.total = b.newLessonTotal,
        l.updatedOn = b.oldLessonUpdatedOn
      WHERE l.programRate = b.oldProgramRate
        AND l.total = b.oldLessonTotal
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE private_lesson pl
      INNER JOIN \`${this.backupTable}\` b
        ON b.privateLessonId = pl.id
       AND b.lessonId = pl.lessonId
       AND b.migrationName = ?
      SET
        pl.total = b.newPrivateTotal,
        pl.balance = b.newPrivateBalance
      WHERE pl.total = b.oldPrivateTotal
        AND pl.balance = b.oldPrivateBalance
      `,
      [this.migrationName],
    );
  }

  private async assertFinalState(queryRunner: QueryRunner): Promise<void> {
    await this.assertBackupState(queryRunner, true);
  }

  private async assertRollbackState(queryRunner: QueryRunner): Promise<void> {
    await this.assertBackupState(queryRunner, false);
  }

  private async assertBackupState(
    queryRunner: QueryRunner,
    repaired: boolean,
  ): Promise<void> {
    const programRate = repaired ? 'b.newProgramRate' : 'b.oldProgramRate';
    const lessonTotal = repaired ? 'b.newLessonTotal' : 'b.oldLessonTotal';
    const privateTotal = repaired ? 'b.newPrivateTotal' : 'b.oldPrivateTotal';
    const privateBalance = repaired
      ? 'b.newPrivateBalance'
      : 'b.oldPrivateBalance';

    const rows = (await queryRunner.query(
      `
      SELECT COUNT(*) AS invalidCount
      FROM \`${this.backupTable}\` b
      LEFT JOIN lesson l ON l.id = b.lessonId
      LEFT JOIN private_lesson pl
        ON pl.id = b.privateLessonId
       AND pl.lessonId = b.lessonId
      LEFT JOIN lesson_discount ld
        ON ld.id = b.discountId
       AND ld.lessonId = b.lessonId
      WHERE b.migrationName = ?
        AND (
          l.id IS NULL
          OR l.programRate <> ${programRate}
          OR l.total <> ${lessonTotal}
          OR NOT (l.updatedOn <=> b.oldLessonUpdatedOn)
          OR pl.id IS NULL
          OR pl.total <> ${privateTotal}
          OR pl.balance <> ${privateBalance}
          OR ld.id IS NULL
          OR ld.type <> 3
          OR ld.valueType <> 0
          OR ld.value <> b.discountValue
          OR (
            SELECT COUNT(*)
            FROM lesson_payment lp
            INNER JOIN payment p
              ON p.id = lp.paymentId
             AND p.isDeleted = 0
            WHERE lp.lessonId = b.lessonId
              AND lp.isDeleted = 0
          ) <> 0
          OR (
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
            WHERE iil.lessonId = b.lessonId
          ) <> 0
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

    if (repaired) {
      const aggregateRows = (await queryRunner.query(
        `
        SELECT
          SUM(pl.total) AS combinedTotal,
          SUM(pl.balance) AS combinedBalance,
          SUM(ld.value) AS combinedDiscount
        FROM \`${this.backupTable}\` b
        INNER JOIN private_lesson pl
          ON pl.id = b.privateLessonId
         AND pl.lessonId = b.lessonId
        INNER JOIN lesson_discount ld
          ON ld.id = b.discountId
         AND ld.lessonId = b.lessonId
        WHERE b.migrationName = ?
        `,
        [this.migrationName],
      )) as Array<{
        combinedTotal: number | string;
        combinedBalance: number | string;
        combinedDiscount: number | string;
      }>;

      const aggregate = aggregateRows[0];
      if (
        Number(aggregate?.combinedTotal ?? 0) !== 35 ||
        Number(aggregate?.combinedBalance ?? 0) !== 35 ||
        Number(aggregate?.combinedDiscount ?? 0) !== 1.25
      ) {
        throw new Error(
          `${this.migrationName}: repaired aggregate validation failed`,
        );
      }
    }
  }

  private targetScope(): string {
    return this.targets
      .map(
        ([
          lessonId,
          explodedBranchId,
          privateLessonId,
          discountId,
          oldProgramRate,
          newProgramRate,
          oldLessonTotal,
          oldPrivateTotal,
          oldPrivateBalance,
          discountValue,
        ]) =>
          `SELECT ${lessonId} AS lessonId, ${explodedBranchId} AS explodedBranchId, ${privateLessonId} AS privateLessonId, ${discountId} AS discountId, ${oldProgramRate} AS oldProgramRate, ${newProgramRate} AS newProgramRate, ${oldLessonTotal} AS oldLessonTotal, ${oldPrivateTotal} AS oldPrivateTotal, ${oldPrivateBalance} AS oldPrivateBalance, ${discountValue} AS discountValue`,
      )
      .join(' UNION ALL ');
  }
}
