import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPosTransactionAuditFields1780838436733 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pos_transaction
        ADD COLUMN createdByUserId int unsigned NULL,
        ADD COLUMN soldByUserId int unsigned NULL,
        ADD COLUMN paidAt timestamp NULL,
        ADD COLUMN cancelledByUserId int unsigned NULL,
        ADD COLUMN cancelledAt timestamp NULL,
        ADD KEY IDX_pos_transaction_created_by_user (createdByUserId),
        ADD KEY IDX_pos_transaction_sold_by_user (soldByUserId),
        ADD KEY IDX_pos_transaction_cancelled_by_user (cancelledByUserId)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pos_transaction
        DROP KEY IDX_pos_transaction_cancelled_by_user,
        DROP KEY IDX_pos_transaction_sold_by_user,
        DROP KEY IDX_pos_transaction_created_by_user,
        DROP COLUMN cancelledAt,
        DROP COLUMN cancelledByUserId,
        DROP COLUMN paidAt,
        DROP COLUMN soldByUserId,
        DROP COLUMN createdByUserId
    `);
  }
}
