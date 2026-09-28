import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMediaAndOnlineLessonConsentToStudent1786682566419 implements MigrationInterface {
    name = 'AddMediaAndOnlineLessonConsentToStudent1786682566419'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
        ALTER TABLE student
        ADD COLUMN mediaAndOnlineLessonConsent TINYINT(1) NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
        ALTER TABLE student
        DROP COLUMN mediaAndOnlineLessonConsent
        `);
    }

}
