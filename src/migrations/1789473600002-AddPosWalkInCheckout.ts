import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPosWalkInCheckout1789473600002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE pos_transaction ADD COLUMN isWalkIn tinyint(1) NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE pos_transaction DROP COLUMN isWalkIn`);
  }
}
