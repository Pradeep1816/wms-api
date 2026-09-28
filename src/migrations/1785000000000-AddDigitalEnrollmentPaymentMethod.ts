import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDigitalEnrollmentPaymentMethod1785000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE digital_enrollment_submission
        ADD paymentMethod varchar(20) NULL DEFAULT 'e-transfer'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE digital_enrollment_submission
        DROP COLUMN paymentMethod
    `);
  }
}
