import { DataSource, MigrationInterface, QueryRunner } from 'typeorm';
import { CustomerBalanceCalculationRepository } from '../customer/repositories/customer-balance-calculation.repository';

/**
 * One-off repair for Nathan Edwards.
 *
 * The end-date extension rebuilt the active July/August lessons, but the
 * existing lesson_payment rows remained attached to the cancelled lesson IDs.
 * This migration derives the affected lesson pairings from the enrolment and
 * date window, moves those payment rows to the regenerated lessons, and then
 * refreshes the derived balances.
 */
export class FixNathanEdwardsLessonPaymentTransfer1780410000000
  implements MigrationInterface
{
  name = 'FixNathanEdwardsLessonPaymentTransfer1780410000000';

  private readonly migrationName =
    'FixNathanEdwardsLessonPaymentTransfer1780410000000';
  private readonly backupTable =
    'migration_nathan_edwards_lesson_payment_transfer_backup';
  private readonly affectedEnrolmentId = 27014;
  private readonly affectedCustomerId = 12909;
  private readonly lessonDateStart = '2026-07-06';
  private readonly lessonDateEnd = '2026-08-24';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await this.shouldSkipMigration(queryRunner)) {
      return;
    }

    await this.createBackupTable(queryRunner);
    await this.backupLessonPayments(queryRunner);
    await this.transferLessonPayments(queryRunner, true);
    await this.refreshLessonBalances(queryRunner, 'newLessonId');
    await this.refreshLessonBalances(queryRunner, 'oldLessonId');
    await this.refreshCustomerBalances(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.transferLessonPayments(queryRunner, false);
    await this.refreshLessonBalances(queryRunner, 'oldLessonId');
    await this.refreshLessonBalances(queryRunner, 'newLessonId');
    await this.refreshCustomerBalances(queryRunner);

    await queryRunner.query(
      `DELETE FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
  }

  private async createBackupTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.backupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`lessonPaymentId\` int unsigned NOT NULL,
        \`oldLessonId\` int unsigned NOT NULL,
        \`newLessonId\` int unsigned NOT NULL,
        \`paymentId\` int unsigned NOT NULL,
        \`enrolmentId\` int unsigned NOT NULL,
        \`amount\` decimal(10,4) NOT NULL,
        \`date\` timestamp NOT NULL,
        \`isDeleted\` tinyint(1) NOT NULL,
        \`createdOn\` timestamp NULL DEFAULT NULL,
        \`updatedOn\` timestamp NULL DEFAULT NULL,
        \`createdByUserId\` int NOT NULL,
        \`updatedByUserId\` int NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`lessonPaymentId\`),
        KEY \`idx_nathan_lp_old\` (\`oldLessonId\`),
        KEY \`idx_nathan_lp_new\` (\`newLessonId\`),
        KEY \`idx_nathan_lp_enr\` (\`enrolmentId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);
  }

  private getScopeJoinSql(): string {
    return `
      INNER JOIN lesson oldLesson
        ON oldLesson.id = lp.lessonId
       AND oldLesson.isDeleted = 0
       AND oldLesson.status = 4
       AND DATE(oldLesson.date) BETWEEN '${this.lessonDateStart}' AND '${this.lessonDateEnd}'
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
        ON newLesson.courseId = c.id
       AND newLesson.isDeleted = 0
       AND newLesson.isConfirmed = 1
       AND newLesson.status = 2
       AND DATE(newLesson.date) = DATE(oldLesson.date)
    `;
  }

  private async shouldSkipMigration(queryRunner: QueryRunner): Promise<boolean> {
    const rows = await queryRunner.query(
      `
      SELECT
        COUNT(DISTINCT oldLesson.id) AS oldLessonCount,
        COUNT(DISTINCT newLesson.id) AS newLessonCount,
        COUNT(DISTINCT lp.id) AS lessonPaymentCount,
        COUNT(DISTINCT s.customer_id) AS customerCount,
        MAX(s.customer_id) AS customerId
      FROM lesson_payment lp
      ${this.getScopeJoinSql()}
      WHERE lp.isDeleted = 0
      `,
    );

    const scope = rows[0] ?? {};
    const oldLessonCount = Number(scope.oldLessonCount ?? 0);
    const newLessonCount = Number(scope.newLessonCount ?? 0);
    const lessonPaymentCount = Number(scope.lessonPaymentCount ?? 0);
    const customerCount = Number(scope.customerCount ?? 0);
    const customerId = Number(scope.customerId ?? 0);

    if (
      oldLessonCount === 0 &&
      newLessonCount === 0 &&
      lessonPaymentCount === 0 &&
      customerCount === 0 &&
      customerId === 0
    ) {
      return true;
    }

    if (
      oldLessonCount !== 8 ||
      newLessonCount !== 8 ||
      lessonPaymentCount !== 8 ||
      customerCount !== 1 ||
      customerId !== this.affectedCustomerId
    ) {
      throw new Error(
        `Unexpected migration scope for Nathan Edwards repair. ` +
          `Expected 8 old lessons, 8 new lessons, 8 lesson payments, customer ${this.affectedCustomerId}. ` +
          `Got oldLessonCount=${oldLessonCount}, newLessonCount=${newLessonCount}, lessonPaymentCount=${lessonPaymentCount}, customerCount=${customerCount}, customerId=${customerId}.`,
      );
    }

    return false;
  }

  private async backupLessonPayments(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.backupTable}\` (
        migrationName,
        lessonPaymentId,
        oldLessonId,
        newLessonId,
        paymentId,
        enrolmentId,
        amount,
        date,
        isDeleted,
        createdOn,
        updatedOn,
        createdByUserId,
        updatedByUserId
      )
      SELECT
        ? AS migrationName,
        lp.id AS lessonPaymentId,
        lp.lessonId AS oldLessonId,
        newLesson.id AS newLessonId,
        lp.paymentId AS paymentId,
        lp.enrolmentId AS enrolmentId,
        lp.amount AS amount,
        lp.date AS date,
        lp.isDeleted AS isDeleted,
        lp.createdOn AS createdOn,
        lp.updatedOn AS updatedOn,
        lp.createdByUserId AS createdByUserId,
        lp.updatedByUserId AS updatedByUserId
      FROM lesson_payment lp
      ${this.getScopeJoinSql()}
      WHERE lp.isDeleted = 0
      `,
      [this.migrationName],
    );
  }

  private async transferLessonPayments(
    queryRunner: QueryRunner,
    toNewLessons: boolean,
  ): Promise<void> {
    const lessonColumn = toNewLessons ? 'newLessonId' : 'oldLessonId';

    await queryRunner.query(
      `
      UPDATE lesson_payment lp
      INNER JOIN \`${this.backupTable}\` b
        ON b.lessonPaymentId = lp.id
       AND b.migrationName = ?
      SET lp.lessonId = b.${lessonColumn}
      WHERE lp.isDeleted = 0
      `,
      [this.migrationName],
    );
  }

  private async getAffectedLessonIds(
    queryRunner: QueryRunner,
    targetLessonColumn: 'oldLessonId' | 'newLessonId',
  ): Promise<number[]> {
    const rows = await queryRunner.query(
      `
      SELECT DISTINCT b.${targetLessonColumn} AS lessonId
      FROM \`${this.backupTable}\` b
      WHERE b.migrationName = ?
      ORDER BY b.${targetLessonColumn}
      `,
      [this.migrationName],
    );

    return rows
      .map((row: { lessonId: number | string }) => Number(row.lessonId))
      .filter((lessonId: number) => Number.isFinite(lessonId) && lessonId > 0);
  }

  private async refreshLessonBalances(
    queryRunner: QueryRunner,
    targetLessonColumn: 'oldLessonId' | 'newLessonId',
  ): Promise<void> {
    const lessonIds = await this.getAffectedLessonIds(
      queryRunner,
      targetLessonColumn,
    );

    if (!lessonIds.length) {
      return;
    }

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
  }

  private async refreshCustomerBalances(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      `
      SELECT DISTINCT s.customer_id AS customerId
      FROM \`${this.backupTable}\` b
      INNER JOIN enrolment e
        ON e.id = b.enrolmentId
       AND e.isDeleted = 0
      INNER JOIN student s
        ON s.id = e.studentId
      WHERE b.migrationName = ?
      `,
      [this.migrationName],
    );

    if (!rows.length) {
      return;
    }

    const customerBalanceRepository = new CustomerBalanceCalculationRepository(
      queryRunner.connection as DataSource,
    );

    for (const row of rows) {
      const customerId = Number(row.customerId ?? 0);
      if (!Number.isFinite(customerId) || customerId <= 0) {
        continue;
      }

      const balance = await customerBalanceRepository.calculateBalance(
        customerId,
        queryRunner.manager,
      );

      await customerBalanceRepository.upsertCustomerAccountBalance(customerId, balance, {
        manager: queryRunner.manager,
      });
    }
  }
}
