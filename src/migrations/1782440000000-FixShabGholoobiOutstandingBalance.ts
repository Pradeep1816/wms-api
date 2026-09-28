import { MigrationInterface, QueryRunner } from 'typeorm';
import { CustomerBalanceCalculationRepository } from '../customer/repositories/customer-balance-calculation.repository';

/**
 * One-off repair for Shab Gholoobi's Newmarket account.
 *
 * Invoice 1111194 was canceled but still carried a live balance, which left
 * customer_account.balance showing 29.2500 even though there were no matching
 * open lesson rows. This migration zeroes that orphaned canceled invoice
 * balance and refreshes the derived customer balance from the repaired state.
 */
export class FixShabGholoobiOutstandingBalance1782440000000
  implements MigrationInterface
{
  name = 'FixShabGholoobiOutstandingBalance1782440000000';

  private readonly migrationName =
    'FixShabGholoobiOutstandingBalance1782440000000';
  private readonly backupTable =
    'migration_shab_gholoobi_outstanding_balance_backup';
  private readonly invoiceId = 1111194;
  private readonly customerId = 14544;
  private readonly customerAccountId = 11682;
  private readonly locationId = 18;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createBackupTable(queryRunner);
    await this.backupCurrentState(queryRunner);
    await this.zeroOutInvoiceBalance(queryRunner);
    await this.refreshCustomerBalance(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.restoreInvoiceBalance(queryRunner);
    await this.restoreCustomerBalance(queryRunner);

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
        \`invoiceNumber\` int unsigned NOT NULL,
        \`customerId\` int unsigned NOT NULL,
        \`customerAccountId\` int unsigned NOT NULL,
        \`locationId\` int unsigned NOT NULL,
        \`oldInvoiceBalance\` decimal(15,4) NOT NULL,
        \`oldCustomerAccountBalance\` decimal(15,4) NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`invoiceId\`),
        KEY \`idx_shab_gho_cust\` (\`customerId\`),
        KEY \`idx_shab_gho_loc\` (\`locationId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);
  }

  private async backupCurrentState(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.backupTable}\` (
        migrationName,
        invoiceId,
        invoiceNumber,
        customerId,
        customerAccountId,
        locationId,
        oldInvoiceBalance,
        oldCustomerAccountBalance
      )
      SELECT
        ? AS migrationName,
        i.id AS invoiceId,
        i.invoice_number AS invoiceNumber,
        i.user_id AS customerId,
        ca.id AS customerAccountId,
        i.location_id AS locationId,
        CAST(ROUND(i.balance, 4) AS DECIMAL(15,4)) AS oldInvoiceBalance,
        CAST(ROUND(ca.balance, 4) AS DECIMAL(15,4)) AS oldCustomerAccountBalance
      FROM invoice i
      INNER JOIN customer_account ca
        ON ca.customerId = i.user_id
       AND ca.id = ${this.customerAccountId}
      WHERE i.id = ${this.invoiceId}
        AND i.user_id = ${this.customerId}
        AND i.location_id = ${this.locationId}
        AND i.type = 2
        AND i.isCanceled = 1
        AND i.isDeleted = 0
        AND ROUND(i.balance, 2) > 0.09
      `,
      [this.migrationName],
    );
  }

  private async zeroOutInvoiceBalance(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE invoice i
      INNER JOIN \`${this.backupTable}\` b
        ON b.invoiceId = i.id
       AND b.migrationName = ?
      SET i.balance = 0.0000
      WHERE i.id = ${this.invoiceId}
        AND i.user_id = ${this.customerId}
        AND i.location_id = ${this.locationId}
        AND i.type = 2
        AND i.isCanceled = 1
        AND i.isDeleted = 0
        AND ROUND(i.balance, 2) > 0.09
      `,
      [this.migrationName],
    );
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
      { manager: queryRunner.manager },
    );
  }

  private async restoreInvoiceBalance(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE invoice i
      INNER JOIN \`${this.backupTable}\` b
        ON b.invoiceId = i.id
       AND b.migrationName = ?
      SET i.balance = b.oldInvoiceBalance
      WHERE i.id = ${this.invoiceId}
        AND i.user_id = ${this.customerId}
        AND i.location_id = ${this.locationId}
      `,
      [this.migrationName],
    );
  }

  private async restoreCustomerBalance(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(
      `
      UPDATE customer_account ca
      INNER JOIN \`${this.backupTable}\` b
        ON b.customerAccountId = ca.id
       AND b.migrationName = ?
      SET ca.balance = b.oldCustomerAccountBalance
      WHERE ca.id = ${this.customerAccountId}
        AND ca.customerId = ${this.customerId}
      `,
      [this.migrationName],
    );
  }
}
