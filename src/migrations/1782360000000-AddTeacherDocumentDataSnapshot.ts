import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTeacherDocumentDataSnapshot1782360000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE teacher_document_signature_request
        ADD COLUMN documentDataSnapshot longtext NULL AFTER disclosureSnapshot
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE teacher_document_signature_request
        DROP COLUMN documentDataSnapshot
    `);
  }
}
