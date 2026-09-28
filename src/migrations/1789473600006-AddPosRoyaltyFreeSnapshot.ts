import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPosRoyaltyFreeSnapshot1789473600006 implements MigrationInterface {
  name = 'AddPosRoyaltyFreeSnapshot1789473600006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pos_transaction_line_item
      ADD COLUMN royaltyFreeSnapshot tinyint unsigned NULL
      AFTER royaltyRateApplied
    `);

    await queryRunner.query(`
      UPDATE pos_transaction_line_item posLine
      INNER JOIN pos_transaction pos
        ON pos.id = posLine.posTransactionId
      INNER JOIN item posItem
        ON posItem.id = posLine.itemId
      SET posLine.royaltyFreeSnapshot = CASE
        WHEN posItem.royaltyFree = 1 THEN 1
        ELSE 0
      END
      WHERE pos.status = 'PAID'
        AND posLine.royaltyFreeSnapshot IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pos_transaction_line_item
      DROP COLUMN royaltyFreeSnapshot
    `);
  }
}
