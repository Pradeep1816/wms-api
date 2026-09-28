import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stores the staff-entered payment figures for a digital-enrolment submission.
 * The fabricated amounts were removed (they produced wrong e-transfer / total
 * figures), so the front desk now types the real amounts and they flow to the
 * completed-enrolment email and the enrolment-form PDF. Stored as JSON so the
 * set of figures (amount, lessonPaymentFee, rentalFee, booksFee, totalFeePayable)
 * can grow without further migrations. Nullable — blank until staff enter it.
 *
 * Idempotent: the column may already exist in an environment where it was added
 * out-of-band, so guard the ADD/DROP with a column-existence check.
 */
export class AddDigitalEnrollmentPaymentAmounts1788500000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(
      'digital_enrollment_submission',
      'paymentAmounts',
    );
    if (!hasColumn) {
      await queryRunner.query(`
        ALTER TABLE digital_enrollment_submission
          ADD paymentAmounts text NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(
      'digital_enrollment_submission',
      'paymentAmounts',
    );
    if (hasColumn) {
      await queryRunner.query(`
        ALTER TABLE digital_enrollment_submission
          DROP COLUMN paymentAmounts
      `);
    }
  }
}
