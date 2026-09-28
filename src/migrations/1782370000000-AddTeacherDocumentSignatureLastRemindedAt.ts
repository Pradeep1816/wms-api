import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTeacherDocumentSignatureLastRemindedAt1782370000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE teacher_document_signature_request
        ADD COLUMN lastRemindedAt timestamp NULL AFTER requestedAt
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE teacher_document_signature_request
        DROP COLUMN lastRemindedAt
    `);
  }
}
