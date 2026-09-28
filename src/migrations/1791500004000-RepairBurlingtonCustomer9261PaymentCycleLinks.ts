import { MigrationInterface, QueryRunner } from 'typeorm';

type CrossMonthTarget = Readonly<{
  lessonId: number;
  enrolmentId: number;
  currentPaymentCycleId: number;
  expectedPaymentCycleId: number;
  currentLessonDate: string;
  originalLessonDate: string;
  dueDate: string;
  privateLessonTotal: string;
}>;

type DuplicateLinkTarget = Readonly<{
  paymentCycleLessonId: number;
  keeperPaymentCycleLessonId: number;
  lessonId: number;
  enrolmentId: number;
  paymentCycleId: number;
  dueDate: string;
  privateLessonTotal: string;
}>;

/**
 * Repairs the audited payment-cycle graph for Burlington customer 9261.
 *
 * Three September 5 lessons were moved to October 31. Their August 15 due
 * dates and September payments are correct, but a historical frequency reset
 * linked them to October cycles. The current application rebuilds membership
 * from originalDate, so these existing links must be moved back to September.
 *
 * The same account also contains three redundant historical links with no
 * invoice references. They are soft-deleted while the oldest link for each
 * lesson remains active.
 *
 * Only payment_cycle_lesson.paymentCycleId/isDeleted are changed. Lesson due
 * dates, private-lesson balances, payments, allocations, invoices, and
 * recurring-payment configuration are preserved and verified.
 */
export class RepairBurlingtonCustomer9261PaymentCycleLinks1791500004000 implements MigrationInterface {
  name = 'RepairBurlingtonCustomer9261PaymentCycleLinks1791500004000';

  private readonly migrationName =
    'RepairBurlingtonCustomer9261PaymentCycleLinks1791500004000';
  private readonly backupTable = 'migration_burlington_9261_cycle_link_backup';
  private readonly customerId = 9261;
  private readonly locationId = 15;

  private readonly crossMonthTargets: readonly CrossMonthTarget[] = [
    {
      lessonId: 5400714,
      enrolmentId: 17564,
      currentPaymentCycleId: 759055,
      expectedPaymentCycleId: 759054,
      currentLessonDate: '2026-10-31 09:15:00',
      originalLessonDate: '2026-09-05 09:15:00',
      dueDate: '2026-08-15',
      privateLessonTotal: '46.8800',
    },
    {
      lessonId: 5400715,
      enrolmentId: 17565,
      currentPaymentCycleId: 759076,
      expectedPaymentCycleId: 759075,
      currentLessonDate: '2026-10-31 09:30:00',
      originalLessonDate: '2026-09-05 09:30:00',
      dueDate: '2026-08-15',
      privateLessonTotal: '31.2500',
    },
    {
      lessonId: 5400696,
      enrolmentId: 27104,
      currentPaymentCycleId: 762477,
      expectedPaymentCycleId: 762476,
      currentLessonDate: '2026-10-31 10:00:00',
      originalLessonDate: '2026-09-05 10:00:00',
      dueDate: '2026-08-15',
      privateLessonTotal: '31.2500',
    },
  ];

  private readonly duplicateLinkTargets: readonly DuplicateLinkTarget[] = [
    {
      paymentCycleLessonId: 2923110,
      keeperPaymentCycleLessonId: 2923109,
      lessonId: 4216512,
      enrolmentId: 17564,
      paymentCycleId: 567685,
      dueDate: '2024-11-15',
      privateLessonTotal: '15.6300',
    },
    {
      paymentCycleLessonId: 3098268,
      keeperPaymentCycleLessonId: 3098267,
      lessonId: 4457905,
      enrolmentId: 17564,
      paymentCycleId: 567689,
      dueDate: '2025-03-15',
      privateLessonTotal: '15.6300',
    },
    {
      paymentCycleLessonId: 3098269,
      keeperPaymentCycleLessonId: 3098267,
      lessonId: 4457905,
      enrolmentId: 17564,
      paymentCycleId: 567689,
      dueDate: '2025-03-15',
      privateLessonTotal: '15.6300',
    },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createBackupTable(queryRunner);

    const backupCount = await this.getBackupCount(queryRunner);
    if (backupCount > 0) {
      this.assertValidBackupCount(backupCount);
      await this.assertFinalState(queryRunner);
      return;
    }

    const crossMatchCount = await this.getCrossMatchCount(queryRunner);
    const duplicateMatchCount = await this.getDuplicateMatchCount(queryRunner);
    const crossFinalCount = await this.getCrossFinalCount(queryRunner);
    const duplicateFinalCount = await this.getDuplicateFinalCount(queryRunner);
    const totalPendingCount = crossMatchCount + duplicateMatchCount;

    if (
      crossMatchCount + crossFinalCount !== this.crossMonthTargets.length ||
      duplicateMatchCount + duplicateFinalCount !==
        this.duplicateLinkTargets.length
    ) {
      return;
    }

    if (totalPendingCount === 0) {
      await this.assertFinalState(queryRunner);
      return;
    }

    await this.captureBaseline(queryRunner);
    const capturedBackupCount = await this.getBackupCount(queryRunner);
    if (capturedBackupCount !== totalPendingCount) {
      throw new Error(
        `${this.migrationName}: expected ${totalPendingCount} captured backup rows, ` +
          `found ${capturedBackupCount}`,
      );
    }

    await queryRunner.query(
      `
      UPDATE payment_cycle_lesson pcl
      INNER JOIN \`${this.backupTable}\` b
        ON b.paymentCycleLessonId = pcl.id
       AND b.migrationName = ?
      SET
        pcl.paymentCycleId = b.newPaymentCycleId,
        pcl.isDeleted = b.newIsDeleted
      `,
      [this.migrationName],
    );

    await this.assertFinalState(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const backupCount = await this.getBackupCount(queryRunner);
    if (backupCount === 0) {
      return;
    }

    this.assertValidBackupCount(backupCount);
    await this.assertFinalState(queryRunner);

    await queryRunner.query(
      `
      UPDATE payment_cycle_lesson pcl
      INNER JOIN \`${this.backupTable}\` b
        ON b.paymentCycleLessonId = pcl.id
       AND b.migrationName = ?
      SET
        pcl.paymentCycleId = b.oldPaymentCycleId,
        pcl.isDeleted = b.oldIsDeleted
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
        \`paymentCycleLessonId\` int unsigned NOT NULL,
        \`changeType\` varchar(20) NOT NULL,
        \`lessonId\` int unsigned NOT NULL,
        \`enrolmentId\` int unsigned NOT NULL,
        \`oldPaymentCycleId\` int unsigned NOT NULL,
        \`newPaymentCycleId\` int unsigned NOT NULL,
        \`oldIsDeleted\` int NOT NULL,
        \`newIsDeleted\` int NOT NULL,
        \`lessonDueDate\` date NOT NULL,
        \`privateLessonId\` int unsigned NOT NULL,
        \`privateLessonTotal\` decimal(12,4) NOT NULL,
        \`privateLessonBalance\` decimal(12,4) NOT NULL,
        \`lessonPaymentCount\` int unsigned NOT NULL,
        \`lessonPaymentTotal\` decimal(12,4) NOT NULL,
        \`invoiceReferenceCount\` int unsigned NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`paymentCycleLessonId\`),
        KEY \`idx_burlington_9261_backup_lesson\` (\`lessonId\`)
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

  private assertValidBackupCount(count: number): void {
    const maximum =
      this.crossMonthTargets.length + this.duplicateLinkTargets.length;
    if (count < 1 || count > maximum) {
      throw new Error(
        `${this.migrationName}: expected between 1 and ${maximum} backup rows, ` +
          `found ${count}`,
      );
    }
  }

  private async getCrossMatchCount(queryRunner: QueryRunner): Promise<number> {
    const rows = (await queryRunner.query(`
      SELECT COALESCE(SUM(
        CASE
          WHEN l.id = target.lessonId
           AND e.id = target.enrolmentId
           AND e.paymentFrequencyId = 1
           AND e.isDeleted = 0
           AND e.isConfirmed = 1
           AND s.customer_id = ${this.customerId}
           AND c.locationId = ${this.locationId}
           AND l.courseId = e.courseId
           AND l.isDeleted = 0
           AND l.isConfirmed = 1
           AND l.status = 1
           AND l.date = target.currentLessonDate
           AND l.originalDate = target.originalLessonDate
           AND DATE(l.dueDate) = target.dueDate
           AND pl.total = target.privateLessonTotal
           AND pl.balance = 0.0000
           AND currentPc.enrolmentId = e.id
           AND currentPc.startDate = '2026-10-01'
           AND currentPc.endDate = '2026-10-31'
           AND currentPc.isDeleted = 0
           AND expectedPc.enrolmentId = e.id
           AND expectedPc.startDate = '2026-09-01'
           AND expectedPc.endDate = '2026-09-30'
           AND expectedPc.isDeleted = 0
           AND currentPcl.isDeleted = 0
           AND (
             SELECT COUNT(*)
             FROM payment_cycle_lesson activePcl
             WHERE activePcl.lessonId = target.lessonId
               AND activePcl.isDeleted = 0
           ) = 1
           AND (
             SELECT COUNT(*)
             FROM private_lesson scopedPl
             WHERE scopedPl.lessonId = target.lessonId
           ) = 1
          THEN 1
          ELSE 0
        END
      ), 0) AS matchingCrossCount
      FROM (${this.crossTargetScope()}) target
      LEFT JOIN lesson l ON l.id = target.lessonId
      LEFT JOIN enrolment e ON e.id = target.enrolmentId
      LEFT JOIN student s ON s.id = e.studentId
      LEFT JOIN course c ON c.id = e.courseId
      LEFT JOIN private_lesson pl ON pl.lessonId = l.id
      LEFT JOIN payment_cycle currentPc
        ON currentPc.id = target.currentPaymentCycleId
      LEFT JOIN payment_cycle expectedPc
        ON expectedPc.id = target.expectedPaymentCycleId
      LEFT JOIN payment_cycle_lesson currentPcl
        ON currentPcl.lessonId = target.lessonId
       AND currentPcl.paymentCycleId = target.currentPaymentCycleId
       AND currentPcl.isDeleted = 0
    `)) as Array<{ matchingCrossCount: number | string }>;

    return Number(rows[0]?.matchingCrossCount ?? 0);
  }

  private async getDuplicateMatchCount(
    queryRunner: QueryRunner,
  ): Promise<number> {
    const rows = (await queryRunner.query(`
      SELECT COALESCE(SUM(
        CASE
          WHEN duplicatePcl.id = target.paymentCycleLessonId
           AND duplicatePcl.lessonId = target.lessonId
           AND duplicatePcl.paymentCycleId = target.paymentCycleId
           AND duplicatePcl.isDeleted = 0
           AND keeperPcl.id = target.keeperPaymentCycleLessonId
           AND keeperPcl.lessonId = target.lessonId
           AND keeperPcl.paymentCycleId = target.paymentCycleId
           AND keeperPcl.isDeleted = 0
           AND pc.enrolmentId = target.enrolmentId
           AND pc.isDeleted = 0
           AND e.id = target.enrolmentId
           AND e.isDeleted = 0
           AND e.isConfirmed = 1
           AND s.customer_id = ${this.customerId}
           AND c.locationId = ${this.locationId}
           AND l.courseId = e.courseId
           AND l.isDeleted = 0
           AND DATE(l.dueDate) = target.dueDate
           AND pl.total = target.privateLessonTotal
           AND pl.balance = 0.0000
           AND NOT EXISTS (
             SELECT 1
             FROM invoice_item_payment_cycle_lesson iipcl
             WHERE iipcl.paymentCycleLessonId = duplicatePcl.id
           )
          THEN 1
          ELSE 0
        END
      ), 0) AS matchingDuplicateCount
      FROM (${this.duplicateTargetScope()}) target
      LEFT JOIN payment_cycle_lesson duplicatePcl
        ON duplicatePcl.id = target.paymentCycleLessonId
      LEFT JOIN payment_cycle_lesson keeperPcl
        ON keeperPcl.id = target.keeperPaymentCycleLessonId
      LEFT JOIN payment_cycle pc ON pc.id = target.paymentCycleId
      LEFT JOIN enrolment e ON e.id = target.enrolmentId
      LEFT JOIN student s ON s.id = e.studentId
      LEFT JOIN course c ON c.id = e.courseId
      LEFT JOIN lesson l ON l.id = target.lessonId
      LEFT JOIN private_lesson pl ON pl.lessonId = l.id
    `)) as Array<{ matchingDuplicateCount: number | string }>;

    return Number(rows[0]?.matchingDuplicateCount ?? 0);
  }

  private async getCrossFinalCount(queryRunner: QueryRunner): Promise<number> {
    const rows = (await queryRunner.query(`
      SELECT COALESCE(SUM(
        CASE
          WHEN l.id = target.lessonId
           AND e.id = target.enrolmentId
           AND e.paymentFrequencyId = 1
           AND e.isDeleted = 0
           AND e.isConfirmed = 1
           AND s.customer_id = ${this.customerId}
           AND c.locationId = ${this.locationId}
           AND l.courseId = e.courseId
           AND l.isDeleted = 0
           AND l.isConfirmed = 1
           AND l.status = 1
           AND l.date = target.currentLessonDate
           AND l.originalDate = target.originalLessonDate
           AND DATE(l.dueDate) = target.dueDate
           AND pl.total = target.privateLessonTotal
           AND pl.balance = 0.0000
           AND currentPc.enrolmentId = e.id
           AND currentPc.startDate = '2026-10-01'
           AND currentPc.endDate = '2026-10-31'
           AND currentPc.isDeleted = 0
           AND expectedPc.enrolmentId = e.id
           AND expectedPc.startDate = '2026-09-01'
           AND expectedPc.endDate = '2026-09-30'
           AND expectedPc.isDeleted = 0
           AND expectedPcl.isDeleted = 0
           AND NOT EXISTS (
             SELECT 1
             FROM payment_cycle_lesson stalePcl
             WHERE stalePcl.lessonId = target.lessonId
               AND stalePcl.paymentCycleId = target.currentPaymentCycleId
               AND stalePcl.isDeleted = 0
           )
           AND (
             SELECT COUNT(*)
             FROM payment_cycle_lesson activePcl
             WHERE activePcl.lessonId = target.lessonId
               AND activePcl.isDeleted = 0
           ) = 1
           AND (
             SELECT COUNT(*)
             FROM private_lesson scopedPl
             WHERE scopedPl.lessonId = target.lessonId
           ) = 1
          THEN 1
          ELSE 0
        END
      ), 0) AS matchingCrossFinalCount
      FROM (${this.crossTargetScope()}) target
      LEFT JOIN lesson l ON l.id = target.lessonId
      LEFT JOIN enrolment e ON e.id = target.enrolmentId
      LEFT JOIN student s ON s.id = e.studentId
      LEFT JOIN course c ON c.id = e.courseId
      LEFT JOIN private_lesson pl ON pl.lessonId = l.id
      LEFT JOIN payment_cycle currentPc
        ON currentPc.id = target.currentPaymentCycleId
      LEFT JOIN payment_cycle expectedPc
        ON expectedPc.id = target.expectedPaymentCycleId
      LEFT JOIN payment_cycle_lesson expectedPcl
        ON expectedPcl.lessonId = target.lessonId
       AND expectedPcl.paymentCycleId = target.expectedPaymentCycleId
       AND expectedPcl.isDeleted = 0
    `)) as Array<{ matchingCrossFinalCount: number | string }>;

    return Number(rows[0]?.matchingCrossFinalCount ?? 0);
  }

  private async getDuplicateFinalCount(
    queryRunner: QueryRunner,
  ): Promise<number> {
    const rows = (await queryRunner.query(`
      SELECT COALESCE(SUM(
        CASE
          WHEN duplicatePcl.id = target.paymentCycleLessonId
           AND duplicatePcl.lessonId = target.lessonId
           AND duplicatePcl.paymentCycleId = target.paymentCycleId
           AND duplicatePcl.isDeleted = 1
           AND keeperPcl.id = target.keeperPaymentCycleLessonId
           AND keeperPcl.lessonId = target.lessonId
           AND keeperPcl.paymentCycleId = target.paymentCycleId
           AND keeperPcl.isDeleted = 0
           AND pc.enrolmentId = target.enrolmentId
           AND pc.isDeleted = 0
           AND e.id = target.enrolmentId
           AND e.isDeleted = 0
           AND e.isConfirmed = 1
           AND s.customer_id = ${this.customerId}
           AND c.locationId = ${this.locationId}
           AND l.courseId = e.courseId
           AND l.isDeleted = 0
           AND DATE(l.dueDate) = target.dueDate
           AND pl.total = target.privateLessonTotal
           AND pl.balance = 0.0000
           AND NOT EXISTS (
             SELECT 1
             FROM invoice_item_payment_cycle_lesson iipcl
             WHERE iipcl.paymentCycleLessonId = duplicatePcl.id
           )
          THEN 1
          ELSE 0
        END
      ), 0) AS matchingDuplicateFinalCount
      FROM (${this.duplicateTargetScope()}) target
      LEFT JOIN payment_cycle_lesson duplicatePcl
        ON duplicatePcl.id = target.paymentCycleLessonId
      LEFT JOIN payment_cycle_lesson keeperPcl
        ON keeperPcl.id = target.keeperPaymentCycleLessonId
      LEFT JOIN payment_cycle pc ON pc.id = target.paymentCycleId
      LEFT JOIN enrolment e ON e.id = target.enrolmentId
      LEFT JOIN student s ON s.id = e.studentId
      LEFT JOIN course c ON c.id = e.courseId
      LEFT JOIN lesson l ON l.id = target.lessonId
      LEFT JOIN private_lesson pl ON pl.lessonId = l.id
    `)) as Array<{ matchingDuplicateFinalCount: number | string }>;

    return Number(rows[0]?.matchingDuplicateFinalCount ?? 0);
  }

  private async captureBaseline(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT INTO \`${this.backupTable}\` (
        migrationName,
        paymentCycleLessonId,
        changeType,
        lessonId,
        enrolmentId,
        oldPaymentCycleId,
        newPaymentCycleId,
        oldIsDeleted,
        newIsDeleted,
        lessonDueDate,
        privateLessonId,
        privateLessonTotal,
        privateLessonBalance,
        lessonPaymentCount,
        lessonPaymentTotal,
        invoiceReferenceCount
      )
      SELECT
        ?,
        pcl.id,
        target.changeType,
        target.lessonId,
        target.enrolmentId,
        pcl.paymentCycleId,
        target.newPaymentCycleId,
        pcl.isDeleted,
        target.newIsDeleted,
        l.dueDate,
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
        )
      FROM (${this.backupTargetScope()}) target
      INNER JOIN payment_cycle_lesson pcl
        ON pcl.id = target.paymentCycleLessonId
      INNER JOIN lesson l ON l.id = target.lessonId
      INNER JOIN private_lesson pl ON pl.lessonId = l.id
      `,
      [this.migrationName],
    );
  }

  private async assertFinalState(queryRunner: QueryRunner): Promise<void> {
    const invalidCount = await this.getInvalidStateCount(queryRunner, true);
    if (invalidCount !== 0) {
      throw new Error(
        `${this.migrationName}: ${invalidCount} repaired links failed final validation`,
      );
    }

    const structuralInvalidCount =
      await this.getFinalStructuralInvalidCount(queryRunner);
    if (structuralInvalidCount !== 0) {
      throw new Error(
        `${this.migrationName}: ${structuralInvalidCount} repaired link groups failed structural validation`,
      );
    }
  }

  private async assertRollbackState(queryRunner: QueryRunner): Promise<void> {
    const invalidCount = await this.getInvalidStateCount(queryRunner, false);
    if (invalidCount !== 0) {
      throw new Error(
        `${this.migrationName}: ${invalidCount} links failed rollback validation`,
      );
    }
  }

  private async getInvalidStateCount(
    queryRunner: QueryRunner,
    useNewState: boolean,
  ): Promise<number> {
    const cycleColumn = useNewState
      ? 'b.newPaymentCycleId'
      : 'b.oldPaymentCycleId';
    const deletedColumn = useNewState ? 'b.newIsDeleted' : 'b.oldIsDeleted';

    const rows = (await queryRunner.query(
      `
      SELECT COUNT(*) AS invalidCount
      FROM \`${this.backupTable}\` b
      LEFT JOIN payment_cycle_lesson pcl
        ON pcl.id = b.paymentCycleLessonId
      LEFT JOIN lesson l ON l.id = b.lessonId
      LEFT JOIN private_lesson pl ON pl.id = b.privateLessonId
      WHERE b.migrationName = ?
        AND (
          pcl.id IS NULL
          OR pcl.paymentCycleId <> ${cycleColumn}
          OR pcl.isDeleted <> ${deletedColumn}
          OR l.id IS NULL
          OR NOT (DATE(l.dueDate) <=> b.lessonDueDate)
          OR pl.id IS NULL
          OR NOT (pl.total <=> b.privateLessonTotal)
          OR NOT (pl.balance <=> b.privateLessonBalance)
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

    return Number(rows[0]?.invalidCount ?? 0);
  }

  private async getFinalStructuralInvalidCount(
    queryRunner: QueryRunner,
  ): Promise<number> {
    const crossRows = (await queryRunner.query(`
      SELECT COALESCE(SUM(
        CASE
          WHEN (
            SELECT COUNT(*)
            FROM payment_cycle_lesson activePcl
            WHERE activePcl.lessonId = target.lessonId
              AND activePcl.isDeleted = 0
          ) = 1
           AND EXISTS (
             SELECT 1
             FROM payment_cycle_lesson expectedPcl
             WHERE expectedPcl.lessonId = target.lessonId
               AND expectedPcl.paymentCycleId = target.expectedPaymentCycleId
               AND expectedPcl.isDeleted = 0
           )
           AND NOT EXISTS (
             SELECT 1
             FROM payment_cycle_lesson stalePcl
             WHERE stalePcl.lessonId = target.lessonId
               AND stalePcl.paymentCycleId = target.currentPaymentCycleId
               AND stalePcl.isDeleted = 0
           )
          THEN 0
          ELSE 1
        END
      ), 0) AS structuralInvalidCount
      FROM (${this.crossTargetScope()}) target
    `)) as Array<{ structuralInvalidCount: number | string }>;

    const duplicateRows = (await queryRunner.query(`
      SELECT COALESCE(SUM(
        CASE
          WHEN duplicatePcl.isDeleted = 1
           AND keeperPcl.isDeleted = 0
           AND keeperPcl.lessonId = target.lessonId
           AND keeperPcl.paymentCycleId = target.paymentCycleId
          THEN 0
          ELSE 1
        END
      ), 0) AS structuralInvalidCount
      FROM (${this.duplicateTargetScope()}) target
      LEFT JOIN payment_cycle_lesson duplicatePcl
        ON duplicatePcl.id = target.paymentCycleLessonId
      LEFT JOIN payment_cycle_lesson keeperPcl
        ON keeperPcl.id = target.keeperPaymentCycleLessonId
    `)) as Array<{ structuralInvalidCount: number | string }>;

    return (
      Number(crossRows[0]?.structuralInvalidCount ?? 0) +
      Number(duplicateRows[0]?.structuralInvalidCount ?? 0)
    );
  }

  private crossTargetScope(): string {
    return this.crossMonthTargets
      .map(
        (target) => `
        SELECT
          ${target.lessonId} AS lessonId,
          ${target.enrolmentId} AS enrolmentId,
          ${target.currentPaymentCycleId} AS currentPaymentCycleId,
          ${target.expectedPaymentCycleId} AS expectedPaymentCycleId,
          '${target.currentLessonDate}' AS currentLessonDate,
          '${target.originalLessonDate}' AS originalLessonDate,
          '${target.dueDate}' AS dueDate,
          ${target.privateLessonTotal} AS privateLessonTotal`,
      )
      .join('\nUNION ALL\n');
  }

  private duplicateTargetScope(): string {
    return this.duplicateLinkTargets
      .map(
        (target) => `
        SELECT
          ${target.paymentCycleLessonId} AS paymentCycleLessonId,
          ${target.keeperPaymentCycleLessonId} AS keeperPaymentCycleLessonId,
          ${target.lessonId} AS lessonId,
          ${target.enrolmentId} AS enrolmentId,
          ${target.paymentCycleId} AS paymentCycleId,
          '${target.dueDate}' AS dueDate,
          ${target.privateLessonTotal} AS privateLessonTotal`,
      )
      .join('\nUNION ALL\n');
  }

  private backupTargetScope(): string {
    const crossRows = this.crossMonthTargets.map(
      (target) => `
      SELECT
        currentPcl.id AS paymentCycleLessonId,
        'RELINK' AS changeType,
        target.lessonId,
        target.enrolmentId,
        target.expectedPaymentCycleId AS newPaymentCycleId,
        0 AS newIsDeleted
      FROM (${this.crossTargetScope()}) target
      INNER JOIN payment_cycle_lesson currentPcl
        ON currentPcl.lessonId = target.lessonId
       AND currentPcl.paymentCycleId = target.currentPaymentCycleId
       AND currentPcl.isDeleted = 0
      WHERE target.lessonId = ${target.lessonId}`,
    );

    const duplicateRows = this.duplicateLinkTargets.map(
      (target) => `
      SELECT
        duplicatePcl.id AS paymentCycleLessonId,
        'DEDUPLICATE' AS changeType,
        ${target.lessonId} AS lessonId,
        ${target.enrolmentId} AS enrolmentId,
        ${target.paymentCycleId} AS newPaymentCycleId,
        1 AS newIsDeleted
      FROM payment_cycle_lesson duplicatePcl
      WHERE duplicatePcl.id = ${target.paymentCycleLessonId}
        AND duplicatePcl.lessonId = ${target.lessonId}
        AND duplicatePcl.paymentCycleId = ${target.paymentCycleId}
        AND duplicatePcl.isDeleted = 0`,
    );

    return [...crossRows, ...duplicateRows].join('\nUNION ALL\n');
  }
}
