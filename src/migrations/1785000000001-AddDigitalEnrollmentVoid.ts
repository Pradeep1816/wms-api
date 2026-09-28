import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDigitalEnrollmentVoid1785000000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE digital_enrollment_submission
        ADD voidedAt timestamp NULL,
        ADD voidReason varchar(500) NULL,
        ADD voidedByUserId int unsigned NULL,
        ADD KEY IDX_digital_enrollment_submission_voided_at (voidedAt)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE digital_enrollment_submission
        DROP KEY IDX_digital_enrollment_submission_voided_at,
        DROP COLUMN voidedByUserId,
        DROP COLUMN voidReason,
        DROP COLUMN voidedAt
    `);
  }
}
