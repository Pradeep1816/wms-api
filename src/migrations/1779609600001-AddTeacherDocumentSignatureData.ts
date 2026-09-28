import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTeacherDocumentSignatureData1779609600001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE teacher_document_signature_request
        ADD COLUMN signedSignerName varchar(255) NULL AFTER signedAt,
        ADD COLUMN signedSignatureDataUrl longtext NULL AFTER signedSignerName
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE teacher_document_signature_request
        DROP COLUMN signedSignatureDataUrl,
        DROP COLUMN signedSignerName
    `);
  }
}
