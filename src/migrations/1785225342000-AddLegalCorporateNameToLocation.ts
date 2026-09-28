import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLegalCorporateNameToLocation1785225342000 implements MigrationInterface {
  name = 'AddLegalCorporateNameToLocation1785225342000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE location
      ADD COLUMN legal_corporate_name varchar(255) NULL AFTER name
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE location
      DROP COLUMN legal_corporate_name
    `);
  }
}
