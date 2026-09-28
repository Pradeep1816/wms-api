import { DataSource, MigrationInterface, QueryRunner } from 'typeorm';
import { CustomerBalanceCalculationRepository } from '../customer/repositories/customer-balance-calculation.repository';

export class FixRecurringPaymentCreateDuplicateCronPayments1779609600006
  implements MigrationInterface
{
  name = 'FixRecurringPaymentCreateDuplicateCronPayments1779609600006';

  private readonly migrationName =
    'FixRecurringPaymentCreateDuplicateCronPayments1779609600006';
  private readonly recurringPaymentBackupTable =
    'migration_recurring_payment_create_duplicate_rp_backup';
  private readonly paymentBackupTable =
    'migration_recurring_payment_create_duplicate_payment_backup';
  private readonly lessonPaymentBackupTable =
    'migration_recurring_payment_create_dup_lp_backup';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createBackupTables(queryRunner);
    await this.captureDuplicateRecurringPayments(queryRunner);
    await this.captureRelatedRows(queryRunner);

    await queryRunner.query(
      `
      UPDATE lesson_payment lp
      INNER JOIN \`${this.lessonPaymentBackupTable}\` b
        ON b.lessonPaymentId = lp.id
       AND b.migrationName = ?
      SET
        lp.isDeleted = 1,
        lp.updatedOn = CURRENT_TIMESTAMP
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE payment p
      INNER JOIN \`${this.paymentBackupTable}\` b
        ON b.paymentId = p.id
       AND b.migrationName = ?
      SET
        p.isDeleted = 1,
        p.balance = b.oldBalance,
        p.updatedOn = CURRENT_TIMESTAMP
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      DELETE rp
      FROM recurring_payment rp
      INNER JOIN \`${this.recurringPaymentBackupTable}\` b
        ON b.recurringPaymentId = rp.id
       AND b.migrationName = ?
      `,
      [this.migrationName],
    );

    await this.refreshAffectedPaymentBalances(queryRunner);
    await this.refreshAffectedLessonBalances(queryRunner);
    await this.refreshAffectedCustomerBalances(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT IGNORE INTO recurring_payment (
        id,
        paymentId,
        customerRecurringPaymentId,
        date,
        createdOn,
        updatedOn,
        createdByUserId,
        updatedByUserId
      )
      SELECT
        recurringPaymentId,
        paymentId,
        customerRecurringPaymentId,
        date,
        oldRecurringPaymentCreatedOn,
        oldRecurringPaymentUpdatedOn,
        oldRecurringPaymentCreatedByUserId,
        oldRecurringPaymentUpdatedByUserId
      FROM \`${this.recurringPaymentBackupTable}\`
      WHERE migrationName = ?
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE payment p
      INNER JOIN \`${this.paymentBackupTable}\` b
        ON b.paymentId = p.id
       AND b.migrationName = ?
      SET
        p.isDeleted = b.oldPaymentIsDeleted,
        p.balance = b.oldBalance,
        p.updatedOn = b.oldPaymentUpdatedOn
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE lesson_payment lp
      INNER JOIN \`${this.lessonPaymentBackupTable}\` b
        ON b.lessonPaymentId = lp.id
       AND b.migrationName = ?
      SET
        lp.isDeleted = b.oldLessonPaymentIsDeleted,
        lp.updatedOn = b.oldLessonPaymentUpdatedOn
      `,
      [this.migrationName],
    );

    await this.refreshAffectedPaymentBalances(queryRunner);
    await this.refreshAffectedLessonBalances(queryRunner);
    await this.refreshAffectedCustomerBalances(queryRunner);

    await queryRunner.query(
      `DELETE FROM \`${this.lessonPaymentBackupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
    await queryRunner.query(
      `DELETE FROM \`${this.paymentBackupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
    await queryRunner.query(
      `DELETE FROM \`${this.recurringPaymentBackupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
  }

  private async createBackupTables(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.recurringPaymentBackupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`recurringPaymentId\` int NOT NULL,
        \`keepRecurringPaymentId\` int NOT NULL,
        \`customerRecurringPaymentId\` int NOT NULL,
        \`date\` date NOT NULL,
        \`paymentId\` int NOT NULL,
        \`customerId\` int NOT NULL,
        \`locationId\` int unsigned NULL,
        \`oldRecurringPaymentCreatedOn\` timestamp NULL,
        \`oldRecurringPaymentUpdatedOn\` timestamp NULL,
        \`oldRecurringPaymentCreatedByUserId\` int NOT NULL,
        \`oldRecurringPaymentUpdatedByUserId\` int NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`recurringPaymentId\`),
        KEY \`idx_mrpcd_rp_keep\` (\`keepRecurringPaymentId\`),
        KEY \`idx_mrpcd_rp_payment\` (\`paymentId\`),
        KEY \`idx_mrpcd_rp_customer\` (\`customerId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.paymentBackupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`paymentId\` int unsigned NOT NULL,
        \`customerId\` int unsigned NOT NULL,
        \`oldPaymentIsDeleted\` tinyint NULL,
        \`oldBalance\` decimal(10,4) NULL,
        \`oldPaymentUpdatedOn\` timestamp NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`paymentId\`),
        KEY \`idx_mrpcd_payment_customer\` (\`customerId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.lessonPaymentBackupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`lessonPaymentId\` int NOT NULL,
        \`paymentId\` int NOT NULL,
        \`lessonId\` int NOT NULL,
        \`enrolmentId\` int NULL,
        \`oldLessonPaymentIsDeleted\` int NOT NULL,
        \`oldLessonPaymentUpdatedOn\` timestamp NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`lessonPaymentId\`),
        KEY \`idx_mrpcd_lp_payment\` (\`paymentId\`),
        KEY \`idx_mrpcd_lp_lesson\` (\`lessonId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);
  }

  private async captureDuplicateRecurringPayments(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.recurringPaymentBackupTable}\` (
        migrationName,
        recurringPaymentId,
        keepRecurringPaymentId,
        customerRecurringPaymentId,
        date,
        paymentId,
        customerId,
        locationId,
        oldRecurringPaymentCreatedOn,
        oldRecurringPaymentUpdatedOn,
        oldRecurringPaymentCreatedByUserId,
        oldRecurringPaymentUpdatedByUserId
      )
      SELECT
        ? AS migrationName,
        c.recurringPaymentId,
        k.keepRecurringPaymentId,
        c.customerRecurringPaymentId,
        c.date,
        c.paymentId,
        c.customerId,
        c.locationId,
        c.oldRecurringPaymentCreatedOn,
        c.oldRecurringPaymentUpdatedOn,
        c.oldRecurringPaymentCreatedByUserId,
        c.oldRecurringPaymentUpdatedByUserId
      FROM (
        ${this.recurringPaymentCandidateSql()}
      ) c
      INNER JOIN (
        SELECT
          customerRecurringPaymentId,
          date,
          MIN(recurringPaymentId) AS keepRecurringPaymentId
        FROM (
          ${this.recurringPaymentCandidateSql()}
        ) groupedCandidates
        GROUP BY customerRecurringPaymentId, date
        HAVING COUNT(*) > 1
      ) k
        ON k.customerRecurringPaymentId = c.customerRecurringPaymentId
       AND k.date = c.date
      WHERE c.recurringPaymentId <> k.keepRecurringPaymentId
      `,
      [this.migrationName],
    );
  }

  private async captureRelatedRows(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.paymentBackupTable}\` (
        migrationName,
        paymentId,
        customerId,
        oldPaymentIsDeleted,
        oldBalance,
        oldPaymentUpdatedOn
      )
      SELECT
        ? AS migrationName,
        p.id AS paymentId,
        p.user_id AS customerId,
        p.isDeleted AS oldPaymentIsDeleted,
        p.balance AS oldBalance,
        p.updatedOn AS oldPaymentUpdatedOn
      FROM payment p
      INNER JOIN \`${this.recurringPaymentBackupTable}\` b
        ON b.paymentId = p.id
       AND b.migrationName = ?
      WHERE p.isDeleted = 0
      `,
      [this.migrationName, this.migrationName],
    );

    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.lessonPaymentBackupTable}\` (
        migrationName,
        lessonPaymentId,
        paymentId,
        lessonId,
        enrolmentId,
        oldLessonPaymentIsDeleted,
        oldLessonPaymentUpdatedOn
      )
      SELECT
        ? AS migrationName,
        lp.id AS lessonPaymentId,
        lp.paymentId AS paymentId,
        lp.lessonId AS lessonId,
        lp.enrolmentId AS enrolmentId,
        lp.isDeleted AS oldLessonPaymentIsDeleted,
        lp.updatedOn AS oldLessonPaymentUpdatedOn
      FROM lesson_payment lp
      INNER JOIN \`${this.paymentBackupTable}\` b
        ON b.paymentId = lp.paymentId
       AND b.migrationName = ?
      WHERE lp.isDeleted = 0
      `,
      [this.migrationName, this.migrationName],
    );
  }

  private recurringPaymentCandidateSql(): string {
    return `
      SELECT
        rp.id AS recurringPaymentId,
        rp.customerRecurringPaymentId AS customerRecurringPaymentId,
        rp.date AS date,
        rp.paymentId AS paymentId,
        crp.customerId AS customerId,
        (
          SELECT MIN(ul.location_id)
          FROM user_location ul
          WHERE ul.user_id = crp.customerId
        ) AS locationId,
        rp.createdOn AS oldRecurringPaymentCreatedOn,
        rp.updatedOn AS oldRecurringPaymentUpdatedOn,
        rp.createdByUserId AS oldRecurringPaymentCreatedByUserId,
        rp.updatedByUserId AS oldRecurringPaymentUpdatedByUserId
      FROM recurring_payment rp
      INNER JOIN payment p
        ON p.id = rp.paymentId
       AND p.isDeleted = 0
      INNER JOIN customer_recurring_payment crp
        ON crp.id = rp.customerRecurringPaymentId
      WHERE rp.createdByUserId = 727
        AND rp.createdOn >= '2026-05-28 03:10:00'
    `;
  }

  private async refreshAffectedPaymentBalances(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE payment p
      INNER JOIN \`${this.paymentBackupTable}\` b
        ON b.paymentId = p.id
       AND b.migrationName = ?
      LEFT JOIN (
        SELECT payment_id AS paymentId, ROUND(SUM(amount), 4) AS total
        FROM invoice_payment
        WHERE isDeleted = 0
        GROUP BY payment_id
      ) invoiceUsed
        ON invoiceUsed.paymentId = p.id
      LEFT JOIN (
        SELECT paymentId, ROUND(SUM(amount), 4) AS total
        FROM lesson_payment
        WHERE isDeleted = 0
        GROUP BY paymentId
      ) lessonUsed
        ON lessonUsed.paymentId = p.id
      SET p.balance = ROUND(
        COALESCE(p.amount, 0)
        - COALESCE(invoiceUsed.total, 0)
        - COALESCE(lessonUsed.total, 0),
        4
      )
      WHERE p.isDeleted = 0
      `,
      [this.migrationName],
    );
  }

  private async refreshAffectedLessonBalances(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE private_lesson pl
      INNER JOIN (
        SELECT DISTINCT lp.lessonId
        FROM \`${this.lessonPaymentBackupTable}\` lp
        INNER JOIN lesson l
          ON l.id = lp.lessonId
        INNER JOIN course c
          ON c.id = l.courseId
        INNER JOIN program p
          ON p.id = c.programId
         AND p.type = 1
        WHERE lp.migrationName = ?
      ) affected
        ON affected.lessonId = pl.lessonId
      LEFT JOIN (
        SELECT
          lp.lessonId,
          ROUND(SUM(lp.amount), 4) AS totalPaid
        FROM lesson_payment lp
        INNER JOIN payment p
          ON p.id = lp.paymentId
         AND p.isDeleted = 0
         AND p.payment_method_id <> 2
        WHERE lp.isDeleted = 0
        GROUP BY lp.lessonId
      ) paid
        ON paid.lessonId = pl.lessonId
      SET pl.balance = ROUND(COALESCE(pl.total, 0) - COALESCE(paid.totalPaid, 0), 4)
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE group_lesson gl
      INNER JOIN (
        SELECT DISTINCT lp.lessonId, lp.enrolmentId
        FROM \`${this.lessonPaymentBackupTable}\` lp
        INNER JOIN lesson l
          ON l.id = lp.lessonId
        INNER JOIN course c
          ON c.id = l.courseId
        INNER JOIN program p
          ON p.id = c.programId
         AND p.type = 2
        WHERE lp.migrationName = ?
          AND lp.enrolmentId IS NOT NULL
      ) affected
        ON affected.lessonId = gl.lessonId
       AND affected.enrolmentId = gl.enrolmentId
      LEFT JOIN (
        SELECT
          lp.lessonId,
          lp.enrolmentId,
          ROUND(SUM(lp.amount), 4) AS totalPaid
        FROM lesson_payment lp
        INNER JOIN payment p
          ON p.id = lp.paymentId
         AND p.isDeleted = 0
         AND p.payment_method_id <> 2
        WHERE lp.isDeleted = 0
        GROUP BY lp.lessonId, lp.enrolmentId
      ) paid
        ON paid.lessonId = gl.lessonId
       AND paid.enrolmentId = gl.enrolmentId
      SET
        gl.balance = ROUND(COALESCE(gl.total, 0) - COALESCE(paid.totalPaid, 0), 4),
        gl.paidStatus = CASE
          WHEN ROUND(COALESCE(gl.total, 0) - COALESCE(paid.totalPaid, 0), 4) > 0.09 THEN 1
          WHEN ROUND(COALESCE(gl.total, 0) - COALESCE(paid.totalPaid, 0), 4) < -0.09 THEN 3
          ELSE 2
        END,
        gl.updatedOn = CURRENT_TIMESTAMP
      WHERE gl.isDeleted = 0
      `,
      [this.migrationName],
    );
  }

  private async refreshAffectedCustomerBalances(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      `
      SELECT DISTINCT customerId
      FROM \`${this.paymentBackupTable}\`
      WHERE migrationName = ?
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
      const customerId = Number(row.customerId || 0);
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
