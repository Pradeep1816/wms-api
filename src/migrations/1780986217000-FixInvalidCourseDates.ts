import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixInvalidCourseDates1780986217000
  implements MigrationInterface
{
  name = 'FixInvalidCourseDates1780986217000';

  private readonly backupTable = 'migration_invalid_course_dates_backup';
  private readonly migrationName = 'FixInvalidCourseDates1780986217000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.backupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`courseId\` int unsigned NOT NULL,
        \`oldStartDate\` varchar(32) NULL,
        \`oldEndDate\` varchar(32) NULL,
        \`newStartDate\` varchar(32) NULL,
        \`newEndDate\` varchar(32) NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`courseId\`),
        KEY \`idx_${this.backupTable}_courseId\` (\`courseId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.backupTable}\` (
        migrationName,
        courseId,
        oldStartDate,
        oldEndDate,
        newStartDate,
        newEndDate
      )
      SELECT
        ? AS migrationName,
        c.id AS courseId,
        CAST(c.startDate AS CHAR(32)) AS oldStartDate,
        CAST(c.endDate AS CHAR(32)) AS oldEndDate,
        CASE c.id
          WHEN 10195 THEN '2020-03-03 18:45:00'
          WHEN 13484 THEN '2021-08-09 19:00:00'
          WHEN 15895 THEN '2022-01-24 16:00:00'
          WHEN 15973 THEN '2022-02-02 19:45:00'
          WHEN 22808 THEN '2023-08-30 17:30:00'
          WHEN 26897 THEN '2024-10-08 19:00:00'
          ELSE NULL
        END AS newStartDate,
        CASE c.id
          WHEN 29035 THEN '2027-06-05 09:15:00'
          ELSE NULL
        END AS newEndDate
      FROM course c
      WHERE c.id IN (10195, 13484, 15895, 15973, 22808, 26897, 29035)
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE course c
      INNER JOIN \`${this.backupTable}\` b
        ON b.courseId = c.id
       AND b.migrationName = ?
      SET
        c.startDate = COALESCE(b.newStartDate, c.startDate),
        c.endDate = COALESCE(b.newEndDate, c.endDate)
      `,
      [this.migrationName],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE course c
      INNER JOIN \`${this.backupTable}\` b
        ON b.courseId = c.id
       AND b.migrationName = ?
      SET
        c.startDate = b.oldStartDate,
        c.endDate = b.oldEndDate
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `DELETE FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
  }
}
