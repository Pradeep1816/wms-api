import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameItemCategoriesFromClientList1789473600004 implements MigrationInterface {
  name = 'RenameItemCategoriesFromClientList1789473600004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE item_category
      SET name = CASE name
        WHEN 'Account Adjustments' THEN 'Account Corrections'
        WHEN 'Arcadia Examinations' THEN 'Head Office'
        WHEN 'Band' THEN 'Group'
        WHEN 'Methods Books' THEN 'Lesson Books'
        WHEN 'Repairing Charges' THEN 'Repair Charges'
        WHEN 'Smallware' THEN 'Smallware & Accessories'
        ELSE name
      END
      WHERE name IN (
        'Account Adjustments',
        'Arcadia Examinations',
        'Band',
        'Methods Books',
        'Repairing Charges',
        'Smallware'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE item_category
      SET name = CASE name
        WHEN 'Account Corrections' THEN 'Account Adjustments'
        WHEN 'Head Office' THEN 'Arcadia Examinations'
        WHEN 'Group' THEN 'Band'
        WHEN 'Lesson Books' THEN 'Methods Books'
        WHEN 'Repair Charges' THEN 'Repairing Charges'
        WHEN 'Smallware & Accessories' THEN 'Smallware'
        ELSE name
      END
      WHERE name IN (
        'Account Corrections',
        'Head Office',
        'Group',
        'Lesson Books',
        'Repair Charges',
        'Smallware & Accessories'
      )
    `);
  }
}
