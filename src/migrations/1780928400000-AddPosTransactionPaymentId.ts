import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPosTransactionPaymentId1780928400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pos_transaction
        ADD COLUMN paymentId int unsigned NULL AFTER soldByUserId,
        ADD KEY IDX_pos_transaction_payment_id (paymentId)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pos_transaction
        DROP KEY IDX_pos_transaction_payment_id,
        DROP COLUMN paymentId
    `);
  }
}
