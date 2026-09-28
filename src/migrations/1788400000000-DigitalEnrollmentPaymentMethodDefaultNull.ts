import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The digital-enrolment payment method used to default to 'e-transfer', which
 * made the completed-enrolment email/PDF/card fabricate an e-transfer amount
 * before any human confirmed how the family would pay. Per client feedback the
 * payment section must stay blank ("Not selected") until staff choose a method,
 * so the column default becomes NULL. Existing rows are left untouched.
 */
export class DigitalEnrollmentPaymentMethodDefaultNull1788400000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE digital_enrollment_submission
        ALTER COLUMN paymentMethod DROP DEFAULT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE digital_enrollment_submission
        ALTER COLUMN paymentMethod SET DEFAULT 'e-transfer'
    `);
  }
}
