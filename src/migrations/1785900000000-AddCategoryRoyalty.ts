import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategoryRoyalty1785900000000 implements MigrationInterface {
  name = 'AddCategoryRoyalty1785900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE item_category
      ADD COLUMN royality decimal(5,2) NOT NULL DEFAULT 0.00 AFTER name
    `);

    await queryRunner.query(`
      ALTER TABLE invoice_line_item
      ADD COLUMN royaltyCategoryId int unsigned NULL AFTER royaltyFree,
      ADD COLUMN royaltyRateApplied decimal(5,2) NOT NULL DEFAULT 0.00 AFTER royaltyCategoryId
    `);

    await queryRunner.query(`
      ALTER TABLE pos_transaction_line_item
      ADD COLUMN royaltyCategoryId int unsigned NULL AFTER overridePrice,
      ADD COLUMN royaltyRateApplied decimal(5,2) NOT NULL DEFAULT 0.00 AFTER royaltyCategoryId
    `);

    // Snapshot the legacy classification and lesson rate without making future
    // category edits retroactive. Non-lesson category rates initially remain 0%.
    await queryRunner.query(`
      UPDATE invoice_line_item ili
      INNER JOIN item i ON i.id = ili.item_id
      INNER JOIN invoice inv ON inv.id = ili.invoice_id
      LEFT JOIN location_debt lessonRoyalty
        ON lessonRoyalty.locationId = inv.location_id AND lessonRoyalty.type = 1
      SET
        ili.royaltyCategoryId = i.itemCategoryId,
        ili.royaltyRateApplied = CASE
          WHEN ili.royaltyFree = 1 THEN 0
          WHEN i.itemCategoryId = 1 THEN COALESCE(lessonRoyalty.value, 0)
          ELSE 0
        END
    `);

    await queryRunner.query(`
      UPDATE pos_transaction_line_item pli
      INNER JOIN item i ON i.id = pli.itemId
      INNER JOIN pos_transaction pt ON pt.id = pli.posTransactionId
      LEFT JOIN location_debt lessonRoyalty
        ON lessonRoyalty.locationId = pt.locationId AND lessonRoyalty.type = 1
      SET
        pli.royaltyCategoryId = i.itemCategoryId,
        pli.royaltyRateApplied = CASE
          WHEN i.royaltyFree = 1 THEN 0
          WHEN i.itemCategoryId = 1 THEN COALESCE(lessonRoyalty.value, 0)
          ELSE 0
        END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pos_transaction_line_item
      DROP COLUMN royaltyRateApplied,
      DROP COLUMN royaltyCategoryId
    `);

    await queryRunner.query(`
      ALTER TABLE invoice_line_item
      DROP COLUMN royaltyRateApplied,
      DROP COLUMN royaltyCategoryId
    `);

    await queryRunner.query(`
      ALTER TABLE item_category
      DROP COLUMN royality
    `);
  }
}
