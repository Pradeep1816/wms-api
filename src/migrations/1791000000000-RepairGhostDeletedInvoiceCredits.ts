import { DataSource, MigrationInterface, QueryRunner } from 'typeorm';
import { CustomerBalanceCalculationRepository } from '../customer/repositories/customer-balance-calculation.repository';

export class RepairGhostDeletedInvoiceCredits1791000000000
    implements MigrationInterface {
    name = 'RepairGhostDeletedInvoiceCredits1791000000000';

    private readonly migrationName = 'RepairGhostDeletedInvoiceCredits1791000000000';
    private readonly backupTable = 'migration_ghost_deleted_invoice_credit_backup';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await this.createBackupTable(queryRunner);
        await this.captureGhostInvoices(queryRunner);

        await queryRunner.query(
            `
      UPDATE invoice i
      INNER JOIN \`${this.backupTable}\` b
        ON b.invoiceId = i.id
       AND b.migrationName = ?
      SET
        i.balance = 0,
        i.status = 2,
        i.updatedOn = CURRENT_TIMESTAMP
      `,
            [this.migrationName],
        );

        await this.refreshAffectedCustomerBalances(queryRunner);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `
      UPDATE invoice i
      INNER JOIN \`${this.backupTable}\` b
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

        await this.refreshAffectedCustomerBalances(queryRunner);

        await queryRunner.query(
            `DELETE FROM \`${this.backupTable}\` WHERE migrationName = ?`,
            [this.migrationName],
        );
    }

    private async createBackupTable(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.backupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`invoiceId\` int unsigned NOT NULL,
        \`customerId\` int unsigned NOT NULL,
        \`locationId\` int unsigned NOT NULL,
        \`oldInvoiceIsDeleted\` tinyint NOT NULL,
        \`oldInvoiceStatus\` tinyint NOT NULL,
        \`oldInvoiceBalance\` decimal(10,4) NULL,
        \`oldInvoiceUpdatedOn\` timestamp NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`invoiceId\`),
        KEY \`idx_mgdc_invoice_customer\` (\`customerId\`),
        KEY \`idx_mgdc_invoice_location\` (\`locationId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);
    }

    private async captureGhostInvoices(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `
      INSERT IGNORE INTO \`${this.backupTable}\` (
        migrationName,
        invoiceId,
        customerId,
        locationId,
        oldInvoiceIsDeleted,
        oldInvoiceStatus,
        oldInvoiceBalance,
        oldInvoiceUpdatedOn
      )
      SELECT
        ? AS migrationName,
        i.id AS invoiceId,
        i.user_id AS customerId,
        i.location_id AS locationId,
        i.isDeleted AS oldInvoiceIsDeleted,
        i.status AS oldInvoiceStatus,
        i.balance AS oldInvoiceBalance,
        i.updatedOn AS oldInvoiceUpdatedOn
      FROM invoice i
      WHERE i.isDeleted = 1
        AND ROUND(i.balance, 2) < -0.1
        AND NOT EXISTS (
          SELECT 1
          FROM invoice_payment ip
          INNER JOIN payment p
            ON p.id = ip.payment_id
           AND p.isDeleted = 0
          WHERE ip.invoice_id = i.id
            AND ip.isDeleted = 0
        )
      `,
            [this.migrationName],
        );
    }

    private async refreshAffectedCustomerBalances(queryRunner: QueryRunner): Promise<void> {
        const rows = await queryRunner.query(
            `
      SELECT DISTINCT customerId
      FROM \`${this.backupTable}\`
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
