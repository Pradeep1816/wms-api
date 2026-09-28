import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDigitalEnrollmentAdditionalStudents1785000000005
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE digital_enrollment_submission
        ADD additionalStudentsData text NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE digital_enrollment_submission
        DROP COLUMN additionalStudentsData
    `);
  }
}
