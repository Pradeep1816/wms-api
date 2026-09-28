import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTrackInventoryToItemLocationStock1789473600002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE item_location_stock ADD COLUMN trackInventory tinyint(1) NOT NULL DEFAULT 0 AFTER locationId, MODIFY COLUMN stockQuantity int unsigned NULL',
    );
    await queryRunner.query(
      'UPDATE item_location_stock SET trackInventory = 1 WHERE stockQuantity IS NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DELETE FROM item_location_stock WHERE stockQuantity IS NULL',
    );
    await queryRunner.query(
      'ALTER TABLE item_location_stock MODIFY COLUMN stockQuantity int unsigned NOT NULL, DROP COLUMN trackInventory',
    );
  }
}
