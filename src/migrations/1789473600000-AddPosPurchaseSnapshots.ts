import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPosPurchaseSnapshots1789473600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pos_transaction_line_item
        ADD COLUMN itemCodeSnapshot varchar(150) NULL,
        ADD COLUMN itemUpcCodeSnapshot varchar(150) NULL,
        ADD COLUMN itemDescriptionSnapshot text NULL,
        ADD COLUMN itemCategoryIdSnapshot int unsigned NULL,
        ADD COLUMN itemCategoryNameSnapshot varchar(255) NULL,
        ADD COLUMN royaltyCategoryNameSnapshot varchar(255) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pos_transaction_line_item
        DROP COLUMN royaltyCategoryNameSnapshot,
        DROP COLUMN itemCategoryNameSnapshot,
        DROP COLUMN itemCategoryIdSnapshot,
        DROP COLUMN itemDescriptionSnapshot,
        DROP COLUMN itemUpcCodeSnapshot,
        DROP COLUMN itemCodeSnapshot
    `);
  }
}
