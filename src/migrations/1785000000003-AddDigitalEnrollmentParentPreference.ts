import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDigitalEnrollmentParentPreference1785000000003
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE digital_enrollment_submission
        ADD parentPreferenceData text NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE digital_enrollment_submission
        DROP COLUMN parentPreferenceData
    `);
  }
}
