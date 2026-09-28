import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDigitalEnrollmentConversionLinks1779609600011 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE digital_enrollment_submission
        ADD linkedCustomerId int unsigned NULL,
        ADD linkedStudentId int unsigned NULL,
        ADD linkedEnrolmentId int unsigned NULL,
        ADD linkedCourseId int unsigned NULL,
        ADD convertedAt timestamp NULL,
        ADD KEY IDX_digital_enrollment_submission_linked_customer (linkedCustomerId),
        ADD KEY IDX_digital_enrollment_submission_linked_student (linkedStudentId),
        ADD KEY IDX_digital_enrollment_submission_linked_enrolment (linkedEnrolmentId),
        ADD KEY IDX_digital_enrollment_submission_linked_course (linkedCourseId)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE digital_enrollment_submission
        DROP KEY IDX_digital_enrollment_submission_linked_course,
        DROP KEY IDX_digital_enrollment_submission_linked_enrolment,
        DROP KEY IDX_digital_enrollment_submission_linked_student,
        DROP KEY IDX_digital_enrollment_submission_linked_customer,
        DROP COLUMN convertedAt,
        DROP COLUMN linkedCourseId,
        DROP COLUMN linkedEnrolmentId,
        DROP COLUMN linkedStudentId,
        DROP COLUMN linkedCustomerId
    `);
  }
}
