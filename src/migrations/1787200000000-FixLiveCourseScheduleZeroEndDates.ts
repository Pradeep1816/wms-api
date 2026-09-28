import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fill course_schedule.endDate when it is MySQL zero-date (0000-00-00) on a
 * still-live recent schedule. Confirming Permanent Schedule Change calls
 * Date.toISOString() on that column and throws "Invalid time value".
 *
 * Scope (matches the live FILL set, ~1131 rows):
 * - isRecent = 1
 * - endDate is 0000-00-00
 * - enrolment still live (last lesson, course.endDate, enrolment.endDateTime,
 *   or schedule start on/after CURDATE())
 * - derived end is on or after schedule.startDate
 *
 * Derived end, first match:
 *   1. course.endDate
 *   2. enrolment.endDateTime
 *   3. MAX(lesson.date) not deleted / not canceled
 *
 * Does not touch ended history or REVIEW rows (all candidates before start).
 */
export class FixLiveCourseScheduleZeroEndDates1787200000000
  implements MigrationInterface
{
  name = 'FixLiveCourseScheduleZeroEndDates1787200000000';

  private readonly backupTable = 'migration_live_course_schedule_zero_end_backup';
  private readonly migrationName = 'FixLiveCourseScheduleZeroEndDates1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.backupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`scheduleId\` int unsigned NOT NULL,
        \`courseId\` int unsigned NOT NULL,
        \`oldStartDate\` varchar(32) NULL,
        \`oldEndDate\` varchar(32) NULL,
        \`newEndDate\` varchar(32) NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`scheduleId\`),
        KEY \`idx_${this.backupTable}_courseId\` (\`courseId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.backupTable}\` (
        migrationName,
        scheduleId,
        courseId,
        oldStartDate,
        oldEndDate,
        newEndDate
      )
      SELECT
        ? AS migrationName,
        eligible.scheduleId,
        eligible.courseId,
        eligible.oldStartDate,
        eligible.oldEndDate,
        CAST(eligible.newEndDate AS CHAR(32)) AS newEndDate
      FROM (
        SELECT
          cs.id AS scheduleId,
          cs.courseId,
          CAST(cs.startDate AS CHAR(32)) AS oldStartDate,
          CAST(cs.endDate AS CHAR(32)) AS oldEndDate,
          COALESCE(
            IF(
              CAST(c.endDate AS CHAR) NOT LIKE '0000%'
              AND c.endDate >= cs.startDate,
              c.endDate,
              NULL
            ),
            IF(
              CAST(e.endDateTime AS CHAR) NOT LIKE '0000%'
              AND e.endDateTime >= cs.startDate,
              e.endDateTime,
              NULL
            ),
            IF(last.lastDate >= cs.startDate, last.lastDate, NULL)
          ) AS newEndDate
        FROM course_schedule cs
        INNER JOIN course c
          ON c.id = cs.courseId
         AND c.isDeleted = 0
        LEFT JOIN (
          SELECT
            courseId,
            MAX(NULLIF(endDateTime, '0000-00-00 00:00:00')) AS endDateTime
          FROM enrolment
          WHERE isDeleted = 0
          GROUP BY courseId
        ) e ON e.courseId = cs.courseId
        LEFT JOIN (
          SELECT courseId, MAX(date) AS lastDate
          FROM lesson
          WHERE isDeleted = 0
            AND status != 4
          GROUP BY courseId
        ) last ON last.courseId = cs.courseId
        WHERE cs.isRecent = 1
          AND CAST(cs.endDate AS CHAR) LIKE '0000%'
          AND (
               last.lastDate >= CURDATE()
            OR (
              CAST(c.endDate AS CHAR) NOT LIKE '0000%'
              AND c.endDate >= CURDATE()
            )
            OR (
              CAST(e.endDateTime AS CHAR) NOT LIKE '0000%'
              AND e.endDateTime >= CURDATE()
            )
            OR cs.startDate >= CURDATE()
          )
      ) eligible
      WHERE eligible.newEndDate IS NOT NULL
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE course_schedule cs
      INNER JOIN \`${this.backupTable}\` b
        ON b.scheduleId = cs.id
       AND b.migrationName = ?
      SET cs.endDate = b.newEndDate
      WHERE CAST(cs.endDate AS CHAR) LIKE '0000%'
      `,
      [this.migrationName],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE course_schedule cs
      INNER JOIN \`${this.backupTable}\` b
        ON b.scheduleId = cs.id
       AND b.migrationName = ?
      SET cs.endDate = b.oldEndDate
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `DELETE FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
  }
}
