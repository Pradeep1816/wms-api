import { MigrationInterface, QueryRunner } from 'typeorm';

/** SMW-1659: existing advertisement history was not captured. Freeze the
 * location's migration-time lesson rate as the explicit historical baseline. */
export class AddCategoryAdvertisementSnapshots1791600000000 implements MigrationInterface {
  name = 'AddCategoryAdvertisementSnapshots1791600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE location_debt ADD COLUMN advertisementBaseline decimal(5,2) NULL`,
    );
    await queryRunner.query(
      `UPDATE location_debt SET advertisementBaseline = value WHERE type = 2`,
    );
    await queryRunner.query(
      `ALTER TABLE location_category_royalty ADD COLUMN advertisement decimal(5,2) NOT NULL DEFAULT 0`,
    );
    // Include locations/categories without an existing royalty mapping without
    // modifying existing royalty configuration.
    await queryRunner.query(`
      INSERT INTO location_category_royalty (locationId, itemCategoryId, royality, advertisement)
      SELECT l.id, c.id, 0, COALESCE(d.advertisementBaseline, 0)
      FROM location l CROSS JOIN item_category c
      LEFT JOIN location_debt d ON d.locationId = l.id AND d.type = 2
      WHERE l.isDeleted = 0 AND c.isDeleted = 0 AND c.id NOT IN (1, 4)
      ON DUPLICATE KEY UPDATE advertisement = VALUES(advertisement)
    `);
    await queryRunner.query(`
      UPDATE location_category_royalty r
      LEFT JOIN location_debt d ON d.locationId = r.locationId AND d.type = 2
      SET r.advertisement = COALESCE(d.advertisementBaseline, 0)
    `);
    for (const table of [
      'invoice_line_item',
      'lesson_payment',
      'pos_transaction_line_item',
      'royalty_transaction',
    ]) {
      await queryRunner.query(
        `ALTER TABLE ${table} ADD COLUMN advertisementRateApplied decimal(5,2) NOT NULL DEFAULT 0`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE royalty_transaction ADD COLUMN advertisementAmount decimal(12,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(`
      UPDATE invoice_line_item li
      JOIN invoice i ON i.id = li.invoice_id
      LEFT JOIN location_debt d ON d.locationId = i.location_id AND d.type = 2
      SET li.advertisementRateApplied = CASE WHEN li.royaltyFree = 1 OR li.royaltyCategoryId = 4 THEN 0 ELSE COALESCE(d.advertisementBaseline, 0) END
    `);
    // The deployed schema has ON UPDATE CURRENT_TIMESTAMP on lesson_payment.date.
    // Preserve the allocation date while backfilling this unrelated snapshot.
    await queryRunner.query(`
      UPDATE lesson_payment lp
      JOIN lesson l ON l.id = lp.lessonId
      JOIN course c ON c.id = l.courseId
      LEFT JOIN location_debt d ON d.locationId = c.locationId AND d.type = 2
      SET lp.advertisementRateApplied = COALESCE(d.advertisementBaseline, 0),
          lp.date = lp.date
    `);
    await queryRunner.query(`
      UPDATE pos_transaction_line_item li
      JOIN pos_transaction p ON p.id = li.posTransactionId
      LEFT JOIN item i ON i.id = li.itemId
      LEFT JOIN location_debt d ON d.locationId = p.locationId AND d.type = 2
      SET li.advertisementRateApplied = CASE WHEN COALESCE(li.royaltyFreeSnapshot, i.royaltyFree, 0) = 1 OR li.royaltyCategoryId = 4 THEN 0 ELSE COALESCE(d.advertisementBaseline, 0) END
    `);
    await queryRunner.query(`
      UPDATE royalty_transaction r
      LEFT JOIN location_debt d ON d.locationId = r.locationId AND d.type = 2
      SET r.advertisementRateApplied = CASE WHEN r.royaltyFree = 1 OR r.itemCategoryId = 4 THEN 0 ELSE COALESCE(d.advertisementBaseline, 0) END
    `);
    await queryRunner.query(`
      UPDATE royalty_transaction SET advertisementAmount = CASE WHEN eventType = 'ALLOCATION' THEN 0 ELSE ROUND(revenueAmount * advertisementRateApplied / 100, 2) END
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE royalty_transaction DROP COLUMN advertisementAmount',
    );
    for (const table of [
      'royalty_transaction',
      'pos_transaction_line_item',
      'lesson_payment',
      'invoice_line_item',
    ]) {
      await queryRunner.query(
        `ALTER TABLE ${table} DROP COLUMN advertisementRateApplied`,
      );
    }
    await queryRunner.query(
      'ALTER TABLE location_category_royalty DROP COLUMN advertisement',
    );
    await queryRunner.query(
      'ALTER TABLE location_debt DROP COLUMN advertisementBaseline',
    );
  }
}
