import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTeacherDocumentDisclosures1782260000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE teacher_document_disclosure (
        id int unsigned NOT NULL AUTO_INCREMENT,
        documentType enum('time_voucher', 'invoiced_lessons') NOT NULL,
        content longtext NOT NULL,
        createdByUserId int NOT NULL,
        updatedByUserId int NOT NULL,
        createdOn timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        updatedOn timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_tdd_document_type (documentType),
        KEY idx_tdd_created_by (createdByUserId),
        KEY idx_tdd_updated_by (updatedByUserId),
        CONSTRAINT fk_tdd_created_by FOREIGN KEY (createdByUserId) REFERENCES user (id),
        CONSTRAINT fk_tdd_updated_by FOREIGN KEY (updatedByUserId) REFERENCES user (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      ALTER TABLE teacher_document_signature_request
        ADD COLUMN disclosureSnapshot longtext NULL AFTER signedPdfUrl
    `);

    await queryRunner.query(`
      ALTER TABLE location_flags
        ADD COLUMN teacherDocumentDisclosures varchar(20) NOT NULL DEFAULT 'modern'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE location_flags
        DROP COLUMN teacherDocumentDisclosures
    `);

    await queryRunner.query(`
      ALTER TABLE teacher_document_signature_request
        DROP COLUMN disclosureSnapshot
    `);

    await queryRunner.query('DROP TABLE teacher_document_disclosure');
  }
}
