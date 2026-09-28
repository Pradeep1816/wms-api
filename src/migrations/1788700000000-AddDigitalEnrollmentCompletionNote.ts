import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDigitalEnrollmentCompletionNote1788700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (
      !(await queryRunner.hasColumn(
        'digital_enrollment_submission',
        'completionNote',
      ))
    ) {
      await queryRunner.query(
        'ALTER TABLE digital_enrollment_submission ADD completionNote text NULL',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (
      await queryRunner.hasColumn(
        'digital_enrollment_submission',
        'completionNote',
      )
    ) {
      await queryRunner.query(
        'ALTER TABLE digital_enrollment_submission DROP COLUMN completionNote',
      );
    }
  }
}
