import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tracks when an enrolment invitation link was emailed to the customer, so the
 * dashboard's "Sent Links" tab can show which links went out and when. Null when
 * the link was only generated/copied and never emailed.
 */
export class AddDigitalEnrollmentInvitationEmailSentAt1787400000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE digital_enrollment_invitation
        ADD emailSentAt timestamp NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE digital_enrollment_invitation
        DROP COLUMN emailSentAt
    `);
  }
}
