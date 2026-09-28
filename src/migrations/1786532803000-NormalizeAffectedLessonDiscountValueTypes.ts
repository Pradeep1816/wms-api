import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeAffectedLessonDiscountValueTypes1786532803000 implements MigrationInterface {
  name = 'NormalizeAffectedLessonDiscountValueTypes1786532803000';

  private readonly migrationName =
    'NormalizeAffectedLessonDiscountValueTypes1786532803000';
  private readonly sourceMigrationName =
    'FixEnrolmentDiscountValueTypeInversion1786455143000';
  private readonly backupTable = 'migration_lesson_discount_value_type_backup';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.backupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`lessonDiscountId\` int unsigned NOT NULL,
        \`lessonId\` int unsigned NOT NULL,
        \`enrolmentId\` int unsigned NULL,
        \`discountCategoryType\` int NOT NULL,
        \`discountValue\` decimal(10,4) NULL,
        \`oldValueType\` tinyint(1) NOT NULL,
        \`newValueType\` tinyint(1) NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`lessonDiscountId\`),
        KEY \`idx_lesson_discount_type_bk_lesson\` (\`lessonId\`),
        KEY \`idx_lesson_discount_type_bk_enrol\` (\`enrolmentId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    const existingRows = (await queryRunner.query(
      `SELECT COUNT(*) AS rowCount FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    )) as Array<{ rowCount: number | string }>;
    if (Number(existingRows[0]?.rowCount ?? 0) !== 0) {
      throw new Error(
        `${this.migrationName}: an earlier unrecorded attempt left backup rows; review them before retrying`,
      );
    }

    await queryRunner.query(
      `
      INSERT INTO \`${this.backupTable}\` (
        migrationName,
        lessonDiscountId,
        lessonId,
        enrolmentId,
        discountCategoryType,
        discountValue,
        oldValueType,
        newValueType
      )
      SELECT
        ? AS migrationName,
        ld.id AS lessonDiscountId,
        ld.lessonId,
        ld.enrolmentId,
        ld.type AS discountCategoryType,
        ld.value AS discountValue,
        ld.valueType AS oldValueType,
        CASE
          WHEN ld.type = 2 THEN 1
          WHEN ld.type = 3 THEN 0
        END AS newValueType
      FROM lesson_discount ld
      INNER JOIN (
        SELECT DISTINCT enrolmentId
        FROM migration_enrolment_discount_value_type_backup
        WHERE migrationName = ?
      ) affected
        ON affected.enrolmentId = ld.enrolmentId
      WHERE (ld.type = 2 AND ld.valueType <> 1)
         OR (ld.type = 3 AND ld.valueType <> 0)
      `,
      [this.migrationName, this.sourceMigrationName],
    );

    await queryRunner.query(
      `
      UPDATE lesson_discount ld
      INNER JOIN \`${this.backupTable}\` b
        ON b.lessonDiscountId = ld.id
       AND b.migrationName = ?
      SET ld.valueType = b.newValueType
      WHERE ld.valueType = b.oldValueType
      `,
      [this.migrationName],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE lesson_discount ld
      INNER JOIN \`${this.backupTable}\` b
        ON b.lessonDiscountId = ld.id
       AND b.migrationName = ?
      SET ld.valueType = b.oldValueType
      WHERE ld.valueType = b.newValueType
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `DELETE FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
  }
}
