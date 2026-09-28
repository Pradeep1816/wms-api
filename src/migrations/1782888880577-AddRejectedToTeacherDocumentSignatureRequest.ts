import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRejectedToTeacherDocumentSignatureRequest1782888880577 implements MigrationInterface {
    name = 'AddRejectedToTeacherDocumentSignatureRequest1782888880577'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE teacher_document_signature_request
            ADD COLUMN reason TEXT NULL
        `);

        await queryRunner.query(`
            ALTER TABLE teacher_document_signature_request
            MODIFY COLUMN status ENUM(
            'pending',
            'signed',
            'cancelled',
            'rejected'
            ) NOT NULL DEFAULT 'pending'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {

        await queryRunner.query(`
            ALTER TABLE teacher_document_signature_request
            MODIFY COLUMN status ENUM(
            'pending',
            'signed',
            'cancelled'
            ) NOT NULL DEFAULT 'pending'
        `);
        
        await queryRunner.query(`
            ALTER TABLE teacher_document_signature_request
            DROP COLUMN reason
        `);
    }

}
