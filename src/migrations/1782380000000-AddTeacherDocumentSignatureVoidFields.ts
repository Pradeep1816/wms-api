import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTeacherDocumentSignatureVoidFields1782380000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 'void' is distinct from 'cancelled': voiding is a school action on a
    // retained document, while 'cancelled' stays reserved for a teacher
    // withdrawing their own request.
    await queryRunner.query(`
      ALTER TABLE teacher_document_signature_request
        MODIFY COLUMN status enum('pending', 'signed', 'cancelled', 'void')
          NOT NULL DEFAULT 'pending',
        ADD COLUMN voidedByUserId int NULL AFTER signedSignerName,
        ADD COLUMN voidedAt timestamp NULL AFTER voidedByUserId,
        ADD COLUMN voidReason varchar(500) NULL AFTER voidedAt
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Any voided rows have to lose the value before the enum can shrink.
    await queryRunner.query(`
      UPDATE teacher_document_signature_request
        SET status = 'cancelled'
        WHERE status = 'void'
    `);
    await queryRunner.query(`
      ALTER TABLE teacher_document_signature_request
        MODIFY COLUMN status enum('pending', 'signed', 'cancelled')
          NOT NULL DEFAULT 'pending',
        DROP COLUMN voidReason,
        DROP COLUMN voidedAt,
        DROP COLUMN voidedByUserId
    `);
  }
}
