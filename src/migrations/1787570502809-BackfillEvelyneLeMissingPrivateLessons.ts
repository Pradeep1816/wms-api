import { DataSource, MigrationInterface, QueryRunner } from 'typeorm';
import { CustomerBalanceCalculationRepository } from '../customer/repositories/customer-balance-calculation.repository';
import { LessonStatusEnum } from '../lesson/enums/lesson-status';

/**
 * One-off backfill for enrolment 16596 (Evelyne Le, course 16406).
 *
 * Changing this enrolment from semi-annual to annual triggered
 * EnrolmentPaymentFrequencyService.renewEnrolment() (auto_renewal 5926),
 * which created confirmed lessons and never inserted private_lesson.
 *
 * Safeguards:
 * 1. Exact scope — auto_renewal 5926 and lesson IDs 5322281–5322326 only.
 * 2. Invoice exclusion — skip any lesson linked to an invoice before deploy.
 * 3. Data guards — student 11134, customer 6638, old PF discount 6%,
 *    rate $65, duration 30 minutes, tax $0, status Scheduled.
 * 4. Post-insert — PF discount 10%, total/balance $29.25, due date and
 *    expiry (lesson date + 90 days) match the source lesson.
 */
export class BackfillEvelyneLeMissingPrivateLessons1787570502809
  implements MigrationInterface
{
  name = 'BackfillEvelyneLeMissingPrivateLessons1787570502809';

  private readonly migrationName =
    'BackfillEvelyneLeMissingPrivateLessons1787570502809';
  private readonly backupTable =
    'migration_evelyne_le_missing_private_lesson_backup';
  private readonly courseId = 16406;
  private readonly enrolmentId = 16596;
  private readonly autoRenewalId = 5926;
  private readonly firstLessonId = 5322281;
  private readonly lastLessonId = 5322326;
  private readonly studentId = 11134;
  private readonly customerId = 6638;
  private readonly oldPfDiscountPercent = 6;
  private readonly pfDiscountPercent = 10;
  private readonly programRate = 65;
  private readonly duration = '00:30:00';
  private readonly expectedTotal = '29.2500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createBackupTable(queryRunner);
    await this.assertNoExistingBackup(queryRunner);
    await this.backupEligibleCandidates(queryRunner);

    const candidateCount = await this.getBackupRowCount(queryRunner);
    if (candidateCount === 0) {
      return;
    }

    await this.assertBackupWithinExactScope(queryRunner);
    await this.assertCandidatesStillEligible(queryRunner, candidateCount);
    await this.updatePaymentFrequencyDiscounts(queryRunner);
    await this.insertPrivateLessons(queryRunner);
    await this.stampBackupPrivateLessonIds(queryRunner);
    await this.assertInsertApplied(queryRunner, candidateCount);
    await this.assertPostInsertValidation(queryRunner, candidateCount);
    await this.refreshCustomerBalance(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const candidateCount = await this.getBackupRowCount(queryRunner);
    if (candidateCount === 0) {
      return;
    }

    await this.assertInsertApplied(queryRunner, candidateCount);

    await queryRunner.query(
      `
      DELETE pl
      FROM private_lesson pl
      INNER JOIN \`${this.backupTable}\` b
        ON b.privateLessonId = pl.id
       AND b.migrationName = ?
      `,
      [this.migrationName],
    );

    await this.restorePaymentFrequencyDiscounts(queryRunner);
    await this.assertRollbackApplied(queryRunner);
    await this.refreshCustomerBalance(queryRunner);
    await queryRunner.query(
      `DELETE FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
  }

  private eligibleLessonFilter(): string {
    return `
      l.id BETWEEN ${this.firstLessonId} AND ${this.lastLessonId}
      AND arl.autoRenewalId = ${this.autoRenewalId}
      AND l.courseId = ${this.courseId}
      AND e.id = ${this.enrolmentId}
      AND e.courseId = ${this.courseId}
      AND e.studentId = ${this.studentId}
      AND e.isDeleted = 0
      AND e.isConfirmed = 1
      AND s.id = ${this.studentId}
      AND s.customer_id = ${this.customerId}
      AND l.isDeleted = 0
      AND l.isConfirmed = 1
      AND l.type = 1
      AND l.status = ${LessonStatusEnum.SCHEDULED}
      AND ABS(l.programRate - ${this.programRate}) < 0.00005
      AND l.duration = '${this.duration}'
      AND ABS(l.tax) < 0.00005
      AND pl.id IS NULL
      AND (
        SELECT COUNT(*)
        FROM lesson_discount ld
        WHERE ld.lessonId = l.id
      ) = 1
      AND pf.enrolmentId = ${this.enrolmentId}
      AND pf.type = 2
      AND pf.valueType = 1
      AND ABS(pf.value - ${this.oldPfDiscountPercent}) < 0.00005
      AND NOT EXISTS (
        SELECT 1
        FROM lesson_payment lp
        LEFT JOIN payment p
          ON p.id = lp.paymentId
        WHERE lp.lessonId = l.id
          AND lp.isDeleted = 0
          AND COALESCE(p.isDeleted, 0) = 0
          AND ABS(lp.amount) > 0.00005
      )
      AND NOT EXISTS (
        SELECT 1
        FROM invoice_item_lesson iil
        WHERE iil.lessonId = l.id
      )
    `;
  }

  private netPriceExpression(alias = 'l'): string {
    return `
      CAST(
        ROUND(
          (${alias}.programRate * TIME_TO_SEC(${alias}.duration) / 3600)
            * (1 - ${this.pfDiscountPercent} / 100)
            + ${alias}.tax,
          2
        ) AS DECIMAL(10,4)
      )
    `;
  }

  private async createBackupTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.backupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`lessonId\` int unsigned NOT NULL,
        \`privateLessonId\` int unsigned NULL,
        \`enrolmentId\` int unsigned NOT NULL,
        \`pfLessonDiscountId\` int unsigned NOT NULL,
        \`oldPfValue\` decimal(10,4) NOT NULL,
        \`lessonDate\` datetime NOT NULL,
        \`expiryDate\` datetime NOT NULL,
        \`dueDate\` date NOT NULL,
        \`total\` decimal(10,4) NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`lessonId\`),
        KEY \`idx_evelyne_le_pl_bk_plid\` (\`privateLessonId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);
  }

  private async assertNoExistingBackup(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const rowCount = await this.getBackupRowCount(queryRunner);
    if (rowCount !== 0) {
      throw new Error(
        `${this.migrationName}: backup already contains ${rowCount} rows`,
      );
    }
  }

  private async backupEligibleCandidates(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(
      `
      INSERT INTO \`${this.backupTable}\` (
        migrationName,
        lessonId,
        enrolmentId,
        pfLessonDiscountId,
        oldPfValue,
        lessonDate,
        expiryDate,
        dueDate,
        total
      )
      SELECT
        ? AS migrationName,
        l.id AS lessonId,
        e.id AS enrolmentId,
        pf.id AS pfLessonDiscountId,
        CAST(pf.value AS DECIMAL(10,4)) AS oldPfValue,
        l.date AS lessonDate,
        DATE_ADD(l.date, INTERVAL 90 DAY) AS expiryDate,
        DATE(l.dueDate) AS dueDate,
        ${this.netPriceExpression('l')} AS total
      FROM lesson l
      INNER JOIN enrolment e
        ON e.courseId = l.courseId
       AND e.id = ${this.enrolmentId}
      INNER JOIN student s
        ON s.id = e.studentId
      INNER JOIN auto_renewal_lessons arl
        ON arl.lessonId = l.id
       AND arl.autoRenewalId = ${this.autoRenewalId}
      INNER JOIN lesson_discount pf
        ON pf.lessonId = l.id
       AND pf.enrolmentId = ${this.enrolmentId}
       AND pf.type = 2
       AND pf.valueType = 1
      LEFT JOIN private_lesson pl
        ON pl.lessonId = l.id
      WHERE ${this.eligibleLessonFilter()}
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

  private async assertBackupWithinExactScope(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `
      SELECT
        COUNT(*) AS candidateCount,
        SUM(
          CASE
            WHEN b.lessonId NOT BETWEEN ${this.firstLessonId} AND ${this.lastLessonId}
              OR b.enrolmentId <> ${this.enrolmentId}
              OR arl.id IS NULL
            THEN 1 ELSE 0
          END
        ) AS outsideScope
      FROM \`${this.backupTable}\` b
      LEFT JOIN auto_renewal_lessons arl
        ON arl.lessonId = b.lessonId
       AND arl.autoRenewalId = ${this.autoRenewalId}
      WHERE b.migrationName = ?
      `,
      [this.migrationName],
    )) as Array<{
      candidateCount: number | string;
      outsideScope: number | string | null;
    }>;
    const [result] = rows;
    const outsideScope = Number(result?.outsideScope ?? 0);

    if (outsideScope !== 0) {
      throw new Error(
        `${this.migrationName}: backup contains ${outsideScope} lessons outside auto_renewal ${this.autoRenewalId} / lesson IDs ${this.firstLessonId}-${this.lastLessonId}`,
      );
    }
  }

  private async assertCandidatesStillEligible(
    queryRunner: QueryRunner,
    candidateCount: number,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `
      SELECT COUNT(*) AS eligibleCount
      FROM \`${this.backupTable}\` b
      INNER JOIN lesson l
        ON l.id = b.lessonId
      INNER JOIN enrolment e
        ON e.id = b.enrolmentId
      INNER JOIN student s
        ON s.id = e.studentId
      INNER JOIN auto_renewal_lessons arl
        ON arl.lessonId = l.id
       AND arl.autoRenewalId = ${this.autoRenewalId}
      INNER JOIN lesson_discount pf
        ON pf.id = b.pfLessonDiscountId
      LEFT JOIN private_lesson pl
        ON pl.lessonId = l.id
      WHERE b.migrationName = ?
        AND ${this.eligibleLessonFilter()}
        AND l.date = b.lessonDate
        AND ABS(pf.value - b.oldPfValue) < 0.00005
        AND ABS(b.total - ${this.expectedTotal}) < 0.00005
        AND ABS(b.total - (${this.netPriceExpression('l')})) < 0.00005
      `,
      [this.migrationName],
    )) as Array<{ eligibleCount: number | string }>;

    const eligibleCount = Number(rows[0]?.eligibleCount ?? 0);
    if (eligibleCount !== candidateCount) {
      throw new Error(
        `${this.migrationName}: eligibility expected ${candidateCount} lessons, found ${eligibleCount}`,
      );
    }
  }

  private async updatePaymentFrequencyDiscounts(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(
      `
      UPDATE lesson_discount pf
      INNER JOIN \`${this.backupTable}\` b
        ON b.pfLessonDiscountId = pf.id
       AND b.migrationName = ?
      SET pf.value = ${this.pfDiscountPercent}
      `,
      [this.migrationName],
    );
  }

  private async restorePaymentFrequencyDiscounts(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(
      `
      UPDATE lesson_discount pf
      INNER JOIN \`${this.backupTable}\` b
        ON b.pfLessonDiscountId = pf.id
       AND b.migrationName = ?
      SET pf.value = b.oldPfValue
      `,
      [this.migrationName],
    );
  }

  private async insertPrivateLessons(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT INTO private_lesson (lessonId, expiryDate, total, balance, dueDate)
      SELECT
        b.lessonId,
        b.expiryDate,
        b.total,
        b.total,
        b.dueDate
      FROM \`${this.backupTable}\` b
      LEFT JOIN private_lesson pl
        ON pl.lessonId = b.lessonId
      WHERE b.migrationName = ?
        AND pl.id IS NULL
      `,
      [this.migrationName],
    );
  }

  private async stampBackupPrivateLessonIds(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(
      `
      UPDATE \`${this.backupTable}\` b
      INNER JOIN private_lesson pl
        ON pl.lessonId = b.lessonId
      SET b.privateLessonId = pl.id
      WHERE b.migrationName = ?
        AND b.privateLessonId IS NULL
        AND ABS(pl.total - b.total) < 0.00005
        AND ABS(pl.balance - b.total) < 0.00005
      `,
      [this.migrationName],
    );
  }

  private async assertInsertApplied(
    queryRunner: QueryRunner,
    candidateCount: number,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `
      SELECT COUNT(*) AS insertedCount
      FROM \`${this.backupTable}\` b
      INNER JOIN private_lesson pl
        ON pl.id = b.privateLessonId
      WHERE b.migrationName = ?
        AND pl.lessonId = b.lessonId
        AND ABS(pl.total - b.total) < 0.00005
        AND ABS(pl.balance - b.total) < 0.00005
      `,
      [this.migrationName],
    )) as Array<{ insertedCount: number | string }>;

    const insertedCount = Number(rows[0]?.insertedCount ?? 0);
    if (insertedCount !== candidateCount) {
      throw new Error(
        `${this.migrationName}: expected ${candidateCount} inserted private_lesson rows, found ${insertedCount}`,
      );
    }
  }

  private async assertPostInsertValidation(
    queryRunner: QueryRunner,
    candidateCount: number,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `
      SELECT COUNT(*) AS validCount
      FROM \`${this.backupTable}\` b
      INNER JOIN lesson l
        ON l.id = b.lessonId
      INNER JOIN lesson_discount pf
        ON pf.id = b.pfLessonDiscountId
      INNER JOIN private_lesson pl
        ON pl.id = b.privateLessonId
      WHERE b.migrationName = ?
        AND ABS(pf.value - ${this.pfDiscountPercent}) < 0.00005
        AND ABS(pl.total - ${this.expectedTotal}) < 0.00005
        AND ABS(pl.balance - ${this.expectedTotal}) < 0.00005
        AND pl.dueDate = b.dueDate
        AND DATE(pl.dueDate) = DATE(l.dueDate)
        AND pl.expiryDate = b.expiryDate
        AND pl.expiryDate = DATE_ADD(l.date, INTERVAL 90 DAY)
      `,
      [this.migrationName],
    )) as Array<{ validCount: number | string }>;

    const validCount = Number(rows[0]?.validCount ?? 0);
    if (validCount !== candidateCount) {
      throw new Error(
        `${this.migrationName}: post-insert expected ${candidateCount} rows with 10% discount, $29.25 total/balance, and matching due/expiry, found ${validCount}`,
      );
    }
  }

  private async assertRollbackApplied(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `
      SELECT COUNT(*) AS remainingCount
      FROM \`${this.backupTable}\` b
      INNER JOIN private_lesson pl
        ON pl.lessonId = b.lessonId
      WHERE b.migrationName = ?
      `,
      [this.migrationName],
    )) as Array<{ remainingCount: number | string }>;

    const remainingCount = Number(rows[0]?.remainingCount ?? 0);
    if (remainingCount !== 0) {
      throw new Error(
        `${this.migrationName}: rollback left ${remainingCount} private_lesson rows`,
      );
    }
  }

  private async refreshCustomerBalance(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const customerBalanceRepository = new CustomerBalanceCalculationRepository(
      queryRunner.connection as DataSource,
    );
    const balance = await customerBalanceRepository.calculateBalance(
      this.customerId,
      queryRunner.manager,
    );
    await customerBalanceRepository.upsertCustomerAccountBalance(
      this.customerId,
      balance,
      { manager: queryRunner.manager },
    );
  }
}
