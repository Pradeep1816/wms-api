import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateItemLocationStock1789473600001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE item_location_stock (
        itemId int unsigned NOT NULL,
        locationId int unsigned NOT NULL,
        stockQuantity int unsigned NOT NULL,
        lowStockQuantity int unsigned NULL,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (itemId, locationId),
        KEY IDX_item_location_stock_location (locationId)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE item_location_stock');
  }
}
