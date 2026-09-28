import { DataSource, MigrationInterface, QueryRunner } from 'typeorm';
import { CustomerBalanceCalculationRepository } from '../customer/repositories/customer-balance-calculation.repository';

export class FixExpiredLessonDuplicateCronInvoices1779609600007
  implements MigrationInterface
{
  name = 'FixExpiredLessonDuplicateCronInvoices1779609600007';

  private readonly migrationName =
    'FixExpiredLessonDuplicateCronInvoices1779609600007';
  private readonly invoiceBackupTable = 'migration_expired_lesson_dup_inv_backup';
  private readonly lineItemBackupTable = 'migration_expired_lesson_dup_li_backup';
  private readonly invoicePaymentBackupTable =
    'migration_expired_lesson_dup_ip_backup';
  private readonly lessonPaymentBackupTable =
    'migration_expired_lesson_dup_lp_backup';
  private readonly paymentBackupTable =
    'migration_expired_lesson_dup_payment_backup';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createBackupTables(queryRunner);
    await this.captureDuplicateInvoices(queryRunner);
    await this.captureRelatedRows(queryRunner);

    await queryRunner.query(
      `
      UPDATE invoice_line_item ili
      INNER JOIN \`${this.lineItemBackupTable}\` b
        ON b.invoiceLineItemId = ili.id
       AND b.migrationName = ?
      SET ili.isDeleted = 1
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE invoice_payment ip
      INNER JOIN \`${this.invoicePaymentBackupTable}\` b
        ON b.invoicePaymentId = ip.id
       AND b.migrationName = ?
      SET
        ip.isDeleted = 1,
        ip.updatedOn = CURRENT_TIMESTAMP
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
        p.isDeleted = CASE
          WHEN p.payment_method_id IN (2, 3) THEN 1
          ELSE p.isDeleted
        END,
        p.balance = b.oldBalance,
        p.updatedOn = CURRENT_TIMESTAMP
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE invoice i
      INNER JOIN \`${this.invoiceBackupTable}\` b
        ON b.invoiceId = i.id
       AND b.migrationName = ?
      SET
        i.isDeleted = 1,
        i.updatedOn = CURRENT_TIMESTAMP
      `,
      [this.migrationName],
    );

    await this.refreshAffectedPaymentBalances(queryRunner);
    await this.refreshAffectedInvoiceBalances(queryRunner);
    await this.refreshAffectedLessonBalances(queryRunner);
    await this.refreshAffectedCustomerBalances(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE invoice i
      INNER JOIN \`${this.invoiceBackupTable}\` b
        ON b.invoiceId = i.id
       AND b.migrationName = ?
      SET
        i.isDeleted = b.oldInvoiceIsDeleted,
        i.balance = b.oldInvoiceBalance,
        i.status = b.oldInvoiceStatus,
        i.updatedOn = b.oldInvoiceUpdatedOn
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE invoice_line_item ili
      INNER JOIN \`${this.lineItemBackupTable}\` b
        ON b.invoiceLineItemId = ili.id
       AND b.migrationName = ?
      SET ili.isDeleted = b.oldLineItemIsDeleted
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE invoice_payment ip
      INNER JOIN \`${this.invoicePaymentBackupTable}\` b
        ON b.invoicePaymentId = ip.id
       AND b.migrationName = ?
      SET
        ip.isDeleted = b.oldInvoicePaymentIsDeleted,
        ip.updatedOn = b.oldInvoicePaymentUpdatedOn
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

    await this.refreshAffectedPaymentBalances(queryRunner);
    await this.refreshAffectedInvoiceBalances(queryRunner);
    await this.refreshAffectedLessonBalances(queryRunner);
    await this.refreshAffectedCustomerBalances(queryRunner);

    await queryRunner.query(
      `DELETE FROM \`${this.paymentBackupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
    await queryRunner.query(
      `DELETE FROM \`${this.lessonPaymentBackupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
    await queryRunner.query(
      `DELETE FROM \`${this.invoicePaymentBackupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
    await queryRunner.query(
      `DELETE FROM \`${this.lineItemBackupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
    await queryRunner.query(
      `DELETE FROM \`${this.invoiceBackupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
  }

  private async createBackupTables(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.invoiceBackupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`invoiceId\` int unsigned NOT NULL,
        \`keepInvoiceId\` int unsigned NOT NULL,
        \`lessonId\` int unsigned NOT NULL,
        \`customerId\` int unsigned NOT NULL,
        \`locationId\` int unsigned NOT NULL,
        \`oldInvoiceIsDeleted\` tinyint unsigned NOT NULL,
        \`oldInvoiceStatus\` tinyint unsigned NOT NULL,
        \`oldInvoiceBalance\` decimal(10,4) NULL,
        \`oldInvoiceUpdatedOn\` timestamp NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`invoiceId\`),
        KEY \`idx_meldi_keep_invoice\` (\`keepInvoiceId\`),
        KEY \`idx_meldi_lesson\` (\`lessonId\`),
        KEY \`idx_meldi_customer\` (\`customerId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.lineItemBackupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`invoiceLineItemId\` int unsigned NOT NULL,
        \`invoiceId\` int unsigned NOT NULL,
        \`oldLineItemIsDeleted\` tinyint NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`invoiceLineItemId\`),
        KEY \`idx_meldli_invoice\` (\`invoiceId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.invoicePaymentBackupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`invoicePaymentId\` int unsigned NOT NULL,
        \`invoiceId\` int unsigned NOT NULL,
        \`paymentId\` int unsigned NOT NULL,
        \`oldInvoicePaymentIsDeleted\` int NOT NULL,
        \`oldInvoicePaymentUpdatedOn\` timestamp NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`invoicePaymentId\`),
        KEY \`idx_meldip_payment\` (\`paymentId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.lessonPaymentBackupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`lessonPaymentId\` int unsigned NOT NULL,
        \`paymentId\` int unsigned NOT NULL,
        \`lessonId\` int unsigned NOT NULL,
        \`enrolmentId\` int unsigned NULL,
        \`oldLessonPaymentIsDeleted\` int NOT NULL,
        \`oldLessonPaymentUpdatedOn\` timestamp NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`lessonPaymentId\`),
        KEY \`idx_meldlp_payment\` (\`paymentId\`),
        KEY \`idx_meldlp_lesson\` (\`lessonId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.paymentBackupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`paymentId\` int unsigned NOT NULL,
        \`oldPaymentIsDeleted\` tinyint NULL,
        \`oldBalance\` decimal(10,4) NULL,
        \`oldPaymentUpdatedOn\` timestamp NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`paymentId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);
  }

  private async captureDuplicateInvoices(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.invoiceBackupTable}\` (
        migrationName,
        invoiceId,
        keepInvoiceId,
        lessonId,
        customerId,
        locationId,
        oldInvoiceIsDeleted,
        oldInvoiceStatus,
        oldInvoiceBalance,
        oldInvoiceUpdatedOn
      )
      SELECT
        ? AS migrationName,
        c.invoiceId,
        k.keepInvoiceId,
        c.lessonId,
        c.customerId,
        c.locationId,
        c.oldInvoiceIsDeleted,
        c.oldInvoiceStatus,
        c.oldInvoiceBalance,
        c.oldInvoiceUpdatedOn
      FROM (
        ${this.expiredLessonInvoiceCandidateSql()}
      ) c
      INNER JOIN (
        SELECT lessonId, MIN(invoiceId) AS keepInvoiceId
        FROM (
          ${this.expiredLessonInvoiceCandidateSql()}
        ) groupedCandidates
        GROUP BY lessonId
        HAVING COUNT(DISTINCT invoiceId) > 1
      ) k
        ON k.lessonId = c.lessonId
      WHERE c.invoiceId <> k.keepInvoiceId
      `,
      [this.migrationName],
    );
  }

  private async captureRelatedRows(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.lineItemBackupTable}\` (
        migrationName,
        invoiceLineItemId,
        invoiceId,
        oldLineItemIsDeleted
      )
      SELECT
        ? AS migrationName,
        ili.id AS invoiceLineItemId,
        ili.invoice_id AS invoiceId,
        ili.isDeleted AS oldLineItemIsDeleted
      FROM invoice_line_item ili
      INNER JOIN \`${this.invoiceBackupTable}\` b
        ON b.invoiceId = ili.invoice_id
       AND b.migrationName = ?
      `,
      [this.migrationName, this.migrationName],
    );

    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.invoicePaymentBackupTable}\` (
        migrationName,
        invoicePaymentId,
        invoiceId,
        paymentId,
        oldInvoicePaymentIsDeleted,
        oldInvoicePaymentUpdatedOn
      )
      SELECT
        ? AS migrationName,
        ip.id AS invoicePaymentId,
        ip.invoice_id AS invoiceId,
        ip.payment_id AS paymentId,
        ip.isDeleted AS oldInvoicePaymentIsDeleted,
        ip.updatedOn AS oldInvoicePaymentUpdatedOn
      FROM invoice_payment ip
      INNER JOIN \`${this.invoiceBackupTable}\` b
        ON b.invoiceId = ip.invoice_id
       AND b.migrationName = ?
      WHERE ip.isDeleted = 0
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
      INNER JOIN (
        SELECT paymentId
        FROM \`${this.invoicePaymentBackupTable}\`
        WHERE migrationName = ?
        UNION
        SELECT cu.debit_payment_id AS paymentId
        FROM credit_usage cu
        INNER JOIN \`${this.invoicePaymentBackupTable}\` ipb
          ON ipb.paymentId = cu.credit_payment_id
         AND ipb.migrationName = ?
      ) affectedPayments
        ON affectedPayments.paymentId = lp.paymentId
      WHERE lp.isDeleted = 0
      `,
      [this.migrationName, this.migrationName, this.migrationName],
    );

    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.paymentBackupTable}\` (
        migrationName,
        paymentId,
        oldPaymentIsDeleted,
        oldBalance,
        oldPaymentUpdatedOn
      )
      SELECT DISTINCT
        ? AS migrationName,
        p.id AS paymentId,
        p.isDeleted AS oldPaymentIsDeleted,
        p.balance AS oldBalance,
        p.updatedOn AS oldPaymentUpdatedOn
      FROM payment p
      INNER JOIN (
        SELECT paymentId
        FROM \`${this.invoicePaymentBackupTable}\`
        WHERE migrationName = ?
        UNION
        SELECT paymentId
        FROM \`${this.lessonPaymentBackupTable}\`
        WHERE migrationName = ?
      ) paymentIds
        ON paymentIds.paymentId = p.id
      WHERE p.isDeleted = 0
      `,
      [this.migrationName, this.migrationName, this.migrationName],
    );
  }

  private expiredLessonInvoiceCandidateSql(): string {
    return `
      SELECT
        inv.id AS invoiceId,
        iil.lessonId AS lessonId,
        inv.user_id AS customerId,
        inv.location_id AS locationId,
        inv.isDeleted AS oldInvoiceIsDeleted,
        inv.status AS oldInvoiceStatus,
        inv.balance AS oldInvoiceBalance,
        inv.updatedOn AS oldInvoiceUpdatedOn
      FROM invoice inv
      INNER JOIN invoice_line_item ili
        ON ili.invoice_id = inv.id
       AND ili.isDeleted = 0
       AND ili.item_type_id = 1
      INNER JOIN invoice_item_lesson iil
        ON iil.invoiceLineItemId = ili.id
      INNER JOIN lesson l
        ON l.id = iil.lessonId
       AND l.isDeleted = 0
       AND l.isConfirmed = 1
       AND l.status = 5
      INNER JOIN private_lesson pl
        ON pl.lessonId = l.id
       AND pl.expiryDate < inv.createdOn
      INNER JOIN course c
        ON c.id = l.courseId
       AND c.isDeleted = 0
       AND c.isConfirmed = 1
      INNER JOIN program p
        ON p.id = c.programId
       AND p.type = 1
      WHERE inv.type = 2
        AND inv.isDeleted = 0
        AND inv.isCanceled = 0
        AND inv.isVoid = 0
        AND inv.createdUserId = 727
        AND inv.createdOn >= '2026-05-27 23:20:00'
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

  private async refreshAffectedInvoiceBalances(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE invoice i
      INNER JOIN (
        SELECT keepInvoiceId AS invoiceId
        FROM \`${this.invoiceBackupTable}\`
        WHERE migrationName = ?
        UNION
        SELECT invoiceId
        FROM \`${this.invoicePaymentBackupTable}\`
        WHERE migrationName = ?
      ) affected
        ON affected.invoiceId = i.id
      LEFT JOIN (
        SELECT invoice_id AS invoiceId, ROUND(SUM(amount), 4) AS totalPaid
        FROM invoice_payment
        WHERE isDeleted = 0
        GROUP BY invoice_id
      ) paid
        ON paid.invoiceId = i.id
      SET
        i.balance = ROUND(COALESCE(i.total, 0) - COALESCE(paid.totalPaid, 0), 4),
        i.status = CASE
          WHEN ROUND(COALESCE(i.total, 0) - COALESCE(paid.totalPaid, 0), 2) > 0.09 THEN 1
          WHEN ROUND(COALESCE(i.total, 0) - COALESCE(paid.totalPaid, 0), 2) < -0.09 THEN 3
          ELSE 2
        END
      WHERE i.isDeleted = 0
        AND i.isVoid = 0
        AND i.isCanceled = 0
      `,
      [this.migrationName, this.migrationName],
    );
  }

  private async refreshAffectedLessonBalances(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE private_lesson pl
      INNER JOIN (
        SELECT DISTINCT lessonId
        FROM \`${this.invoiceBackupTable}\`
        WHERE migrationName = ?
        UNION
        SELECT DISTINCT lessonId
        FROM \`${this.lessonPaymentBackupTable}\`
        WHERE migrationName = ?
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
      [this.migrationName, this.migrationName],
    );
  }

  private async refreshAffectedCustomerBalances(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      `
      SELECT DISTINCT customerId
      FROM \`${this.invoiceBackupTable}\`
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
