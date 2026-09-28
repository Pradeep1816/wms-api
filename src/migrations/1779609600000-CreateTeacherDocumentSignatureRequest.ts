import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTeacherDocumentSignatureRequest1779609600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE teacher_document_signature_request (
        id int unsigned NOT NULL AUTO_INCREMENT,
        locationId int unsigned NOT NULL,
        teacherId int NOT NULL,
        documentType enum('time_voucher', 'invoiced_lessons') NOT NULL,
        startDate date NOT NULL,
        endDate date NOT NULL,
        summaryOnly tinyint(1) NOT NULL DEFAULT 0,
        status enum('pending', 'signed', 'cancelled') NOT NULL DEFAULT 'pending',
        requestedByUserId int NOT NULL,
        requestedAt timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        signedByUserId int NULL,
        signedAt timestamp NULL DEFAULT NULL,
        signedSnapshotHtml longtext NULL,
        signedPdfUrl varchar(1024) NULL,
        isDeleted tinyint(1) NOT NULL DEFAULT 0,
        createdOn timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        updatedOn timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_tdsr_teacher_lookup (locationId, teacherId, documentType, startDate, endDate, summaryOnly, isDeleted),
        KEY idx_tdsr_teacher_status (locationId, teacherId, status, isDeleted),
        KEY idx_tdsr_requested_by (requestedByUserId),
        KEY idx_tdsr_signed_by (signedByUserId),
        CONSTRAINT fk_tdsr_location FOREIGN KEY (locationId) REFERENCES location (id),
        CONSTRAINT fk_tdsr_teacher FOREIGN KEY (teacherId) REFERENCES user (id),
        CONSTRAINT fk_tdsr_requested_by FOREIGN KEY (requestedByUserId) REFERENCES user (id),
        CONSTRAINT fk_tdsr_signed_by FOREIGN KEY (signedByUserId) REFERENCES user (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE teacher_document_signature_request');
  }
}
