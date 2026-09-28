import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDateStartedToUserLocation1779609600004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user_location
      ADD COLUMN dateStarted date NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user_location
      DROP COLUMN dateStarted
    `);
  }
}
