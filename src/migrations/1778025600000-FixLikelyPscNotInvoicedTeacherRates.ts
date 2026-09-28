import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixLikelyPscNotInvoicedTeacherRates1778025600000
  implements MigrationInterface
{
  name = 'FixLikelyPscNotInvoicedTeacherRates1778025600000';

  private readonly backupTable =
    'smw_1143_likely_psc_not_invoiced_backup';
  private readonly migrationName =
    'FixLikelyPscNotInvoicedTeacherRates1778025600000';

  private readonly incidentStartDate = '2026-01-01';
  private readonly incidentEndDate = '2026-05-07';
  private readonly canceledLessonStatus = 4;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.backupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`lessonId\` int unsigned NOT NULL,
        \`courseId\` int unsigned NOT NULL,
        \`enrolmentId\` int unsigned NOT NULL,
        \`studentId\` int unsigned NOT NULL,
        \`customerId\` int unsigned NOT NULL,
        \`locationId\` int unsigned NOT NULL,
        \`programId\` int unsigned NOT NULL,
        \`activeTeacherId\` int unsigned NOT NULL,
        \`oldTeacherId\` int unsigned NULL,
        \`oldTeacherRate\` decimal(10,4) NULL,
        \`oldLessonTeacherRate\` decimal(10,4) NOT NULL,
        \`newLessonTeacherRate\` decimal(10,4) NOT NULL,
        \`lessonDate\` date NOT NULL,
        \`lessonCreatedOn\` timestamp NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`lessonId\`),
        KEY \`idx_smw1143_enrolmentId\` (\`enrolmentId\`),
        KEY \`idx_smw1143_courseId\` (\`courseId\`),
        KEY \`idx_smw1143_locationId\` (\`locationId\`),
        KEY \`idx_smw1143_activeTeacherId\` (\`activeTeacherId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.backupTable}\` (
        migrationName,
        lessonId,
        courseId,
        enrolmentId,
        studentId,
        customerId,
        locationId,
        programId,
        activeTeacherId,
        oldTeacherId,
        oldTeacherRate,
        oldLessonTeacherRate,
        newLessonTeacherRate,
        lessonDate,
        lessonCreatedOn
      )
      SELECT
        ? AS migrationName,
        l.id AS lessonId,
        c.id AS courseId,
        e.id AS enrolmentId,
        s.id AS studentId,
        s.customer_id AS customerId,
        loc.id AS locationId,
        p.id AS programId,
        l.teacherId AS activeTeacherId,
        MIN(old_l.teacherId) AS oldTeacherId,
        MIN(old_l.teacherRate) AS oldTeacherRate,
        l.teacherRate AS oldLessonTeacherRate,
        q.rate AS newLessonTeacherRate,
        DATE(l.date) AS lessonDate,
        l.createdOn AS lessonCreatedOn
      FROM lesson l
      INNER JOIN course c
        ON c.id = l.courseId
       AND c.isDeleted = 0
       AND c.isConfirmed = 1
       AND c.type = 1
      INNER JOIN enrolment e
        ON e.courseId = c.id
       AND e.isDeleted = 0
       AND e.isConfirmed = 1
      INNER JOIN student s
        ON s.id = e.studentId
       AND s.isDeleted = 0
      INNER JOIN location loc
        ON loc.id = c.locationId
       AND loc.isDeleted = 0
      INNER JOIN program p
        ON p.id = c.programId
       AND p.isDeleted = 0
       AND p.type = 1
      INNER JOIN private_lesson pl
        ON pl.lessonId = l.id
      INNER JOIN qualification q
        ON q.teacher_id = l.teacherId
       AND q.program_id = c.programId
       AND q.isDeleted = 0
       AND q.rate IS NOT NULL
      INNER JOIN lesson old_l
        ON old_l.courseId = l.courseId
       AND old_l.isDeleted = 0
       AND old_l.status = ?
       AND old_l.teacherId <> l.teacherId
       AND ROUND(old_l.teacherRate, 2) = ROUND(l.teacherRate, 2)
      WHERE l.isDeleted = 0
        AND l.isConfirmed = 1
        AND l.status <> ?
        AND l.type = 1
        AND (
             (
                  l.createdOn >= ?
              AND l.createdOn < DATE_ADD(?, INTERVAL 1 DAY)
             )
          OR (
                  l.createdOn IS NULL
              AND DATE(l.date) >= ?
             )
        )
        AND ROUND(l.teacherRate, 2) <> ROUND(q.rate, 2)
        AND NOT EXISTS (
          SELECT 1
          FROM invoice_item_lesson iil
          WHERE iil.lessonId = l.id
        )
      GROUP BY
        l.id,
        c.id,
        e.id,
        s.id,
        s.customer_id,
        loc.id,
        p.id,
        l.teacherId,
        l.teacherRate,
        q.rate,
        DATE(l.date),
        l.createdOn
      `,
      [
        this.migrationName,
        this.canceledLessonStatus,
        this.canceledLessonStatus,
        this.incidentStartDate,
        this.incidentEndDate,
        this.incidentStartDate,
      ],
    );

    await queryRunner.query(
      `
      UPDATE lesson l
      INNER JOIN \`${this.backupTable}\` b
        ON b.lessonId = l.id
       AND b.migrationName = ?
      SET
        l.teacherRate = b.newLessonTeacherRate,
        l.updatedOn = NOW()
      WHERE l.isDeleted = 0
        AND l.isConfirmed = 1
        AND l.status <> ?
        AND ROUND(l.teacherRate, 2) = ROUND(b.oldLessonTeacherRate, 2)
        AND NOT EXISTS (
          SELECT 1
          FROM invoice_item_lesson iil
          WHERE iil.lessonId = l.id
        )
      `,
      [this.migrationName, this.canceledLessonStatus],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE lesson l
      INNER JOIN \`${this.backupTable}\` b
        ON b.lessonId = l.id
       AND b.migrationName = ?
      SET
        l.teacherRate = b.oldLessonTeacherRate,
        l.updatedOn = NOW()
      WHERE ROUND(l.teacherRate, 2) = ROUND(b.newLessonTeacherRate, 2)
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `DELETE FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
  }
}
