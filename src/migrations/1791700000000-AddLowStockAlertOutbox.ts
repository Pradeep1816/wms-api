import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLowStockAlertOutbox1791700000000 implements MigrationInterface {
  name = 'AddLowStockAlertOutbox1791700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Do not email every already-low item at deployment. Only future transitions
    // create events; stock, rates and existing purchases are not rewritten.
    await queryRunner.query(`CREATE TABLE low_stock_alert (
      id int unsigned NOT NULL AUTO_INCREMENT,
      itemId int unsigned NOT NULL,
      locationId int unsigned NOT NULL,
      stockQuantity int unsigned NOT NULL,
      lowStockQuantity int unsigned NOT NULL,
      status varchar(16) NOT NULL DEFAULT 'pending',
      attempts int unsigned NOT NULL DEFAULT 0,
      createdAt bigint NOT NULL,
      nextAttemptAt bigint NOT NULL,
      sentAt bigint NULL,
      recipient varchar(255) NULL,
      lastError varchar(500) NULL,
      PRIMARY KEY (id),
      KEY IDX_low_stock_alert_due (status, nextAttemptAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE low_stock_alert');
  }
}
