import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPosReversalWorkflow1789473600007
  implements MigrationInterface
{
  name = 'AddPosReversalWorkflow1789473600007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pos_transaction
        ADD COLUMN reversalType varchar(10) NULL AFTER cancelledAt,
        ADD COLUMN reversalReason varchar(500) NULL AFTER reversalType,
        ADD COLUMN reversedByUserId int unsigned NULL AFTER reversalReason,
        ADD COLUMN reversedAt timestamp NULL AFTER reversedByUserId,
        ADD COLUMN refundPaymentId int unsigned NULL AFTER reversedAt,
        ADD UNIQUE INDEX UQ_pos_transaction_refundPaymentId (refundPaymentId)
    `);
    await queryRunner.query(`
      ALTER TABLE pos_transaction_line_item
        ADD COLUMN inventoryQuantityDeducted int unsigned NULL
        AFTER royaltyFreeSnapshot
    `);
    // Older paid lines predate the deduction snapshot. The current per-location
    // tracking row is the best available evidence for whether checkout reduced
    // stock; all new checkouts store the exact decision at payment time.
    await queryRunner.query(`
      UPDATE pos_transaction_line_item posLine
      INNER JOIN pos_transaction pos ON pos.id = posLine.posTransactionId
      LEFT JOIN item_location_stock stock
        ON stock.itemId = posLine.itemId
       AND stock.locationId = pos.locationId
      SET posLine.inventoryQuantityDeducted =
        CASE WHEN stock.trackInventory = 1 THEN posLine.quantity ELSE 0 END
      WHERE pos.status = 'PAID'
        AND posLine.inventoryQuantityDeducted IS NULL
    `);
    await queryRunner.query(`
      UPDATE pos_transaction_line_item
      SET inventoryQuantityDeducted = 0
      WHERE inventoryQuantityDeducted IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pos_transaction_line_item
        DROP COLUMN inventoryQuantityDeducted
    `);
    await queryRunner.query(`
      ALTER TABLE pos_transaction
        DROP INDEX UQ_pos_transaction_refundPaymentId,
        DROP COLUMN refundPaymentId,
        DROP COLUMN reversedAt,
        DROP COLUMN reversedByUserId,
        DROP COLUMN reversalReason,
        DROP COLUMN reversalType
    `);
  }
}
