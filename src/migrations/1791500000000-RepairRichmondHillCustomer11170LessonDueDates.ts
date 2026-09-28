import { MigrationInterface, QueryRunner } from 'typeorm';

type AuditedTarget = readonly [
  lessonId: number,
  enrolmentId: number,
  paymentCycleId: number,
  oldDueDate: string,
  newDueDate: string,
];

/**
 * Repairs existing lesson due dates for Richmond Hill customer 11170.
 *
 * The payment-frequency reset used a moved lesson's earlier originalDate as
 * the due-date basis for its entire cycle. The application now clamps that
 * basis to the later of the cycle start month and the earliest linked billing
 * occurrence month, but the existing rows are not recalculated automatically.
 *
 * This migration changes lesson.dueDate only. It intentionally does not alter
 * private_lesson dates, payment allocations, balances, invoices, or either
 * customer_recurring_payment configuration.
 */
export class RepairRichmondHillCustomer11170LessonDueDates1791500000000 implements MigrationInterface {
  name = 'RepairRichmondHillCustomer11170LessonDueDates1791500000000';

  private readonly migrationName =
    'RepairRichmondHillCustomer11170LessonDueDates1791500000000';
  private readonly backupTable = 'migration_rh_11170_lesson_due_date_backup';
  private readonly customerId = 11170;
  private readonly locationId = 16;
  private readonly enrolmentIds = [21420, 21536] as const;

  /** Rows captured in the September 18 production investigation. */
  private readonly auditedTargets: readonly AuditedTarget[] = [
    [4309201, 21420, 769753, '2026-06-15', '2026-08-15'],
    [5341507, 21420, 769753, '2026-06-15', '2026-08-15'],
    [4309202, 21420, 769753, '2026-06-15', '2026-08-15'],
    [5341508, 21420, 769753, '2026-06-15', '2026-08-15'],
    [4309203, 21420, 769754, '2026-06-15', '2026-09-15'],
    [5341509, 21420, 769754, '2026-06-15', '2026-09-15'],
    [4309204, 21420, 769754, '2026-06-15', '2026-09-15'],
    [5341512, 21420, 769754, '2026-06-15', '2026-09-15'],
    [4309205, 21420, 769754, '2026-06-15', '2026-09-15'],
    [5341513, 21420, 769754, '2026-06-15', '2026-09-15'],
    [4309206, 21420, 769754, '2026-06-15', '2026-09-15'],
    [5398165, 21420, 769754, '2026-06-15', '2026-09-15'],
    [5419350, 21536, 769761, '2026-07-15', '2026-08-15'],
    [5077683, 21536, 769761, '2026-07-15', '2026-08-15'],
    [5077685, 21536, 769761, '2026-07-15', '2026-08-15'],
    [5429164, 21536, 769761, '2026-07-15', '2026-08-15'],
    [5077686, 21536, 769761, '2026-07-15', '2026-08-15'],
    [5429167, 21536, 769761, '2026-07-15', '2026-08-15'],
    [5077687, 21536, 769762, '2026-08-15', '2026-09-15'],
    [5429168, 21536, 769762, '2026-08-15', '2026-09-15'],
    [5077688, 21536, 769762, '2026-08-15', '2026-09-15'],
    [5077689, 21536, 769762, '2026-08-15', '2026-09-15'],
    [5077690, 21536, 769762, '2026-08-15', '2026-09-15'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createBackupTable(queryRunner);

    const existingBackupCount = await this.getBackupCount(queryRunner);
    if (existingBackupCount > 0) {
      await this.assertBackupState(queryRunner, 'newDueDate');
      await this.assertNoRemainingIncorrectDueDates(queryRunner);
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
    await this.assertNoDuplicateActiveCycleLinks(queryRunner);
    await this.captureIncorrectDueDates(queryRunner);

    const capturedCount = await this.getBackupCount(queryRunner);
    if (capturedCount === 0) {
      await this.assertNoRemainingIncorrectDueDates(queryRunner);
      return;
    }

    await this.assertBackupState(queryRunner, 'oldLessonDueDate');
    await queryRunner.query(
      `
      UPDATE lesson l
      INNER JOIN \`${this.backupTable}\` b
        ON b.lessonId = l.id
       AND b.migrationName = ?
      SET
        l.dueDate = b.newDueDate,
        l.updatedOn = b.oldLessonUpdatedOn
      WHERE DATE(l.dueDate) = b.oldLessonDueDate
      `,
      [this.migrationName],
    );

    await this.assertBackupState(queryRunner, 'newDueDate');
    await this.assertNoRemainingIncorrectDueDates(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const backupCount = await this.getBackupCount(queryRunner);
    if (backupCount === 0) {
      return;
    }

    await this.assertBackupState(queryRunner, 'newDueDate');
    await queryRunner.query(
      `
      UPDATE lesson l
      INNER JOIN \`${this.backupTable}\` b
        ON b.lessonId = l.id
       AND b.migrationName = ?
      SET
        l.dueDate = b.oldLessonDueDate,
        l.updatedOn = b.oldLessonUpdatedOn
      WHERE DATE(l.dueDate) = b.newDueDate
      `,
      [this.migrationName],
    );
    await this.assertBackupState(queryRunner, 'oldLessonDueDate');

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
        \`customerId\` int unsigned NOT NULL,
        \`paymentCycleId\` int unsigned NOT NULL,
        \`paymentCycleLessonId\` int unsigned NOT NULL,
        \`cycleStartDate\` date NOT NULL,
        \`earliestBillingOccurrence\` date NOT NULL,
        \`oldLessonDueDate\` date NOT NULL,
        \`newDueDate\` date NOT NULL,
        \`oldLessonUpdatedOn\` timestamp NULL DEFAULT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`lessonId\`),
        KEY \`idx_rh11170_due_enrolment\` (\`enrolmentId\`),
        KEY \`idx_rh11170_due_cycle\` (\`paymentCycleId\`)
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

  private async assertTargetEnrolments(
    queryRunner: QueryRunner,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(`
      SELECT
        e.id AS enrolmentId,
        s.customer_id AS customerId,
        c.locationId AS locationId,
        e.paymentFrequencyId AS paymentFrequencyId,
        e.isDeleted AS isDeleted,
        e.isConfirmed AS isConfirmed
      FROM enrolment e
      INNER JOIN student s ON s.id = e.studentId
      INNER JOIN course c ON c.id = e.courseId
      WHERE e.id IN (${this.enrolmentIds.join(', ')})
      ORDER BY e.id
    `)) as Array<Record<string, number | string>>;

    const matchingRows = rows.filter(
      (row) =>
        this.enrolmentIds.includes(Number(row.enrolmentId) as 21420 | 21536) &&
        Number(row.customerId) === this.customerId &&
        Number(row.locationId) === this.locationId &&
        Number(row.paymentFrequencyId) === 1 &&
        Number(row.isDeleted) === 0 &&
        Number(row.isConfirmed) === 1,
    );

    if (matchingRows.length === 0) {
      return false;
    }

    if (
      rows.length !== this.enrolmentIds.length ||
      matchingRows.length !== this.enrolmentIds.length
    ) {
      throw new Error(
        `${this.migrationName}: expected ${this.enrolmentIds.length} matching target enrolments, found ${matchingRows.length}`,
      );
    }

    for (const enrolmentId of this.enrolmentIds) {
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
            WHEN l.id = a.lessonId
             AND e.id = a.enrolmentId
             AND s.customer_id = ${this.customerId}
             AND c.locationId = ${this.locationId}
             AND l.courseId = e.courseId
             AND l.isDeleted = 0
             AND l.isConfirmed = 1
             AND l.status <> 4
             AND pcl.paymentCycleId = a.paymentCycleId
             AND pcl.isDeleted = 0
             AND pc.enrolmentId = a.enrolmentId
             AND pc.isDeleted = 0
             AND cycleDue.newDueDate = a.newDueDate
             AND DATE(l.dueDate) IN (a.oldDueDate, a.newDueDate)
            THEN 1
            ELSE 0
          END
        ), 0) AS matchingCount
      FROM (${this.auditedTargetScope()}) a
      LEFT JOIN lesson l ON l.id = a.lessonId
      LEFT JOIN enrolment e ON e.id = a.enrolmentId
      LEFT JOIN student s ON s.id = e.studentId
      LEFT JOIN course c ON c.id = e.courseId
      LEFT JOIN payment_cycle_lesson pcl
        ON pcl.lessonId = l.id
       AND pcl.paymentCycleId = a.paymentCycleId
       AND pcl.isDeleted = 0
      LEFT JOIN payment_cycle pc
        ON pc.id = pcl.paymentCycleId
       AND pc.isDeleted = 0
      LEFT JOIN (${this.cycleDueDateScope()}) cycleDue
        ON cycleDue.paymentCycleId = pc.id
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

  private async assertNoDuplicateActiveCycleLinks(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT pcl.lessonId, COUNT(*) AS activeLinkCount
      FROM payment_cycle pc
      INNER JOIN payment_cycle_lesson pcl
        ON pcl.paymentCycleId = pc.id
       AND pcl.isDeleted = 0
      INNER JOIN lesson l
        ON l.id = pcl.lessonId
       AND l.isDeleted = 0
       AND l.isConfirmed = 1
       AND l.status <> 4
      WHERE pc.enrolmentId IN (${this.enrolmentIds.join(', ')})
        AND pc.isDeleted = 0
      GROUP BY pcl.lessonId
      HAVING COUNT(*) > 1
    `)) as Array<{
      lessonId: number | string;
      activeLinkCount: number | string;
    }>;

    if (rows.length > 0) {
      throw new Error(
        `${this.migrationName}: duplicate active payment-cycle links found for lesson(s) ${rows
          .map((row) => row.lessonId)
          .join(', ')}`,
      );
    }
  }

  private async captureIncorrectDueDates(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(
      `
      INSERT INTO \`${this.backupTable}\` (
        migrationName,
        lessonId,
        enrolmentId,
        customerId,
        paymentCycleId,
        paymentCycleLessonId,
        cycleStartDate,
        earliestBillingOccurrence,
        oldLessonDueDate,
        newDueDate,
        oldLessonUpdatedOn
      )
      SELECT
        ?,
        candidate.lessonId,
        candidate.enrolmentId,
        candidate.customerId,
        candidate.paymentCycleId,
        candidate.paymentCycleLessonId,
        candidate.cycleStartDate,
        candidate.earliestBillingOccurrence,
        candidate.oldLessonDueDate,
        candidate.newDueDate,
        candidate.oldLessonUpdatedOn
      FROM (${this.incorrectDueDateCandidateScope()}) candidate
      `,
      [this.migrationName],
    );
  }

  private async assertBackupState(
    queryRunner: QueryRunner,
    dueDateColumn: 'oldLessonDueDate' | 'newDueDate',
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `
      SELECT COUNT(*) AS invalidCount
      FROM \`${this.backupTable}\` b
      LEFT JOIN lesson l ON l.id = b.lessonId
      LEFT JOIN payment_cycle_lesson pcl
        ON pcl.id = b.paymentCycleLessonId
       AND pcl.lessonId = b.lessonId
       AND pcl.paymentCycleId = b.paymentCycleId
       AND pcl.isDeleted = 0
      LEFT JOIN payment_cycle pc
        ON pc.id = b.paymentCycleId
       AND pc.enrolmentId = b.enrolmentId
       AND pc.isDeleted = 0
      WHERE b.migrationName = ?
        AND (
          l.id IS NULL
          OR pcl.id IS NULL
          OR pc.id IS NULL
          OR NOT (DATE(l.dueDate) <=> b.${dueDateColumn})
        )
      `,
      [this.migrationName],
    )) as Array<{ invalidCount: number | string }>;

    if (Number(rows[0]?.invalidCount ?? 0) !== 0) {
      throw new Error(
        `${this.migrationName}: lesson or payment-cycle state changed after backup`,
      );
    }
  }

  private async assertNoRemainingIncorrectDueDates(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT COUNT(*) AS remainingCount
      FROM (${this.incorrectDueDateCandidateScope()}) candidate
    `)) as Array<{ remainingCount: number | string }>;

    if (Number(rows[0]?.remainingCount ?? 0) !== 0) {
      throw new Error(
        `${this.migrationName}: incorrect lesson due dates remain in the target scope`,
      );
    }
  }

  private auditedTargetScope(): string {
    return this.auditedTargets
      .map(
        ([lessonId, enrolmentId, paymentCycleId, oldDueDate, newDueDate]) =>
          `SELECT ${lessonId} AS lessonId, ${enrolmentId} AS enrolmentId, ${paymentCycleId} AS paymentCycleId, '${oldDueDate}' AS oldDueDate, '${newDueDate}' AS newDueDate`,
      )
      .join(' UNION ALL ');
  }

  /** Mirrors calculatePaymentCycleDueDate() without relying on server timezone. */
  private cycleDueDateScope(): string {
    return `
      SELECT
        cycle.paymentCycleId,
        cycle.enrolmentId,
        cycle.cycleStartDate,
        cycle.earliestBillingOccurrence,
        DATE(
          DATE_ADD(
            DATE_SUB(
              DATE_FORMAT(
                CASE
                  WHEN DATE_FORMAT(cycle.earliestBillingOccurrence, '%Y-%m-01')
                       > DATE_FORMAT(cycle.cycleStartDate, '%Y-%m-01')
                  THEN cycle.earliestBillingOccurrence
                  ELSE cycle.cycleStartDate
                END,
                '%Y-%m-01'
              ),
              INTERVAL 1 MONTH
            ),
            INTERVAL 14 DAY
          )
        ) AS newDueDate
      FROM (
        SELECT
          pc.id AS paymentCycleId,
          pc.enrolmentId,
          DATE(pc.startDate) AS cycleStartDate,
          MIN(DATE(COALESCE(linkedLesson.originalDate, linkedLesson.date)))
            AS earliestBillingOccurrence
        FROM payment_cycle pc
        INNER JOIN payment_cycle_lesson linkedPcl
          ON linkedPcl.paymentCycleId = pc.id
         AND linkedPcl.isDeleted = 0
        INNER JOIN lesson linkedLesson
          ON linkedLesson.id = linkedPcl.lessonId
         AND linkedLesson.isDeleted = 0
         AND linkedLesson.isConfirmed = 1
         AND linkedLesson.status <> 4
        WHERE pc.enrolmentId IN (${this.enrolmentIds.join(', ')})
          AND pc.isDeleted = 0
        GROUP BY pc.id, pc.enrolmentId, pc.startDate
      ) cycle
    `;
  }

  private incorrectDueDateCandidateScope(): string {
    return `
      SELECT
        l.id AS lessonId,
        e.id AS enrolmentId,
        s.customer_id AS customerId,
        cycleDue.paymentCycleId,
        pcl.id AS paymentCycleLessonId,
        cycleDue.cycleStartDate,
        cycleDue.earliestBillingOccurrence,
        DATE(l.dueDate) AS oldLessonDueDate,
        cycleDue.newDueDate,
        l.updatedOn AS oldLessonUpdatedOn
      FROM (${this.cycleDueDateScope()}) cycleDue
      INNER JOIN payment_cycle_lesson pcl
        ON pcl.paymentCycleId = cycleDue.paymentCycleId
       AND pcl.isDeleted = 0
      INNER JOIN lesson l
        ON l.id = pcl.lessonId
       AND l.isDeleted = 0
       AND l.isConfirmed = 1
       AND l.status <> 4
      INNER JOIN enrolment e
        ON e.id = cycleDue.enrolmentId
       AND e.id IN (${this.enrolmentIds.join(', ')})
       AND e.courseId = l.courseId
       AND e.isDeleted = 0
       AND e.isConfirmed = 1
       AND e.paymentFrequencyId = 1
      INNER JOIN student s
        ON s.id = e.studentId
       AND s.customer_id = ${this.customerId}
      INNER JOIN course c
        ON c.id = e.courseId
       AND c.locationId = ${this.locationId}
       AND c.isDeleted = 0
      WHERE NOT (DATE(l.dueDate) <=> cycleDue.newDueDate)
    `;
  }
}
