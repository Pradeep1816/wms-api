import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDigitalEnrollmentInvitation1779609600010 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE digital_enrollment_invitation (
        id int unsigned NOT NULL AUTO_INCREMENT,
        locationId int unsigned NOT NULL,
        locationSlug varchar(30) NOT NULL,
        tokenHash char(64) NOT NULL,
        status enum('pending', 'submitted', 'expired', 'cancelled') NOT NULL DEFAULT 'pending',
        customerEmail varchar(255) NULL,
        customerName varchar(255) NULL,
        expiresAt timestamp NULL,
        submittedAt timestamp NULL,
        submissionId int unsigned NULL,
        createdByUserId int unsigned NULL,
        cancelledAt timestamp NULL,
        cancelledByUserId int unsigned NULL,
        createdOn timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        updatedOn timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_digital_enrollment_invitation_token_hash (tokenHash),
        KEY IDX_digital_enrollment_invitation_location_id (locationId),
        KEY IDX_digital_enrollment_invitation_location_slug (locationSlug),
        KEY IDX_digital_enrollment_invitation_status (status),
        CONSTRAINT FK_digital_enrollment_invitation_location
          FOREIGN KEY (locationId) REFERENCES location(id),
        CONSTRAINT FK_digital_enrollment_invitation_submission
          FOREIGN KEY (submissionId) REFERENCES digital_enrollment_submission(id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE digital_enrollment_invitation
    `);
  }
}
