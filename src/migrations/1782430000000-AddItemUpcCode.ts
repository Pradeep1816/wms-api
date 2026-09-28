import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddItemUpcCode1782430000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE item
        ADD COLUMN upcCode varchar(150) NULL AFTER code,
        ADD KEY IDX_item_upc_code (upcCode)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE item
        DROP KEY IDX_item_upc_code,
        DROP COLUMN upcCode
    `);
  }
}
