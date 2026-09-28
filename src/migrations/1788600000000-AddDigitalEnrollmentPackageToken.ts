import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-submission token for the public enrolment-package PDF link.
 *
 * The package link used the submission's `token`, but for a kiosk submission
 * that token is the shared, persistent kiosk token — so the link matched every
 * kiosk submission at the location and could show another family's enrolment
 * form. This adds a unique, per-submission `packageToken` used for the link
 * instead. Nullable (MySQL allows multiple NULLs under a unique index); existing
 * rows get one generated on first use. Idempotent.
 */
export class AddDigitalEnrollmentPackageToken1788600000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(
      'digital_enrollment_submission',
      'packageToken',
    );
    if (!hasColumn) {
      await queryRunner.query(`
        ALTER TABLE digital_enrollment_submission
          ADD packageToken varchar(128) NULL
      `);
      await queryRunner.query(`
        CREATE UNIQUE INDEX IDX_digital_enrollment_submission_package_token
          ON digital_enrollment_submission (packageToken)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(
      'digital_enrollment_submission',
      'packageToken',
    );
    if (hasColumn) {
      await queryRunner.query(`
        DROP INDEX IDX_digital_enrollment_submission_package_token
          ON digital_enrollment_submission
      `);
      await queryRunner.query(`
        ALTER TABLE digital_enrollment_submission
          DROP COLUMN packageToken
      `);
    }
  }
}
