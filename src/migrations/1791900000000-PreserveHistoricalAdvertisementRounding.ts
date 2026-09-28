import { MigrationInterface, QueryRunner } from 'typeorm';

/** Distinguish source-only historical payments from new, possibly backdated,
 * payments. Ledger events already carry this distinction in schemaVersion:
 * version 1 was backfilled; version 2 captured advertisement at write time. */
export class PreserveHistoricalAdvertisementRounding1791900000000 implements MigrationInterface {
  name = 'PreserveHistoricalAdvertisementRounding1791900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Nullable during backfill makes a partially completed MySQL DDL migration
    // resumable. Never reclassify payments already assigned a version.
    if (
      !(await queryRunner.hasColumn(
        'payment',
        'advertisementCalculationVersion',
      ))
    ) {
      await queryRunner.query(
        `ALTER TABLE payment ADD COLUMN advertisementCalculationVersion tinyint unsigned NULL DEFAULT NULL`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE payment ALTER COLUMN advertisementCalculationVersion SET DEFAULT 2`,
    );
    await queryRunner.query(`
      UPDATE payment p
      SET p.advertisementCalculationVersion = CASE WHEN EXISTS (
        SELECT 1 FROM royalty_transaction r
        WHERE r.paymentId = p.id AND r.schemaVersion >= 2
          AND r.eventType = 'PAYMENT_RECEIVED'
      ) THEN 2 ELSE 1 END,
      p.date = p.date, p.updatedOn = p.updatedOn
      WHERE p.advertisementCalculationVersion IS NULL
    `);
    await queryRunner.query(
      `ALTER TABLE payment MODIFY COLUMN advertisementCalculationVersion tinyint unsigned NOT NULL DEFAULT 2`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (
      await queryRunner.hasColumn('payment', 'advertisementCalculationVersion')
    ) {
      await queryRunner.query(
        `ALTER TABLE payment DROP COLUMN advertisementCalculationVersion`,
      );
    }
  }
}
