import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stores a point-in-time copy of the enrolment package (fees, schedule,
 * discounts, lesson count) captured when the enrolment is first attached to a
 * digital enrolment submission. The digital-enrolment detail page / PDF / email
 * read this snapshot so later edits to the enrolment or its discounts do not
 * retroactively change what the customer originally enrolled with. Additional
 * students keep their own snapshot inside additionalStudentsData (no column).
 */
export class AddDigitalEnrollmentPackageSnapshot1787300000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE digital_enrollment_submission
        ADD enrollmentPackageSnapshot longtext NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE digital_enrollment_submission
        DROP COLUMN enrollmentPackageSnapshot
    `);
  }
}
