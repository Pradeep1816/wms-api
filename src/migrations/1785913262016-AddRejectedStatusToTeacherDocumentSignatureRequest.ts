import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRejectedStatusToTeacherDocumentSignatureRequest1785913262016 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE teacher_document_signature_request
            CHANGE COLUMN reason rejection_reason TEXT NULL
        `);

        await queryRunner.query(`
            ALTER TABLE teacher_document_signature_request
            MODIFY COLUMN status ENUM(
                'pending',
                'signed',
                'cancelled',
                'void',
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
                'cancelled',
                'void'
            ) NOT NULL DEFAULT 'pending'
        `);
        
        await queryRunner.query(`
            ALTER TABLE teacher_document_signature_request
            CHANGE COLUMN rejection_reason reason TEXT NULL
        `);
    }

}
