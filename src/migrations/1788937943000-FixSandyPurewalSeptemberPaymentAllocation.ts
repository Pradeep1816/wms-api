import { MigrationInterface, QueryRunner } from 'typeorm';
import { CustomerBalanceCalculationRepository } from '../customer/repositories/customer-balance-calculation.repository';

/**
 * One-off repair for Sandy Purewal's September 2026 recurring payment.
 *
 * The recurring-payment cron allocated $31.25 to orphan April lesson 5110852.
 * That lesson has no private_lesson row, so the allocation is hidden from the
 * payment screen. The same amount remained owing on valid September 24 lesson
 * 5122146.
 *
 * This migration moves the existing lesson_payment row to the valid lesson. It
 * does not create a private_lesson for the orphan and does not change the
 * payment amount, recurring-payment configuration, or enrolment links.
 */
export class FixSandyPurewalSeptemberPaymentAllocation1788937943000 implements MigrationInterface {
  name = 'FixSandyPurewalSeptemberPaymentAllocation1788937943000';

  private readonly migrationName =
    'FixSandyPurewalSeptemberPaymentAllocation1788937943000';
  private readonly backupTable =
    'migration_sandy_sep_payment_allocation_backup';
  private readonly customerId = 7768;
  private readonly customerRecurringPaymentId = 3472;
  private readonly recurringPaymentId = 74768;
  private readonly paymentId = 1805277;
  private readonly lessonPaymentId = 2015243;
  private readonly enrolmentId = 30968;
  private readonly oldLessonId = 5110852;
  private readonly newLessonId = 5122146;
  private readonly targetPrivateLessonId = 4671144;
  private readonly amount = '31.2500';
  private readonly paymentAmount = '255.0000';
  private readonly updatedByUserId = 727;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createBackupTable(queryRunner);
    await this.captureExpectedState(queryRunner);

    const capturedCount = await this.getBackupRowCount(queryRunner);
    if (capturedCount === 0) {
      await this.assertSafeNoOp(queryRunner);
      return;
    }
    if (capturedCount !== 1) {
      throw new Error(
        `${this.migrationName}: expected one captured allocation, found ${capturedCount}`,
      );
    }

    await this.assertPreMigrationState(queryRunner);
    await this.moveLessonPayment(queryRunner, true);
    await this.recalculateTargetPrivateLessonBalance(queryRunner);
    await this.recalculatePaymentBalance(queryRunner);
    await this.assertPostMigrationState(queryRunner);
    await this.refreshCustomerBalance(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const capturedCount = await this.getBackupRowCount(queryRunner);
    if (capturedCount === 0) {
      return;
    }
    if (capturedCount !== 1) {
      throw new Error(
        `${this.migrationName}: rollback expected one captured allocation, found ${capturedCount}`,
      );
    }

    await this.assertPostMigrationState(queryRunner);
    await this.moveLessonPayment(queryRunner, false);
    await this.recalculateTargetPrivateLessonBalance(queryRunner);
    await this.recalculatePaymentBalance(queryRunner);
    await this.assertRollbackState(queryRunner);
    await this.refreshCustomerBalance(queryRunner);

    await queryRunner.query(
      `DELETE FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
  }

  private async createBackupTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.backupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`lessonPaymentId\` int NOT NULL,
        \`paymentId\` int unsigned NOT NULL,
        \`recurringPaymentId\` int NOT NULL,
        \`customerRecurringPaymentId\` int NOT NULL,
        \`customerId\` int unsigned NOT NULL,
        \`enrolmentId\` int NOT NULL,
        \`oldLessonId\` int NOT NULL,
        \`newLessonId\` int NOT NULL,
        \`targetPrivateLessonId\` int unsigned NOT NULL,
        \`amount\` decimal(10,4) NOT NULL,
        \`oldLessonPaymentUpdatedOn\` timestamp NULL DEFAULT NULL,
        \`oldLessonPaymentUpdatedByUserId\` int NOT NULL,
        \`oldPaymentBalance\` decimal(10,4) NOT NULL,
        \`oldTargetPrivateLessonBalance\` decimal(10,4) NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`lessonPaymentId\`),
        KEY \`idx_sandy_sep_pay_bk_payment\` (\`paymentId\`),
        KEY \`idx_sandy_sep_pay_bk_old_lesson\` (\`oldLessonId\`),
        KEY \`idx_sandy_sep_pay_bk_new_lesson\` (\`newLessonId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);
  }

  private async captureExpectedState(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT INTO \`${this.backupTable}\` (
        migrationName,
        lessonPaymentId,
        paymentId,
        recurringPaymentId,
        customerRecurringPaymentId,
        customerId,
        enrolmentId,
        oldLessonId,
        newLessonId,
        targetPrivateLessonId,
        amount,
        oldLessonPaymentUpdatedOn,
        oldLessonPaymentUpdatedByUserId,
        oldPaymentBalance,
        oldTargetPrivateLessonBalance
      )
      SELECT
        ? AS migrationName,
        lp.id AS lessonPaymentId,
        p.id AS paymentId,
        rp.id AS recurringPaymentId,
        crp.id AS customerRecurringPaymentId,
        p.user_id AS customerId,
        lp.enrolmentId AS enrolmentId,
        oldLesson.id AS oldLessonId,
        newLesson.id AS newLessonId,
        targetPl.id AS targetPrivateLessonId,
        lp.amount AS amount,
        lp.updatedOn AS oldLessonPaymentUpdatedOn,
        lp.updatedByUserId AS oldLessonPaymentUpdatedByUserId,
        p.balance AS oldPaymentBalance,
        targetPl.balance AS oldTargetPrivateLessonBalance
      FROM lesson_payment lp
      INNER JOIN payment p
        ON p.id = lp.paymentId
       AND p.id = ${this.paymentId}
       AND p.user_id = ${this.customerId}
       AND p.isDeleted = 0
       AND ABS(p.amount - ${this.paymentAmount}) < 0.00005
       AND ABS(p.balance) < 0.00005
       AND DATE(p.date) = '2026-09-01'
      INNER JOIN recurring_payment rp
        ON rp.paymentId = p.id
       AND rp.id = ${this.recurringPaymentId}
       AND rp.customerRecurringPaymentId = ${this.customerRecurringPaymentId}
      INNER JOIN customer_recurring_payment crp
        ON crp.id = rp.customerRecurringPaymentId
       AND crp.customerId = ${this.customerId}
       AND crp.isDeleted = 0
      INNER JOIN enrolment e
        ON e.id = lp.enrolmentId
       AND e.id = ${this.enrolmentId}
       AND e.isDeleted = 0
       AND e.isConfirmed = 1
      INNER JOIN student s
        ON s.id = e.studentId
       AND s.customer_id = ${this.customerId}
      INNER JOIN lesson oldLesson
        ON oldLesson.id = lp.lessonId
       AND oldLesson.id = ${this.oldLessonId}
       AND oldLesson.courseId = e.courseId
       AND oldLesson.isDeleted = 0
       AND oldLesson.isConfirmed = 1
       AND oldLesson.status = 5
       AND DATE(oldLesson.date) = '2026-04-01'
       AND DATE(oldLesson.dueDate) = '2026-03-15'
      LEFT JOIN private_lesson oldPl
        ON oldPl.lessonId = oldLesson.id
      INNER JOIN lesson newLesson
        ON newLesson.id = ${this.newLessonId}
       AND newLesson.courseId = e.courseId
       AND newLesson.isDeleted = 0
       AND newLesson.isConfirmed = 1
       AND newLesson.status = 2
       AND DATE(newLesson.date) = '2026-09-24'
       AND DATE(newLesson.dueDate) = '2026-08-15'
      INNER JOIN private_lesson targetPl
        ON targetPl.lessonId = newLesson.id
       AND targetPl.id = ${this.targetPrivateLessonId}
       AND ABS(targetPl.total - ${this.amount}) < 0.00005
       AND ABS(targetPl.balance - ${this.amount}) < 0.00005
      WHERE lp.id = ${this.lessonPaymentId}
        AND lp.paymentId = ${this.paymentId}
        AND lp.enrolmentId = ${this.enrolmentId}
        AND lp.isDeleted = 0
        AND ABS(lp.amount - ${this.amount}) < 0.00005
        AND oldPl.id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM lesson_payment existingTargetLp
          WHERE existingTargetLp.lessonId = newLesson.id
            AND existingTargetLp.enrolmentId = e.id
            AND existingTargetLp.isDeleted = 0
        )
        AND (
          SELECT COUNT(*)
          FROM lesson_payment paymentLp
          WHERE paymentLp.paymentId = p.id
            AND paymentLp.isDeleted = 0
        ) = 8
        AND ABS((
          SELECT COALESCE(SUM(paymentLp.amount), 0)
          FROM lesson_payment paymentLp
          WHERE paymentLp.paymentId = p.id
            AND paymentLp.isDeleted = 0
        ) - ${this.paymentAmount}) < 0.00005
      `,
      [this.migrationName],
    );
  }

  private async getBackupRowCount(queryRunner: QueryRunner): Promise<number> {
    const rows = (await queryRunner.query(
      `SELECT COUNT(*) AS rowCount FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    )) as Array<{ rowCount: number | string }>;

    return Number(rows[0]?.rowCount ?? 0);
  }

  private async assertSafeNoOp(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `
      SELECT
        p.id AS paymentId,
        COALESCE(p.isDeleted, 0) AS paymentIsDeleted,
        lp.id AS lessonPaymentId,
        COALESCE(lp.isDeleted, 0) AS lessonPaymentIsDeleted,
        lp.lessonId AS currentLessonId,
        targetPl.id AS targetPrivateLessonId,
        targetPl.balance AS targetBalance
      FROM payment p
      LEFT JOIN lesson_payment lp
        ON lp.id = ${this.lessonPaymentId}
      LEFT JOIN private_lesson targetPl
        ON targetPl.id = ${this.targetPrivateLessonId}
       AND targetPl.lessonId = ${this.newLessonId}
      WHERE p.id = ${this.paymentId}
      `,
    )) as Array<{
      paymentId: number | string | null;
      paymentIsDeleted: number | string | null;
      lessonPaymentId: number | string | null;
      lessonPaymentIsDeleted: number | string | null;
      currentLessonId: number | string | null;
      targetPrivateLessonId: number | string | null;
      targetBalance: number | string | null;
    }>;

    const state = rows[0];
    if (!state?.paymentId || !state.lessonPaymentId) {
      return;
    }
    if (
      Number(state.paymentIsDeleted) !== 0 ||
      Number(state.lessonPaymentIsDeleted) !== 0
    ) {
      return;
    }
    if (
      Number(state.currentLessonId) === this.newLessonId &&
      Number(state.targetPrivateLessonId) === this.targetPrivateLessonId &&
      Math.abs(Number(state.targetBalance)) < 0.00005
    ) {
      return;
    }

    throw new Error(
      `${this.migrationName}: Sandy payment data exists but does not match the guarded pre-migration or already-repaired state`,
    );
  }

  private async assertPreMigrationState(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `
      SELECT
        COUNT(*) AS matchingRows,
        SUM(CASE WHEN lp.lessonId = b.oldLessonId THEN 1 ELSE 0 END) AS onOldLesson,
        SUM(CASE WHEN oldPl.id IS NULL THEN 1 ELSE 0 END) AS missingOldPrivateLesson,
        SUM(CASE WHEN targetPl.id = b.targetPrivateLessonId THEN 1 ELSE 0 END) AS validTargetPrivateLesson
      FROM \`${this.backupTable}\` b
      INNER JOIN lesson_payment lp
        ON lp.id = b.lessonPaymentId
       AND lp.paymentId = b.paymentId
       AND lp.enrolmentId = b.enrolmentId
       AND lp.isDeleted = 0
       AND ABS(lp.amount - b.amount) < 0.00005
      LEFT JOIN private_lesson oldPl
        ON oldPl.lessonId = b.oldLessonId
      INNER JOIN private_lesson targetPl
        ON targetPl.id = b.targetPrivateLessonId
       AND targetPl.lessonId = b.newLessonId
       AND ABS(targetPl.balance - b.oldTargetPrivateLessonBalance) < 0.00005
      WHERE b.migrationName = ?
      `,
      [this.migrationName],
    )) as Array<{
      matchingRows: number | string;
      onOldLesson: number | string | null;
      missingOldPrivateLesson: number | string | null;
      validTargetPrivateLesson: number | string | null;
    }>;

    const state = rows[0];
    if (
      Number(state?.matchingRows ?? 0) !== 1 ||
      Number(state?.onOldLesson ?? 0) !== 1 ||
      Number(state?.missingOldPrivateLesson ?? 0) !== 1 ||
      Number(state?.validTargetPrivateLesson ?? 0) !== 1
    ) {
      throw new Error(`${this.migrationName}: pre-migration validation failed`);
    }
  }

  private async moveLessonPayment(
    queryRunner: QueryRunner,
    toNewLesson: boolean,
  ): Promise<void> {
    const sourceColumn = toNewLesson ? 'oldLessonId' : 'newLessonId';
    const targetColumn = toNewLesson ? 'newLessonId' : 'oldLessonId';

    await queryRunner.query(
      `
      UPDATE lesson_payment lp
      INNER JOIN \`${this.backupTable}\` b
        ON b.lessonPaymentId = lp.id
       AND b.migrationName = ?
      SET
        lp.lessonId = b.${targetColumn},
        lp.updatedOn = ${toNewLesson ? 'CURRENT_TIMESTAMP' : 'b.oldLessonPaymentUpdatedOn'},
        lp.updatedByUserId = ${toNewLesson ? '?' : 'b.oldLessonPaymentUpdatedByUserId'}
      WHERE lp.id = ${this.lessonPaymentId}
        AND lp.lessonId = b.${sourceColumn}
        AND lp.paymentId = b.paymentId
        AND lp.enrolmentId = b.enrolmentId
        AND lp.isDeleted = 0
        AND ABS(lp.amount - b.amount) < 0.00005
      `,
      toNewLesson
        ? [this.migrationName, this.updatedByUserId]
        : [this.migrationName],
    );
  }

  private async recalculateTargetPrivateLessonBalance(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(
      `
      UPDATE private_lesson pl
      INNER JOIN \`${this.backupTable}\` b
        ON b.targetPrivateLessonId = pl.id
       AND b.migrationName = ?
      LEFT JOIN (
        SELECT
          lp.lessonId,
          ROUND(SUM(lp.amount), 4) AS totalPaid
        FROM lesson_payment lp
        INNER JOIN payment p
          ON p.id = lp.paymentId
         AND p.isDeleted = 0
        WHERE lp.lessonId = ${this.newLessonId}
          AND lp.isDeleted = 0
        GROUP BY lp.lessonId
      ) paid
        ON paid.lessonId = pl.lessonId
      SET pl.balance = CAST(
        ROUND(pl.total - COALESCE(paid.totalPaid, 0), 4)
        AS DECIMAL(10,4)
      )
      WHERE pl.id = ${this.targetPrivateLessonId}
        AND pl.lessonId = ${this.newLessonId}
      `,
      [this.migrationName],
    );
  }

  private async recalculatePaymentBalance(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(
      `
      UPDATE payment p
      INNER JOIN \`${this.backupTable}\` b
        ON b.paymentId = p.id
       AND b.migrationName = ?
      LEFT JOIN (
        SELECT
          ip.payment_id AS paymentId,
          ROUND(SUM(ip.amount), 4) AS totalApplied
        FROM invoice_payment ip
        WHERE ip.payment_id = ${this.paymentId}
          AND ip.isDeleted = 0
        GROUP BY ip.payment_id
      ) invoiceTotals
        ON invoiceTotals.paymentId = p.id
      LEFT JOIN (
        SELECT
          lp.paymentId,
          ROUND(SUM(lp.amount), 4) AS totalApplied
        FROM lesson_payment lp
        WHERE lp.paymentId = ${this.paymentId}
          AND lp.isDeleted = 0
        GROUP BY lp.paymentId
      ) lessonTotals
        ON lessonTotals.paymentId = p.id
      SET
        p.balance = CAST(
          ROUND(
            p.amount
              - COALESCE(invoiceTotals.totalApplied, 0)
              - COALESCE(lessonTotals.totalApplied, 0),
            4
          ) AS DECIMAL(10,4)
        ),
        p.updatedOn = CURRENT_TIMESTAMP,
        p.updatedByUserId = ?
      WHERE p.id = ${this.paymentId}
        AND p.user_id = ${this.customerId}
        AND p.isDeleted = 0
      `,
      [this.migrationName, this.updatedByUserId],
    );
  }

  private async assertPostMigrationState(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `
      SELECT
        MAX(CASE WHEN lp.id = b.lessonPaymentId AND lp.lessonId = b.newLessonId THEN 1 ELSE 0 END) AS movedRows,
        COUNT(DISTINCT oldLp.id) AS activeOldRows,
        paymentTotals.allocationCount AS paymentAllocationCount,
        paymentTotals.allocationTotal AS paymentAllocationTotal,
        visibleTotals.visibleCount AS visibleAllocationCount,
        visibleTotals.visibleTotal AS visibleAllocationTotal,
        MAX(targetPl.balance) AS targetBalance,
        MAX(p.balance) AS paymentBalance
      FROM \`${this.backupTable}\` b
      INNER JOIN lesson_payment lp
        ON lp.id = b.lessonPaymentId
       AND lp.paymentId = b.paymentId
       AND lp.enrolmentId = b.enrolmentId
       AND lp.isDeleted = 0
       AND ABS(lp.amount - b.amount) < 0.00005
      LEFT JOIN lesson_payment oldLp
        ON oldLp.lessonId = b.oldLessonId
       AND oldLp.paymentId = b.paymentId
       AND oldLp.isDeleted = 0
      INNER JOIN payment p
        ON p.id = b.paymentId
       AND p.isDeleted = 0
      INNER JOIN private_lesson targetPl
        ON targetPl.id = b.targetPrivateLessonId
       AND targetPl.lessonId = b.newLessonId
      INNER JOIN (
        SELECT
          paymentId,
          COUNT(*) AS allocationCount,
          SUM(amount) AS allocationTotal
        FROM lesson_payment
        WHERE paymentId = ${this.paymentId}
          AND isDeleted = 0
        GROUP BY paymentId
      ) paymentTotals
        ON paymentTotals.paymentId = b.paymentId
      INNER JOIN (
        SELECT
          lp2.paymentId,
          COUNT(*) AS visibleCount,
          SUM(lp2.amount) AS visibleTotal
        FROM lesson_payment lp2
        INNER JOIN private_lesson pl2
          ON pl2.lessonId = lp2.lessonId
        WHERE lp2.paymentId = ${this.paymentId}
          AND lp2.isDeleted = 0
        GROUP BY lp2.paymentId
      ) visibleTotals
        ON visibleTotals.paymentId = b.paymentId
      WHERE b.migrationName = ?
      GROUP BY
        paymentTotals.allocationCount,
        paymentTotals.allocationTotal,
        visibleTotals.visibleCount,
        visibleTotals.visibleTotal
      `,
      [this.migrationName],
    )) as Array<{
      movedRows: number | string | null;
      activeOldRows: number | string | null;
      paymentAllocationCount: number | string;
      paymentAllocationTotal: number | string;
      visibleAllocationCount: number | string;
      visibleAllocationTotal: number | string;
      targetBalance: number | string;
      paymentBalance: number | string;
    }>;

    const state = rows[0];
    if (
      Number(state?.movedRows ?? 0) !== 1 ||
      Number(state?.activeOldRows ?? 0) !== 0 ||
      Number(state?.paymentAllocationCount ?? 0) !== 8 ||
      Math.abs(Number(state?.paymentAllocationTotal ?? 0) - 255) >= 0.00005 ||
      Number(state?.visibleAllocationCount ?? 0) !== 8 ||
      Math.abs(Number(state?.visibleAllocationTotal ?? 0) - 255) >= 0.00005 ||
      Math.abs(Number(state?.targetBalance ?? 0)) >= 0.00005 ||
      Math.abs(Number(state?.paymentBalance ?? 0)) >= 0.00005
    ) {
      throw new Error(
        `${this.migrationName}: post-migration validation failed`,
      );
    }
  }

  private async assertRollbackState(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `
      SELECT
        SUM(CASE WHEN lp.lessonId = b.oldLessonId THEN 1 ELSE 0 END) AS restoredRows,
        MAX(targetPl.balance) AS targetBalance,
        MAX(b.oldTargetPrivateLessonBalance) AS expectedTargetBalance,
        MAX(p.balance) AS paymentBalance,
        MAX(b.oldPaymentBalance) AS expectedPaymentBalance
      FROM \`${this.backupTable}\` b
      INNER JOIN lesson_payment lp
        ON lp.id = b.lessonPaymentId
       AND lp.paymentId = b.paymentId
       AND lp.enrolmentId = b.enrolmentId
       AND lp.isDeleted = 0
       AND ABS(lp.amount - b.amount) < 0.00005
      INNER JOIN private_lesson targetPl
        ON targetPl.id = b.targetPrivateLessonId
       AND targetPl.lessonId = b.newLessonId
      INNER JOIN payment p
        ON p.id = b.paymentId
       AND p.isDeleted = 0
      WHERE b.migrationName = ?
      `,
      [this.migrationName],
    )) as Array<{
      restoredRows: number | string | null;
      targetBalance: number | string;
      expectedTargetBalance: number | string;
      paymentBalance: number | string;
      expectedPaymentBalance: number | string;
    }>;

    const state = rows[0];
    if (
      Number(state?.restoredRows ?? 0) !== 1 ||
      Math.abs(
        Number(state?.targetBalance ?? 0) -
          Number(state?.expectedTargetBalance ?? 0),
      ) >= 0.00005 ||
      Math.abs(
        Number(state?.paymentBalance ?? 0) -
          Number(state?.expectedPaymentBalance ?? 0),
      ) >= 0.00005
    ) {
      throw new Error(`${this.migrationName}: rollback validation failed`);
    }
  }

  private async refreshCustomerBalance(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const customerBalanceRepository = new CustomerBalanceCalculationRepository(
      queryRunner.connection,
    );
    const balance = await customerBalanceRepository.calculateBalance(
      this.customerId,
      queryRunner.manager,
    );

    await customerBalanceRepository.upsertCustomerAccountBalance(
      this.customerId,
      balance,
      {
        manager: queryRunner.manager,
        updatedByUserId: this.updatedByUserId,
      },
    );
  }
}
