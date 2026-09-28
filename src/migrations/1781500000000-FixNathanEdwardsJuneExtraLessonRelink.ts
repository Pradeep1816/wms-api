import { DataSource, MigrationInterface, QueryRunner } from 'typeorm';
import { CustomerBalanceCalculationRepository } from '../customer/repositories/customer-balance-calculation.repository';

/**
 * One-off repair for Nathan Edwards' June extra lessons.
 *
 * The extra-lesson flow created a new active set of lessons for 2026-06-01,
 * 2026-06-08, 2026-06-15, and 2026-06-22, but the live lesson_payment rows
 * remained attached to the cancelled legacy lesson rows. The affected lessons
 * also drifted to a different lesson total than the original 12-month plan.
 *
 * Scope is intentionally limited to enrolment 27014 / customer 12909 so this
 * repair can only touch the Nathan Edwards June batch.
 *
 * This migration relinks the live lesson payments onto the active lessons,
 * restores the active lesson totals from the live payment amount (the source
 * lesson totals were later zeroed out by the extra-lesson flow), copies the
 * original lesson discounts onto the active lessons, and refreshes derived
 * balances so the active lessons reflect the pre-paid plan.
 */
export class FixNathanEdwardsJuneExtraLessonRelink1781500000000
  implements MigrationInterface
{
  name = 'FixNathanEdwardsJuneExtraLessonRelink1781500000000';

  private readonly migrationName =
    'FixNathanEdwardsJuneExtraLessonRelink1781500000000';
  private readonly backupTable =
    'migration_nathan_edwards_june_extra_lesson_relink_backup';
  private readonly discountBackupTable =
    'migration_nathan_edwards_june_extra_lesson_discount_backup';
  private readonly affectedEnrolmentId = 27014;
  private readonly affectedCustomerId = 12909;
  private readonly restoredLessonTotal = 29.25;

  private readonly lessonPairs = [
    { oldLessonId: 5222782, newLessonId: 5225701 },
    { oldLessonId: 5222783, newLessonId: 5225703 },
    { oldLessonId: 5222784, newLessonId: 5225704 },
    { oldLessonId: 5222785, newLessonId: 5225705 },
  ] as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createBackupTable(queryRunner);
    await this.createDiscountBackupTable(queryRunner);
    await this.backupLessonPayments(queryRunner);
    await this.backupLessonDiscounts(queryRunner);
    await this.relinkLessonPayments(queryRunner, true);
    await this.copyLessonDiscounts(queryRunner, true);
    await this.restoreOriginalTotals(queryRunner, true);
    await this.refreshBalances(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.relinkLessonPayments(queryRunner, false);
    await this.copyLessonDiscounts(queryRunner, false);
    await this.restoreOriginalTotals(queryRunner, false);
    await this.refreshBalances(queryRunner);

    await queryRunner.query(
      `DELETE FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );

    await queryRunner.query(
      `DELETE FROM \`${this.discountBackupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
  }

  private getOldLessonIds(): number[] {
    return this.lessonPairs.map((pair) => pair.oldLessonId);
  }

  private getNewLessonIds(): number[] {
    return this.lessonPairs.map((pair) => pair.newLessonId);
  }

  private getLessonPaymentIds(): number[] {
    return [1757779, 1757780, 1757781, 1757782];
  }

  private async createBackupTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.backupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`lessonPaymentId\` int unsigned NOT NULL,
        \`oldLessonId\` int unsigned NOT NULL,
        \`newLessonId\` int unsigned NOT NULL,
        \`paymentId\` int unsigned NOT NULL,
        \`lessonPaymentAmount\` decimal(10,4) NOT NULL,
        \`oldLessonTotal\` decimal(10,4) NOT NULL,
        \`newLessonTotal\` decimal(10,4) NOT NULL,
        \`oldPrivateLessonId\` int unsigned NOT NULL,
        \`newPrivateLessonId\` int unsigned NOT NULL,
        \`oldPrivateLessonTotal\` decimal(10,4) NOT NULL,
        \`newPrivateLessonTotal\` decimal(10,4) NOT NULL,
        \`oldPrivateLessonBalance\` decimal(10,4) NOT NULL,
        \`newPrivateLessonBalance\` decimal(10,4) NOT NULL,
        \`lessonPaymentCreatedOn\` timestamp NULL DEFAULT NULL,
        \`lessonPaymentUpdatedOn\` timestamp NULL DEFAULT NULL,
        \`lessonPaymentCreatedByUserId\` int NOT NULL,
        \`lessonPaymentUpdatedByUserId\` int NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`lessonPaymentId\`),
        KEY \`idx_nathan_june_lp_old\` (\`oldLessonId\`),
        KEY \`idx_nathan_june_lp_new\` (\`newLessonId\`),
        KEY \`idx_nathan_june_lp_payment\` (\`paymentId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);
  }

  private async createDiscountBackupTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.discountBackupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`lessonDiscountId\` int unsigned NOT NULL,
        \`oldLessonId\` int unsigned NOT NULL,
        \`newLessonId\` int unsigned NOT NULL,
        \`discountType\` int NOT NULL,
        \`discountValue\` decimal(10,4) NULL DEFAULT NULL,
        \`discountValueType\` tinyint(1) NOT NULL,
        \`discountEnrolmentId\` int NULL DEFAULT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`lessonDiscountId\`),
        KEY \`idx_nathan_june_discount_old\` (\`oldLessonId\`),
        KEY \`idx_nathan_june_discount_new\` (\`newLessonId\`),
        KEY \`idx_nathan_june_discount_type\` (\`discountType\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);
  }

  private async backupLessonPayments(queryRunner: QueryRunner): Promise<void> {
    const oldLessonIds = this.getOldLessonIds().join(', ');
    const lessonPaymentIds = this.getLessonPaymentIds().join(', ');

    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.backupTable}\` (
        migrationName,
        lessonPaymentId,
        oldLessonId,
        newLessonId,
        paymentId,
        lessonPaymentAmount,
        oldLessonTotal,
        newLessonTotal,
        oldPrivateLessonId,
        newPrivateLessonId,
        oldPrivateLessonTotal,
        newPrivateLessonTotal,
        oldPrivateLessonBalance,
        newPrivateLessonBalance,
        lessonPaymentCreatedOn,
        lessonPaymentUpdatedOn,
        lessonPaymentCreatedByUserId,
        lessonPaymentUpdatedByUserId
      )
      SELECT
        ? AS migrationName,
        lp.id AS lessonPaymentId,
        oldLesson.id AS oldLessonId,
        newLesson.id AS newLessonId,
        lp.paymentId AS paymentId,
        lp.amount AS lessonPaymentAmount,
        oldLesson.total AS oldLessonTotal,
        newLesson.total AS newLessonTotal,
        oldPrivateLesson.id AS oldPrivateLessonId,
        newPrivateLesson.id AS newPrivateLessonId,
        oldPrivateLesson.total AS oldPrivateLessonTotal,
        newPrivateLesson.total AS newPrivateLessonTotal,
        oldPrivateLesson.balance AS oldPrivateLessonBalance,
        newPrivateLesson.balance AS newPrivateLessonBalance,
        lp.createdOn AS lessonPaymentCreatedOn,
        lp.updatedOn AS lessonPaymentUpdatedOn,
        lp.createdByUserId AS lessonPaymentCreatedByUserId,
        lp.updatedByUserId AS lessonPaymentUpdatedByUserId
      FROM lesson_payment lp
      INNER JOIN lesson oldLesson
        ON oldLesson.id = lp.lessonId
       AND oldLesson.isDeleted = 0
       AND oldLesson.status = 4
       AND oldLesson.id IN (${oldLessonIds})
      INNER JOIN course c
        ON c.id = oldLesson.courseId
       AND c.isDeleted = 0
      INNER JOIN enrolment e
        ON e.courseId = c.id
       AND e.id = ${this.affectedEnrolmentId}
       AND e.isDeleted = 0
       AND e.isConfirmed = 1
      INNER JOIN student s
        ON s.id = e.studentId
       AND s.customer_id = ${this.affectedCustomerId}
      INNER JOIN lesson newLesson
        ON newLesson.id = CASE lp.lessonId
          WHEN 5222782 THEN 5225701
          WHEN 5222783 THEN 5225703
          WHEN 5222784 THEN 5225704
          WHEN 5222785 THEN 5225705
        END
       AND newLesson.isDeleted = 0
       AND newLesson.status = 2
      INNER JOIN private_lesson oldPrivateLesson
        ON oldPrivateLesson.lessonId = oldLesson.id
      INNER JOIN private_lesson newPrivateLesson
        ON newPrivateLesson.lessonId = newLesson.id
      WHERE lp.id IN (${lessonPaymentIds})
        AND lp.isDeleted = 0
      `,
      [this.migrationName],
    );
  }

  private async backupLessonDiscounts(queryRunner: QueryRunner): Promise<void> {
    const oldLessonIds = this.getOldLessonIds().join(', ');

    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.discountBackupTable}\` (
        migrationName,
        lessonDiscountId,
        oldLessonId,
        newLessonId,
        discountType,
        discountValue,
        discountValueType,
        discountEnrolmentId
      )
      SELECT
        ? AS migrationName,
        ld.id AS lessonDiscountId,
        oldLesson.id AS oldLessonId,
        newLesson.id AS newLessonId,
        ld.type AS discountType,
        ld.value AS discountValue,
        ld.valueType AS discountValueType,
        ld.enrolmentId AS discountEnrolmentId
      FROM lesson_discount ld
      INNER JOIN lesson oldLesson
        ON oldLesson.id = ld.lessonId
       AND oldLesson.isDeleted = 0
       AND oldLesson.status = 4
       AND oldLesson.id IN (${oldLessonIds})
      INNER JOIN course c
        ON c.id = oldLesson.courseId
       AND c.isDeleted = 0
      INNER JOIN enrolment e
        ON e.courseId = c.id
       AND e.id = ${this.affectedEnrolmentId}
       AND e.isDeleted = 0
       AND e.isConfirmed = 1
      INNER JOIN student s
        ON s.id = e.studentId
       AND s.customer_id = ${this.affectedCustomerId}
      INNER JOIN lesson newLesson
        ON newLesson.id = CASE ld.lessonId
          WHEN 5222782 THEN 5225701
          WHEN 5222783 THEN 5225703
          WHEN 5222784 THEN 5225704
          WHEN 5222785 THEN 5225705
        END
       AND newLesson.isDeleted = 0
       AND newLesson.status = 2
      `,
      [this.migrationName],
    );
  }

  private async relinkLessonPayments(
    queryRunner: QueryRunner,
    toNewLessons: boolean,
  ): Promise<void> {
    const joinColumn = toNewLessons ? 'newLessonId' : 'oldLessonId';

    await queryRunner.query(
      `
      UPDATE lesson_payment lp
      INNER JOIN \`${this.backupTable}\` b
        ON b.lessonPaymentId = lp.id
       AND b.migrationName = ?
      SET lp.lessonId = b.${joinColumn}
      WHERE lp.isDeleted = 0
      `,
      [this.migrationName],
    );
  }

  private async copyLessonDiscounts(
    queryRunner: QueryRunner,
    toNewLessons: boolean,
  ): Promise<void> {
    if (toNewLessons) {
      await queryRunner.query(
        `
        INSERT INTO lesson_discount (
          lessonId,
          value,
          enrolmentId,
          valueType,
          type
        )
        SELECT
          b.newLessonId,
          b.discountValue,
          b.discountEnrolmentId,
          b.discountValueType,
          b.discountType
        FROM \`${this.discountBackupTable}\` b
        WHERE b.migrationName = ?
          AND NOT EXISTS (
            SELECT 1
            FROM lesson_discount ld
            WHERE ld.lessonId = b.newLessonId
              AND ld.type = b.discountType
              AND COALESCE(ld.value, 0) = COALESCE(b.discountValue, 0)
              AND COALESCE(ld.valueType, 0) = COALESCE(b.discountValueType, 0)
              AND COALESCE(ld.enrolmentId, 0) = COALESCE(b.discountEnrolmentId, 0)
          )
        `,
        [this.migrationName],
      );
      return;
    }

    await queryRunner.query(
      `
      DELETE ld
      FROM lesson_discount ld
      INNER JOIN \`${this.discountBackupTable}\` b
        ON b.migrationName = ?
       AND ld.lessonId = b.newLessonId
       AND ld.type = b.discountType
       AND COALESCE(ld.value, 0) = COALESCE(b.discountValue, 0)
       AND COALESCE(ld.valueType, 0) = COALESCE(b.discountValueType, 0)
       AND COALESCE(ld.enrolmentId, 0) = COALESCE(b.discountEnrolmentId, 0)
      `,
      [this.migrationName],
    );
  }

  private async restoreOriginalTotals(
    queryRunner: QueryRunner,
    toNewLessons: boolean,
  ): Promise<void> {
    const lessonIds = this.getNewLessonIds();
    if (!lessonIds.length) {
      return;
    }

    const lessonIdList = lessonIds.join(', ');

    const sourceTotalExpression = toNewLessons
      ? String(this.restoredLessonTotal.toFixed(4))
      : 'b.newLessonTotal';
    const sourcePrivateTotalExpression = toNewLessons
      ? String(this.restoredLessonTotal.toFixed(4))
      : 'b.newPrivateLessonTotal';

    await queryRunner.query(
      `
      UPDATE lesson l
      INNER JOIN \`${this.backupTable}\` b
        ON b.migrationName = ?
       AND b.newLessonId = l.id
      SET l.total = ${sourceTotalExpression}
      WHERE l.id IN (${lessonIdList})
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE private_lesson pl
      INNER JOIN \`${this.backupTable}\` b
        ON b.migrationName = ?
       AND b.newLessonId = pl.lessonId
      SET pl.total = ${sourcePrivateTotalExpression}
      WHERE pl.lessonId IN (${lessonIdList})
      `,
      [this.migrationName],
    );
  }

  private async refreshBalances(queryRunner: QueryRunner): Promise<void> {
    const lessonIds = [...this.getOldLessonIds(), ...this.getNewLessonIds()];
    const lessonIdList = lessonIds.join(', ');

    await queryRunner.query(
      `
      UPDATE private_lesson pl
      LEFT JOIN (
        SELECT
          lessonId,
          ROUND(SUM(amount), 4) AS totalPaid
        FROM lesson_payment
        WHERE isDeleted = 0
          AND lessonId IN (${lessonIdList})
        GROUP BY lessonId
      ) paid
        ON paid.lessonId = pl.lessonId
      SET pl.balance = CAST(ROUND(pl.total - COALESCE(paid.totalPaid, 0), 4) AS DECIMAL(10,4))
      WHERE pl.lessonId IN (${lessonIdList})
      `,
    );

    await queryRunner.query(
      `
      UPDATE lesson l
      INNER JOIN private_lesson pl
        ON pl.lessonId = l.id
      SET l.paidStatus = CASE
        WHEN ROUND(pl.balance, 2) <= 0.09 THEN 1
        ELSE 3
      END
      WHERE l.id IN (${lessonIdList})
      `,
    );

    const customerBalanceRepository = new CustomerBalanceCalculationRepository(
      queryRunner.connection as DataSource,
    );

    const balance = await customerBalanceRepository.calculateBalance(
      this.affectedCustomerId,
      queryRunner.manager,
    );

    await customerBalanceRepository.upsertCustomerAccountBalance(
      this.affectedCustomerId,
      balance,
      {
        manager: queryRunner.manager,
      },
    );
  }
}
