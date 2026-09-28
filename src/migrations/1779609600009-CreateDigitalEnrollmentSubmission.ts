import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDigitalEnrollmentSubmission1779609600009 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE digital_enrollment_submission (
        id int unsigned NOT NULL AUTO_INCREMENT,
        locationId int unsigned NOT NULL,
        locationSlug varchar(30) NOT NULL,
        token varchar(128) NOT NULL,
        status enum('submitted', 'reviewing', 'converted', 'rejected') NOT NULL DEFAULT 'submitted',
        studentData longtext NOT NULL,
        guardianData longtext NOT NULL,
        programPreferenceData longtext NOT NULL,
        schedulePreferenceData longtext NOT NULL,
        feeSnapshotData longtext NOT NULL,
        policyAcknowledgementData longtext NOT NULL,
        signaturePrintedName varchar(255) NOT NULL,
        signatureSignedDate date NOT NULL,
        signatureDataUrl longtext NOT NULL,
        submittedIpAddress varchar(64) NULL,
        submittedUserAgent varchar(512) NULL,
        submittedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reviewedAt timestamp NULL,
        createdOn timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        updatedOn timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY IDX_digital_enrollment_submission_location_id (locationId),
        KEY IDX_digital_enrollment_submission_location_slug (locationSlug),
        KEY IDX_digital_enrollment_submission_token (token),
        CONSTRAINT FK_digital_enrollment_submission_location
          FOREIGN KEY (locationId) REFERENCES location(id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE digital_enrollment_submission
    `);
  }
}
