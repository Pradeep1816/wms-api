import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRoyaltyTransactionLedger1786200000000 implements MigrationInterface {
  name = 'AddRoyaltyTransactionLedger1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE royalty_transaction (
        id int unsigned NOT NULL AUTO_INCREMENT,
        paymentId int unsigned NULL,
        originalPaymentId int unsigned NULL,
        locationId int unsigned NOT NULL,
        customerId int unsigned NOT NULL,
        itemCategoryId int unsigned NOT NULL,
        categoryName varchar(255) NOT NULL,
        rateApplied decimal(5,2) NOT NULL DEFAULT 0.00,
        paymentAmount decimal(12,4) NOT NULL DEFAULT 0.0000,
        revenueAmount decimal(12,4) NOT NULL DEFAULT 0.0000,
        taxAmount decimal(12,4) NOT NULL DEFAULT 0.0000,
        royaltyAmount decimal(12,2) NOT NULL DEFAULT 0.00,
        royaltyFree tinyint(1) NOT NULL DEFAULT 0,
        eventType varchar(32) NOT NULL,
        effectiveDate timestamp NOT NULL,
        sourceType varchar(32) NOT NULL,
        sourceId int unsigned NULL,
        relatedRoyaltyTransactionId int unsigned NULL,
        eventGroupId varchar(64) NULL,
        idempotencyKey varchar(191) NOT NULL,
        reason varchar(500) NULL,
        schemaVersion smallint unsigned NOT NULL DEFAULT 1,
        createdOn timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        createdByUserId int NULL,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_royalty_transaction_idempotency (idempotencyKey),
        KEY IDX_royalty_transaction_location_date (locationId, effectiveDate),
        KEY IDX_royalty_transaction_payment (paymentId),
        KEY IDX_royalty_transaction_original_payment (originalPaymentId),
        KEY IDX_royalty_transaction_related (relatedRoyaltyTransactionId)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE royalty_transaction');
  }
}
