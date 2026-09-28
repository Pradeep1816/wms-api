import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixDirtyPrivateLessonPfDiscountValueTypes1780838436732
  implements MigrationInterface
{
  name = 'FixDirtyPrivateLessonPfDiscountValueTypes1780838436732';

  private readonly migrationName =
    'FixDirtyPrivateLessonPfDiscountValueTypes1780838436732';
  private readonly backupTable =
    'migration_dirty_private_lesson_pf_discount_value_type_backup';
  // Keep the earliest 2018 enrolments out of this backfill.
  private readonly excludedEnrolmentIds = [
    230, 320, 631, 677, 720, 773, 778, 857, 912, 919, 1205, 1212,
  ] as const;

  private excludedEnrolmentIdList(): string {
    return this.excludedEnrolmentIds.join(', ');
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.backupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`lessonDiscountId\` int unsigned NOT NULL,
        \`lessonId\` int unsigned NOT NULL,
        \`enrolmentId\` int unsigned NULL,
        \`discountType\` int NOT NULL,
        \`discountValue\` decimal(10,4) NULL,
        \`oldValueType\` tinyint(1) NOT NULL,
        \`newValueType\` tinyint(1) NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`lessonDiscountId\`),
        KEY \`idx_pf_bk_lesson\` (\`lessonId\`),
        KEY \`idx_pf_bk_enrol\` (\`enrolmentId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.backupTable}\` (
        migrationName,
        lessonDiscountId,
        lessonId,
        enrolmentId,
        discountType,
        discountValue,
        oldValueType,
        newValueType
      )
      SELECT
        ? AS migrationName,
        ld.id AS lessonDiscountId,
        ld.lessonId AS lessonId,
        ld.enrolmentId AS enrolmentId,
        ld.type AS discountType,
        ld.value AS discountValue,
        ld.valueType AS oldValueType,
        1 AS newValueType
      FROM lesson_discount ld
      WHERE ld.type = 2
        AND ld.valueType = 0
        AND ld.enrolmentId NOT IN (${this.excludedEnrolmentIdList()})
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE lesson_discount ld
      INNER JOIN \`${this.backupTable}\` b
        ON b.lessonDiscountId = ld.id
       AND b.migrationName = ?
      SET ld.valueType = b.newValueType
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
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `DELETE FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
  }
}
