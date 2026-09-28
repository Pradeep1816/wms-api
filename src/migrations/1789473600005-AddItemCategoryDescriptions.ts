import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddItemCategoryDescriptions1789473600005 implements MigrationInterface {
  name = 'AddItemCategoryDescriptions1789473600005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE item_category
      ADD COLUMN description varchar(500) NULL AFTER name
    `);

    await queryRunner.query(`
      UPDATE item_category
      SET description = CASE name
        WHEN 'Account Corrections' THEN 'Corrections or adjustments made to customer accounts'
        WHEN 'Concert' THEN 'Items or expenses specifically related to concerts and performances at local schools'
        WHEN 'Group' THEN 'Group lessons: Bands, Theory, Songwriting etc.'
        WHEN 'Head Office' THEN 'Items or charges specifically associated with Head Office: Musicfest, Exams, etc'
        WHEN 'Instrument' THEN 'Musical instruments such as Keyboard, Guitar, Violin, Flute'
        WHEN 'Lesson' THEN 'Piano, Guitar, Violin, Flute, etc.'
        WHEN 'Lesson Books' THEN 'Books used as part of music instruction'
        WHEN 'Rentals' THEN 'Rental instruments or other rental-related items'
        WHEN 'Repair Charges' THEN 'Instrument repair, maintenance, or repair-related charges'
        WHEN 'Smallware & Accessories' THEN 'Smaller music-related items such as strings, picks, tuners, stands, cables, and similar accessories'
        ELSE description
      END
      WHERE name IN (
        'Account Corrections',
        'Concert',
        'Group',
        'Head Office',
        'Instrument',
        'Lesson',
        'Lesson Books',
        'Rentals',
        'Repair Charges',
        'Smallware & Accessories'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE item_category
      DROP COLUMN description
    `);
  }
}
