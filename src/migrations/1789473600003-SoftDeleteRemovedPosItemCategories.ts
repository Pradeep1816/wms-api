import { MigrationInterface, QueryRunner } from 'typeorm';

export class SoftDeleteRemovedPosItemCategories1789473600003 implements MigrationInterface {
  name = 'SoftDeleteRemovedPosItemCategories1789473600003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE item_category
      SET isDeleted = 1
      WHERE name IN (
        'Gift Card',
        'Musicfest',
        'Non Lesson',
        'Non Method Books',
        'Opening Balance',
        'Payment Credit'
      )
        AND isDeleted = 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE item_category
      SET isDeleted = 0
      WHERE name IN (
        'Gift Card',
        'Musicfest',
        'Non Lesson',
        'Non Method Books',
        'Opening Balance',
        'Payment Credit'
      )
        AND isDeleted = 1
    `);
  }
}
