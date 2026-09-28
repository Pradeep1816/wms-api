import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDigitalEnrollmentSource1785000000004
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE digital_enrollment_submission
        ADD submissionSource varchar(20) NULL DEFAULT 'invitation'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE digital_enrollment_submission
        DROP COLUMN submissionSource
    `);
  }
}
