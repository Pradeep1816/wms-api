import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSignatureDataUrlToUserProfile1782895280047 implements MigrationInterface {
  //name = 'AddSignatureDataUrlToUserProfile1782895280047';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user_profile
      ADD COLUMN signatureDataUrl LONGTEXT NULL AFTER businessName
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user_profile
      DROP COLUMN signatureDataUrl
    `);
  }
}