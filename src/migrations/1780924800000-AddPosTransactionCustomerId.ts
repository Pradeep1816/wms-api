import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPosTransactionCustomerId1780924800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pos_transaction
        ADD COLUMN customer_id int unsigned NULL AFTER customerInfo,
        ADD KEY IDX_pos_transaction_customer_id (customer_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pos_transaction
        DROP KEY IDX_pos_transaction_customer_id,
        DROP COLUMN customer_id
    `);
  }
}
