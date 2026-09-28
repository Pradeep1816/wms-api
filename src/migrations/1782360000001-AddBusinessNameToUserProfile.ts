import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBusinessNameToUserProfile1782360000001 implements MigrationInterface {
  name = 'AddBusinessNameToUserProfile1782360000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user_profile
      ADD COLUMN businessName varchar(255) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user_profile
      DROP COLUMN businessName
    `);
  }
}
