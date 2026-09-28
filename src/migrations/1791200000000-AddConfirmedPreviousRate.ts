import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remembers the hourly rate staff confirmed when a post-cutover enrolment has
 * no historical course rate to restore.
 *
 * This deliberately does not backfill or re-price any enrolment. Existing
 * affected records are repaired through Change Pricing, where a person sees
 * and confirms the suggested program rate before any lesson money moves.
 *
 * Idempotent because an environment may already have the entity column from
 * an earlier schema sync or an out-of-band schema update while still missing
 * this migration's history row.
 */
export class AddConfirmedPreviousRate1791200000000 implements MigrationInterface {
  name = 'AddConfirmedPreviousRate1791200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(
      'enrolment',
      'confirmedPreviousRate',
    );

    if (!hasColumn) {
      await queryRunner.query(`
        ALTER TABLE enrolment
          ADD COLUMN confirmedPreviousRate decimal(10,2) NULL
            AFTER previousRateApprovedOn
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(
      'enrolment',
      'confirmedPreviousRate',
    );

    if (hasColumn) {
      await queryRunner.query(`
        ALTER TABLE enrolment
          DROP COLUMN confirmedPreviousRate
      `);
    }
  }
}
