import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixEnrolmentDiscountValueTypeInversion1786455143000 implements MigrationInterface {
  name = 'FixEnrolmentDiscountValueTypeInversion1786455143000';

  private readonly migrationName =
    'FixEnrolmentDiscountValueTypeInversion1786455143000';
  private readonly backupTable =
    'migration_enrolment_discount_value_type_backup';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.backupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`enrolmentDiscountId\` int unsigned NOT NULL,
        \`enrolmentId\` int unsigned NOT NULL,
        \`discountCategoryType\` int NOT NULL,
        \`discountValue\` double NULL,
        \`oldDiscountType\` int NOT NULL,
        \`newDiscountType\` int NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`enrolmentDiscountId\`),
        KEY \`idx_enrol_discount_type_bk_enrol\` (\`enrolmentId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.backupTable}\` (
        migrationName,
        enrolmentDiscountId,
        enrolmentId,
        discountCategoryType,
        discountValue,
        oldDiscountType,
        newDiscountType
      )
      SELECT
        ? AS migrationName,
        ed.id AS enrolmentDiscountId,
        ed.enrolmentId AS enrolmentId,
        ed.type AS discountCategoryType,
        ed.discount AS discountValue,
        ed.discountType AS oldDiscountType,
        CASE
          WHEN ed.type = 1 THEN 0
          WHEN ed.type = 2 THEN 1
        END AS newDiscountType
      FROM enrolment_discount ed
      WHERE (ed.type = 1 AND ed.discountType <> 0)
         OR (ed.type = 2 AND ed.discountType <> 1)
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE enrolment_discount ed
      INNER JOIN \`${this.backupTable}\` b
        ON b.enrolmentDiscountId = ed.id
       AND b.migrationName = ?
      SET ed.discountType = b.newDiscountType
      `,
      [this.migrationName],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE enrolment_discount ed
      INNER JOIN \`${this.backupTable}\` b
        ON b.enrolmentDiscountId = ed.id
       AND b.migrationName = ?
      SET ed.discountType = b.oldDiscountType
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `DELETE FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
  }
}
