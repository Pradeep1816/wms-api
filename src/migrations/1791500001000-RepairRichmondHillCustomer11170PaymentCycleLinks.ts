import { MigrationInterface, QueryRunner } from 'typeorm';

type AuditedTarget = readonly [
  lessonId: number,
  enrolmentId: number,
  currentPaymentCycleId: number,
  expectedPaymentCycleId: number,
  currentDueDate: string,
  expectedDueDate: string,
];

/**
 * Restores the original billing-cycle membership of cross-month rescheduled
 * lessons for Richmond Hill customer 11170, enrolments 21420 and 21536.
 *
 * The lessons were delivered on later dates but retain earlier originalDate
 * values. A historical payment-frequency reset linked them by scheduled date,
 * causing them to appear in later billing cycles. Current application logic
 * links such lessons by originalDate.
 *
 * This migration changes only payment_cycle_lesson.isDeleted and
 * lesson.dueDate. Payment allocations, private-lesson totals/balances,
 * invoices, and recurring-payment configuration are not changed.
 */
export class RepairRichmondHillCustomer11170PaymentCycleLinks1791500001000 implements MigrationInterface {
  name = 'RepairRichmondHillCustomer11170PaymentCycleLinks1791500001000';

  private readonly migrationName =
    'RepairRichmondHillCustomer11170PaymentCycleLinks1791500001000';
  private readonly backupTable = 'migration_rh_11170_cycle_link_backup';
  private readonly customerId = 11170;
  private readonly locationId = 16;
  private readonly auditedEnrolmentIds = [21420, 21536] as const;

  private readonly auditedTargets: readonly AuditedTarget[] = [
    [5327591, 21420, 769752, 575171, '2026-07-15', '2026-02-15'],
    [5178819, 21420, 769751, 575173, '2026-06-15', '2026-04-15'],
    [5270336, 21420, 769752, 575174, '2026-07-15', '2026-05-15'],
    [5304154, 21420, 769751, 575174, '2026-06-15', '2026-05-15'],
    [5341507, 21420, 769753, 769751, '2026-08-15', '2026-06-15'],
    [5341508, 21420, 769753, 769751, '2026-08-15', '2026-06-15'],
    [5270340, 21420, 769752, 769751, '2026-07-15', '2026-06-15'],
    [5341509, 21420, 769754, 769751, '2026-09-15', '2026-06-15'],
    [5398165, 21420, 769754, 769751, '2026-09-15', '2026-06-15'],
    [5398166, 21420, 769755, 769751, '2026-10-15', '2026-06-15'],
    [5341512, 21420, 769754, 769752, '2026-09-15', '2026-07-15'],
    [5341513, 21420, 769754, 769752, '2026-09-15', '2026-07-15'],
    [5398173, 21420, 769755, 769753, '2026-10-15', '2026-08-15'],
    [5398175, 21420, 769755, 769753, '2026-10-15', '2026-08-15'],
    [5398176, 21420, 769755, 769753, '2026-10-15', '2026-08-15'],
    [5398177, 21420, 769756, 769753, '2026-11-15', '2026-08-15'],
    [5327590, 21536, 769760, 577703, '2026-07-15', '2026-06-15'],
    [5271001, 21536, 769760, 577703, '2026-07-15', '2026-06-15'],
    [5341514, 21536, 769760, 577703, '2026-07-15', '2026-06-15'],
    [5419350, 21536, 769761, 769760, '2026-08-15', '2026-07-15'],
    [5429164, 21536, 769761, 769760, '2026-08-15', '2026-07-15'],
    [5429168, 21536, 769762, 769761, '2026-09-15', '2026-08-15'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createBackupTable(queryRunner);

    const existingBackupCount = await this.getBackupCount(queryRunner);
    if (existingBackupCount > 0) {
      this.assertCompleteBackup(existingBackupCount);
      await this.assertFinalState(queryRunner);
      await this.assertStaleLinkCount(queryRunner, 0);
      return;
    }

    const hasTargetEnrolments = await this.assertTargetEnrolments(queryRunner);
    if (!hasTargetEnrolments) {
      return;
    }
    const hasAuditedBaseline = await this.assertAuditedBaseline(queryRunner);
    if (!hasAuditedBaseline) {
      return;
    }
    await this.assertStaleLinkCount(queryRunner, this.auditedTargets.length);
    await this.captureBaseline(queryRunner);

    const capturedCount = await this.getBackupCount(queryRunner);
    if (capturedCount !== this.auditedTargets.length) {
      throw new Error(
        `${this.migrationName}: expected ${this.auditedTargets.length} backup rows, captured ${capturedCount}`,
      );
    }

    await this.softDeleteCurrentLinks(queryRunner);
    await this.restoreExistingExpectedLinks(queryRunner);
    await this.createMissingExpectedLinks(queryRunner);
    await this.captureCreatedExpectedLinks(queryRunner);
    await this.updateLessonDueDates(queryRunner, 'newDueDate');

    await this.assertFinalState(queryRunner);
    await this.assertStaleLinkCount(queryRunner, 0);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const backupCount = await this.getBackupCount(queryRunner);
    if (backupCount === 0) {
      return;
    }
    this.assertCompleteBackup(backupCount);

    await this.assertFinalState(queryRunner);

    await queryRunner.query(
      `
      UPDATE payment_cycle_lesson pcl
      INNER JOIN \`${this.backupTable}\` b
        ON b.expectedPaymentCycleLessonId = pcl.id
       AND b.migrationName = ?
      SET pcl.isDeleted = 1
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE payment_cycle_lesson pcl
      INNER JOIN \`${this.backupTable}\` b
        ON b.currentPaymentCycleLessonId = pcl.id
       AND b.migrationName = ?
      SET pcl.isDeleted = 0
      `,
      [this.migrationName],
    );

    await this.updateLessonDueDates(queryRunner, 'oldLessonDueDate');
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
        \`enrolmentId\` int unsigned NOT NULL,
        \`currentPaymentCycleLessonId\` int unsigned NOT NULL,
        \`currentPaymentCycleId\` int unsigned NOT NULL,
        \`expectedPaymentCycleLessonId\` int unsigned NULL,
        \`expectedPaymentCycleId\` int unsigned NOT NULL,
        \`expectedLinkWasCreated\` tinyint unsigned NOT NULL DEFAULT 0,
        \`oldLessonDueDate\` date NOT NULL,
        \`newDueDate\` date NOT NULL,
        \`oldLessonUpdatedOn\` timestamp NULL DEFAULT NULL,
        \`lessonPaymentCount\` int unsigned NOT NULL,
        \`lessonPaymentTotal\` decimal(12,4) NOT NULL,
        \`privateLessonCount\` int unsigned NOT NULL,
        \`privateLessonId\` int unsigned NULL,
        \`privateLessonTotal\` decimal(12,4) NULL,
        \`privateLessonBalance\` decimal(12,4) NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`lessonId\`),
        KEY \`idx_rh11170_cycle_current\` (\`currentPaymentCycleLessonId\`),
        KEY \`idx_rh11170_cycle_expected\` (\`expectedPaymentCycleLessonId\`)
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

  private assertCompleteBackup(backupCount: number): void {
    if (backupCount !== this.auditedTargets.length) {
      throw new Error(
        `${this.migrationName}: expected ${this.auditedTargets.length} backup rows, found ${backupCount}`,
      );
    }
  }

  private async assertTargetEnrolments(
    queryRunner: QueryRunner,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(`
      SELECT
        e.id AS enrolmentId,
        s.customer_id AS customerId,
        c.locationId AS locationId,
        e.paymentFrequencyId,
        e.isDeleted,
        e.isConfirmed
      FROM enrolment e
      INNER JOIN student s ON s.id = e.studentId
      INNER JOIN course c ON c.id = e.courseId
      WHERE e.id IN (${this.auditedEnrolmentIds.join(', ')})
      ORDER BY e.id
      `)) as Array<Record<string, number | string>>;

    if (rows.length === 0) {
      return false;
    }

    if (rows.length !== this.auditedEnrolmentIds.length) {
      throw new Error(
        `${this.migrationName}: expected ${this.auditedEnrolmentIds.length} matching target enrolments, found ${rows.length}`,
      );
    }

    for (const enrolmentId of this.auditedEnrolmentIds) {
      const row = rows.find(
        (candidate) => Number(candidate.enrolmentId) === enrolmentId,
      );
      if (
        !row ||
        Number(row.customerId) !== this.customerId ||
        Number(row.locationId) !== this.locationId ||
        Number(row.paymentFrequencyId) !== 1 ||
        Number(row.isDeleted) !== 0 ||
        Number(row.isConfirmed) !== 1
      ) {
        throw new Error(
          `${this.migrationName}: enrolment ${enrolmentId} no longer matches the audited Richmond Hill monthly scope`,
        );
      }
    }

    return true;
  }

  private async assertAuditedBaseline(
    queryRunner: QueryRunner,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(`
      SELECT
        COUNT(*) AS auditedCount,
        COALESCE(SUM(
          CASE
            WHEN l.id = target.lessonId
             AND e.id = target.enrolmentId
             AND s.customer_id = ${this.customerId}
             AND c.locationId = ${this.locationId}
             AND l.courseId = e.courseId
             AND l.isDeleted = 0
             AND l.isConfirmed = 1
             AND l.status <> 4
             AND currentPcl.paymentCycleId = target.currentPaymentCycleId
             AND currentPcl.isDeleted = 0
             AND currentPc.enrolmentId = e.id
             AND currentPc.isDeleted = 0
             AND expectedPc.enrolmentId = e.id
             AND expectedPc.isDeleted = 0
             AND DATE(COALESCE(l.originalDate, l.date))
                 BETWEEN DATE(expectedPc.startDate) AND DATE(expectedPc.endDate)
             AND DATE(COALESCE(l.originalDate, l.date)) NOT BETWEEN
                 DATE(currentPc.startDate) AND DATE(currentPc.endDate)
             AND DATE(l.dueDate) = target.currentDueDate
             AND expectedActivePcl.id IS NULL
             AND (
               SELECT COUNT(*)
               FROM payment_cycle_lesson activePcl
               INNER JOIN payment_cycle activePc
                 ON activePc.id = activePcl.paymentCycleId
                AND activePc.isDeleted = 0
                AND activePc.enrolmentId = e.id
               WHERE activePcl.lessonId = l.id
                 AND activePcl.isDeleted = 0
             ) = 1
            THEN 1
            ELSE 0
          END
        ), 0) AS matchingCount
      FROM (${this.targetScope()}) target
      LEFT JOIN lesson l ON l.id = target.lessonId
      LEFT JOIN enrolment e ON e.id = target.enrolmentId
      LEFT JOIN student s ON s.id = e.studentId
      LEFT JOIN course c ON c.id = e.courseId
      LEFT JOIN payment_cycle_lesson currentPcl
        ON currentPcl.lessonId = target.lessonId
       AND currentPcl.paymentCycleId = target.currentPaymentCycleId
       AND currentPcl.isDeleted = 0
      LEFT JOIN payment_cycle currentPc
        ON currentPc.id = currentPcl.paymentCycleId
      LEFT JOIN payment_cycle expectedPc
        ON expectedPc.id = target.expectedPaymentCycleId
      LEFT JOIN payment_cycle_lesson expectedActivePcl
        ON expectedActivePcl.lessonId = target.lessonId
       AND expectedActivePcl.paymentCycleId = target.expectedPaymentCycleId
       AND expectedActivePcl.isDeleted = 0
    `)) as Array<{
      auditedCount: number | string;
      matchingCount: number | string;
    }>;

    const auditedCount = Number(rows[0]?.auditedCount ?? 0);
    const matchingCount = Number(rows[0]?.matchingCount ?? 0);
    if (matchingCount === 0) {
      return false;
    }
    if (
      auditedCount !== this.auditedTargets.length ||
      matchingCount !== this.auditedTargets.length
    ) {
      throw new Error(
        `${this.migrationName}: audited baseline partially matches; found ${matchingCount} of ${this.auditedTargets.length} targets`,
      );
    }

    return true;
  }

  private async assertStaleLinkCount(
    queryRunner: QueryRunner,
    expectedCount: number,
  ): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT COUNT(DISTINCT stale.lessonId) AS staleCount
      FROM (${this.staleLinkScope()}) stale
    `)) as Array<{ staleCount: number | string }>;

    const staleCount = Number(rows[0]?.staleCount ?? 0);
    if (staleCount !== expectedCount) {
      throw new Error(
        `${this.migrationName}: expected ${expectedCount} stale cycle links across the audited enrolments, found ${staleCount}`,
      );
    }
  }

  private async captureBaseline(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT INTO \`${this.backupTable}\` (
        migrationName,
        lessonId,
        enrolmentId,
        currentPaymentCycleLessonId,
        currentPaymentCycleId,
        expectedPaymentCycleLessonId,
        expectedPaymentCycleId,
        expectedLinkWasCreated,
        oldLessonDueDate,
        newDueDate,
        oldLessonUpdatedOn,
        lessonPaymentCount,
        lessonPaymentTotal,
        privateLessonCount,
        privateLessonId,
        privateLessonTotal,
        privateLessonBalance
      )
      SELECT
        ?,
        target.lessonId,
        target.enrolmentId,
        currentPcl.id,
        target.currentPaymentCycleId,
        (
          SELECT MAX(historicalPcl.id)
          FROM payment_cycle_lesson historicalPcl
          WHERE historicalPcl.lessonId = target.lessonId
            AND historicalPcl.paymentCycleId = target.expectedPaymentCycleId
        ),
        target.expectedPaymentCycleId,
        0,
        DATE(l.dueDate),
        target.expectedDueDate,
        l.updatedOn,
        (
          SELECT COUNT(*)
          FROM lesson_payment lp
          WHERE lp.lessonId = target.lessonId
            AND lp.isDeleted = 0
        ),
        (
          SELECT COALESCE(SUM(lp.amount), 0)
          FROM lesson_payment lp
          WHERE lp.lessonId = target.lessonId
            AND lp.isDeleted = 0
        ),
        (
          SELECT COUNT(*)
          FROM private_lesson countedPl
          WHERE countedPl.lessonId = target.lessonId
        ),
        pl.id,
        pl.total,
        pl.balance
      FROM (${this.targetScope()}) target
      INNER JOIN lesson l ON l.id = target.lessonId
      INNER JOIN payment_cycle_lesson currentPcl
        ON currentPcl.lessonId = target.lessonId
       AND currentPcl.paymentCycleId = target.currentPaymentCycleId
       AND currentPcl.isDeleted = 0
      LEFT JOIN private_lesson pl
        ON pl.id = (
          SELECT MAX(latestPl.id)
          FROM private_lesson latestPl
          WHERE latestPl.lessonId = target.lessonId
        )
      `,
      [this.migrationName],
    );
  }

  private async softDeleteCurrentLinks(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(
      `
      UPDATE payment_cycle_lesson pcl
      INNER JOIN \`${this.backupTable}\` b
        ON b.currentPaymentCycleLessonId = pcl.id
       AND b.migrationName = ?
      SET pcl.isDeleted = 1
      WHERE pcl.isDeleted = 0
      `,
      [this.migrationName],
    );
  }

  private async restoreExistingExpectedLinks(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(
      `
      UPDATE payment_cycle_lesson pcl
      INNER JOIN \`${this.backupTable}\` b
        ON b.expectedPaymentCycleLessonId = pcl.id
       AND b.migrationName = ?
      SET pcl.isDeleted = 0
      WHERE b.expectedPaymentCycleLessonId IS NOT NULL
      `,
      [this.migrationName],
    );
  }

  private async createMissingExpectedLinks(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(
      `
      INSERT INTO payment_cycle_lesson (paymentCycleId, lessonId, isDeleted)
      SELECT b.expectedPaymentCycleId, b.lessonId, 0
      FROM \`${this.backupTable}\` b
      WHERE b.migrationName = ?
        AND b.expectedPaymentCycleLessonId IS NULL
      `,
      [this.migrationName],
    );
  }

  private async captureCreatedExpectedLinks(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(
      `
      UPDATE \`${this.backupTable}\` b
      INNER JOIN payment_cycle_lesson pcl
        ON pcl.lessonId = b.lessonId
       AND pcl.paymentCycleId = b.expectedPaymentCycleId
       AND pcl.isDeleted = 0
      SET
        b.expectedPaymentCycleLessonId = pcl.id,
        b.expectedLinkWasCreated = 1
      WHERE b.migrationName = ?
        AND b.expectedPaymentCycleLessonId IS NULL
      `,
      [this.migrationName],
    );
  }

  private async updateLessonDueDates(
    queryRunner: QueryRunner,
    dueDateColumn: 'newDueDate' | 'oldLessonDueDate',
  ): Promise<void> {
    await queryRunner.query(
      `
      UPDATE lesson l
      INNER JOIN \`${this.backupTable}\` b
        ON b.lessonId = l.id
       AND b.migrationName = ?
      SET
        l.dueDate = b.${dueDateColumn},
        l.updatedOn = b.oldLessonUpdatedOn
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
    expectRepaired: boolean,
  ): Promise<void> {
    const activeLinkId = expectRepaired
      ? 'b.expectedPaymentCycleLessonId'
      : 'b.currentPaymentCycleLessonId';
    const inactiveLinkId = expectRepaired
      ? 'b.currentPaymentCycleLessonId'
      : 'b.expectedPaymentCycleLessonId';
    const dueDateColumn = expectRepaired
      ? 'b.newDueDate'
      : 'b.oldLessonDueDate';

    const rows = (await queryRunner.query(
      `
      SELECT COUNT(*) AS invalidCount
      FROM \`${this.backupTable}\` b
      LEFT JOIN lesson l ON l.id = b.lessonId
      LEFT JOIN payment_cycle_lesson activePcl
        ON activePcl.id = ${activeLinkId}
       AND activePcl.lessonId = b.lessonId
       AND activePcl.isDeleted = 0
      LEFT JOIN payment_cycle_lesson inactivePcl
        ON inactivePcl.id = ${inactiveLinkId}
       AND inactivePcl.lessonId = b.lessonId
       AND inactivePcl.isDeleted = 1
      LEFT JOIN payment_cycle activePc
        ON activePc.id = activePcl.paymentCycleId
       AND activePc.enrolmentId = b.enrolmentId
       AND activePc.isDeleted = 0
      LEFT JOIN private_lesson pl ON pl.id = b.privateLessonId
      WHERE b.migrationName = ?
        AND (
          l.id IS NULL
          OR activePcl.id IS NULL
          OR inactivePcl.id IS NULL
          OR activePc.id IS NULL
          OR NOT (DATE(l.dueDate) <=> ${dueDateColumn})
          OR NOT (l.updatedOn <=> b.oldLessonUpdatedOn)
          OR (
            SELECT COUNT(*)
            FROM payment_cycle_lesson onlyActivePcl
            INNER JOIN payment_cycle onlyActivePc
              ON onlyActivePc.id = onlyActivePcl.paymentCycleId
             AND onlyActivePc.isDeleted = 0
             AND onlyActivePc.enrolmentId = b.enrolmentId
            WHERE onlyActivePcl.lessonId = b.lessonId
              AND onlyActivePcl.isDeleted = 0
          ) <> 1
          OR (
            SELECT COUNT(*)
            FROM lesson_payment lp
            WHERE lp.lessonId = b.lessonId
              AND lp.isDeleted = 0
          ) <> b.lessonPaymentCount
          OR NOT ((
            SELECT COALESCE(SUM(lp.amount), 0)
            FROM lesson_payment lp
            WHERE lp.lessonId = b.lessonId
              AND lp.isDeleted = 0
          ) <=> b.lessonPaymentTotal)
          OR (
            SELECT COUNT(*)
            FROM private_lesson countedPl
            WHERE countedPl.lessonId = b.lessonId
          ) <> b.privateLessonCount
          OR NOT (pl.total <=> b.privateLessonTotal)
          OR NOT (pl.balance <=> b.privateLessonBalance)
        )
      `,
      [this.migrationName],
    )) as Array<{ invalidCount: number | string }>;

    if (Number(rows[0]?.invalidCount ?? 0) !== 0) {
      const state = expectRepaired ? 'repaired' : 'rollback';
      throw new Error(
        `${this.migrationName}: ${state} state validation failed`,
      );
    }
  }

  private targetScope(): string {
    return this.auditedTargets
      .map(
        ([
          lessonId,
          enrolmentId,
          currentPaymentCycleId,
          expectedPaymentCycleId,
          currentDueDate,
          expectedDueDate,
        ]) =>
          `SELECT ${lessonId} AS lessonId, ${enrolmentId} AS enrolmentId, ${currentPaymentCycleId} AS currentPaymentCycleId, ${expectedPaymentCycleId} AS expectedPaymentCycleId, '${currentDueDate}' AS currentDueDate, '${expectedDueDate}' AS expectedDueDate`,
      )
      .join(' UNION ALL ');
  }

  private staleLinkScope(): string {
    return `
      SELECT l.id AS lessonId
      FROM enrolment e
      INNER JOIN lesson l
        ON l.courseId = e.courseId
       AND l.isDeleted = 0
       AND l.isConfirmed = 1
       AND l.status <> 4
      INNER JOIN payment_cycle_lesson currentPcl
        ON currentPcl.lessonId = l.id
       AND currentPcl.isDeleted = 0
      INNER JOIN payment_cycle currentPc
        ON currentPc.id = currentPcl.paymentCycleId
       AND currentPc.enrolmentId = e.id
       AND currentPc.isDeleted = 0
      WHERE e.id IN (${this.auditedEnrolmentIds.join(', ')})
        AND DATE(COALESCE(l.originalDate, l.date)) NOT BETWEEN
            DATE(currentPc.startDate) AND DATE(currentPc.endDate)
    `;
  }
}
