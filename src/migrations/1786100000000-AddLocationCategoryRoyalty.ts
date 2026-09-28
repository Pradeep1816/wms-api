import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLocationCategoryRoyalty1786100000000 implements MigrationInterface {
  name = 'AddLocationCategoryRoyalty1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE location_category_royalty (
        id int unsigned NOT NULL AUTO_INCREMENT,
        locationId int unsigned NOT NULL,
        itemCategoryId int unsigned NOT NULL,
        royality decimal(5,2) NOT NULL DEFAULT 0.00,
        createdOn timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        updatedOn timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        createdByUserId int NULL,
        updatedByUserId int NULL,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_location_category_royalty (locationId, itemCategoryId)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      INSERT INTO location_category_royalty (
        locationId,
        itemCategoryId,
        royality
      )
      SELECT
        location.id,
        category.id,
        COALESCE(category.royality, 0)
      FROM location
      CROSS JOIN item_category category
      WHERE location.isDeleted = 0
        AND category.isDeleted = 0
        AND category.id NOT IN (1, 4)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE location_category_royalty');
  }
}
