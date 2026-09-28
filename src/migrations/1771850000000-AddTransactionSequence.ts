import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTransactionSequence1771850000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add transactionSequence column
    await queryRunner.addColumn(
      'pos_transaction',
      new TableColumn({
        name: 'transactionSequence',
        type: 'int',
        default: 0,
        isNullable: false,
      }),
    );

    // Backfill existing transactions with sequence numbers per location
    await queryRunner.query(`
      UPDATE pos_transaction t
      JOIN (
        SELECT id, locationId,
          ROW_NUMBER() OVER (PARTITION BY locationId ORDER BY id) as seq
        FROM pos_transaction
      ) ranked ON t.id = ranked.id
      SET t.transactionSequence = ranked.seq
    `);

    // Add unique constraint (no separate index needed)
    await queryRunner.query(`
      ALTER TABLE pos_transaction 
      ADD UNIQUE KEY uq_location_sequence (locationId, transactionSequence)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop unique constraint
    await queryRunner.query(`
      ALTER TABLE pos_transaction DROP INDEX uq_location_sequence
    `);

    // Drop column
    await queryRunner.dropColumn('pos_transaction', 'transactionSequence');
  }
}