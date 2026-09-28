import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Records the last send attempt time and last failure reason for an enrolment
 * invitation email, so a failed send (e.g. SMTP unavailable) leaves a trail and
 * can be shown as "Send failed" on the dashboard's Sent Links tab. emailSentAt
 * stays reserved for successful sends only.
 */
export class AddDigitalEnrollmentInvitationEmailFailure1787500000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE digital_enrollment_invitation
        ADD emailLastAttemptAt timestamp NULL,
        ADD emailLastError varchar(500) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE digital_enrollment_invitation
        DROP COLUMN emailLastError,
        DROP COLUMN emailLastAttemptAt
    `);
  }
}
