import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillZeroCategoryRoyaltiesFromLessonRate1791300000000 implements MigrationInterface {
  name = 'BackfillZeroCategoryRoyaltiesFromLessonRate1791300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The category royalty UI treats a missing location/category mapping as
    // 0%. Materialize those effective zeroes with the location's current
    // lesson royalty before updating explicit zero-valued mappings below.
    await queryRunner.query(`
      INSERT INTO location_category_royalty (
        locationId,
        itemCategoryId,
        royality
      )
      SELECT
        location.id,
        category.id,
        lessonRoyalty.value
      FROM location
      INNER JOIN location_debt lessonRoyalty
        ON lessonRoyalty.locationId = location.id
        AND lessonRoyalty.type = 1
      CROSS JOIN item_category category
      WHERE location.isDeleted = 0
        AND category.isDeleted = 0
        AND category.id NOT IN (1, 4)
        AND NOT EXISTS (
          SELECT 1
          FROM location_category_royalty existingRate
          WHERE existingRate.locationId = location.id
            AND existingRate.itemCategoryId = category.id
        )
    `);

    await queryRunner.query(`
      UPDATE location_category_royalty locationRate
      INNER JOIN location
        ON location.id = locationRate.locationId
        AND location.isDeleted = 0
      INNER JOIN item_category category
        ON category.id = locationRate.itemCategoryId
        AND category.isDeleted = 0
        AND category.id NOT IN (1, 4)
      INNER JOIN location_debt lessonRoyalty
        ON lessonRoyalty.locationId = location.id
        AND lessonRoyalty.type = 1
      SET locationRate.royality = lessonRoyalty.value
      WHERE locationRate.royality = 0
    `);
  }

  public down(queryRunner: QueryRunner): Promise<void> {
    // This is an intentional data backfill. Reverting every matching rate to
    // zero could erase legitimate changes made after deployment, so rollback
    // is deliberately a no-op.
    void queryRunner;
    return Promise.resolve();
  }
}
