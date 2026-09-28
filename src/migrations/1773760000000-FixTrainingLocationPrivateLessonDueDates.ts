import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixTrainingLocationPrivateLessonDueDates1773760000000
  implements MigrationInterface
{
  name = 'FixTrainingLocationPrivateLessonDueDates1773760000000';

  private readonly backupTable = 'migration_lesson_due_date_backup';
  private readonly migrationName =
    'FixTrainingLocationPrivateLessonDueDates1773760000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.backupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`lessonId\` int unsigned NOT NULL,
        \`privateLessonId\` int unsigned NULL,
        \`enrolmentId\` int unsigned NOT NULL,
        \`locationName\` varchar(255) NOT NULL,
        \`oldLessonDueDate\` date NOT NULL,
        \`oldPrivateLessonDueDate\` date NULL,
        \`newDueDate\` date NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`lessonId\`),
        KEY \`idx_${this.backupTable}_privateLessonId\` (\`privateLessonId\`),
        KEY \`idx_${this.backupTable}_enrolmentId\` (\`enrolmentId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.backupTable}\` (
        migrationName,
        lessonId,
        privateLessonId,
        enrolmentId,
        locationName,
        oldLessonDueDate,
        oldPrivateLessonDueDate,
        newDueDate
      )
      SELECT
        ? AS migrationName,
        l.id AS lessonId,
        pl.id AS privateLessonId,
        e.id AS enrolmentId,
        loc.name AS locationName,
        DATE(l.dueDate) AS oldLessonDueDate,
        DATE(pl.dueDate) AS oldPrivateLessonDueDate,
        DATE_ADD(
          DATE_SUB(
            DATE_FORMAT(DATE(COALESCE(l.originalDate, l.date)), '%Y-%m-01'),
            INTERVAL 1 MONTH
          ),
          INTERVAL 14 DAY
        ) AS newDueDate
      FROM enrolment e
      INNER JOIN course c
        ON c.id = e.courseId
       AND c.isDeleted = 0
      INNER JOIN location loc
        ON loc.id = c.locationId
       AND loc.name = 'Training Location'
      INNER JOIN program p
        ON p.id = c.programId
       AND p.isDeleted = 0
       AND p.type = 1
      INNER JOIN payment_frequency pf
        ON pf.id = e.paymentFrequencyId
       AND pf.frequencyLength = 1
      INNER JOIN lesson l
        ON l.courseId = e.courseId
       AND l.isDeleted = 0
       AND l.isConfirmed = 1
       AND l.status IN (1, 2, 5)
      INNER JOIN private_lesson pl
        ON pl.lessonId = l.id
      INNER JOIN student s
        ON s.id = e.studentId
       AND s.status = 1
       AND s.isDeleted = 0
      LEFT JOIN lesson_payment lp
        ON lp.lessonId = l.id
       AND lp.enrolmentId = e.id
       AND lp.isDeleted = 0
      WHERE e.isConfirmed = 1
        AND e.isDeleted = 0
        AND (
              e.endDateTime >= CURDATE()
           OR e.endDateTime = '0000-00-00 00:00:00'
        )
        AND (
              (l.status IN (1, 2) AND DATE(l.date) >= CURDATE())
           OR (l.status = 5 AND (pl.expiryDate IS NULL OR DATE(pl.expiryDate) >= CURDATE()))
        )
        AND lp.id IS NULL
        AND (
              DATE(l.dueDate) = DATE(l.date)
           OR DATE(pl.dueDate) = DATE(l.date)
        )
        AND (
          DATE(l.dueDate) <> DATE_ADD(
            DATE_SUB(
              DATE_FORMAT(DATE(COALESCE(l.originalDate, l.date)), '%Y-%m-01'),
              INTERVAL 1 MONTH
            ),
            INTERVAL 14 DAY
          )
          OR DATE(pl.dueDate) <> DATE_ADD(
            DATE_SUB(
              DATE_FORMAT(DATE(COALESCE(l.originalDate, l.date)), '%Y-%m-01'),
              INTERVAL 1 MONTH
            ),
            INTERVAL 14 DAY
          )
        )
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE lesson l
      INNER JOIN \`${this.backupTable}\` b
        ON b.lessonId = l.id
       AND b.migrationName = ?
      SET l.dueDate = b.newDueDate
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE private_lesson pl
      INNER JOIN \`${this.backupTable}\` b
        ON b.privateLessonId = pl.id
       AND b.migrationName = ?
      SET pl.dueDate = b.newDueDate
      `,
      [this.migrationName],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE lesson l
      INNER JOIN \`${this.backupTable}\` b
        ON b.lessonId = l.id
       AND b.migrationName = ?
      SET l.dueDate = b.oldLessonDueDate
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE private_lesson pl
      INNER JOIN \`${this.backupTable}\` b
        ON b.privateLessonId = pl.id
       AND b.migrationName = ?
      SET pl.dueDate = b.oldPrivateLessonDueDate
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `DELETE FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
  }
}
