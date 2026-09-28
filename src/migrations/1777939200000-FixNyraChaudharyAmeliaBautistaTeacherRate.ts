import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixNyraChaudharyAmeliaBautistaTeacherRate1777939200000
  implements MigrationInterface
{
  name = 'FixNyraChaudharyAmeliaBautistaTeacherRate1777939200000';

  private readonly backupTable = 'migration_lesson_teacher_rate_backup';
  private readonly migrationName =
    'FixNyraChaudharyAmeliaBautistaTeacherRate1777939200000';

  private readonly enrolmentId = 21530;
  private readonly locationId = 21;
  private readonly invoicedLessonStartDate = '2026-04-01';
  private readonly futureLessonStartDate = '2026-05-05';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!Number.isInteger(this.enrolmentId) || this.enrolmentId <= 0) {
      throw new Error(
        `${this.name}: set enrolmentId before running this migration`,
      );
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.backupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`lessonId\` int unsigned NOT NULL,
        \`enrolmentId\` int unsigned NOT NULL,
        \`courseId\` int unsigned NOT NULL,
        \`studentId\` int unsigned NOT NULL,
        \`teacherId\` int unsigned NOT NULL,
        \`invoiceLineItemId\` int unsigned NOT NULL DEFAULT 0,
        \`oldLessonTeacherRate\` decimal(10,4) NOT NULL,
        \`newLessonTeacherRate\` decimal(10,4) NOT NULL,
        \`oldInvoiceRate\` decimal(10,4) NULL,
        \`newInvoiceRate\` decimal(10,4) NULL,
        \`oldInvoiceCost\` decimal(10,2) NULL,
        \`newInvoiceCost\` decimal(10,2) NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`lessonId\`, \`invoiceLineItemId\`),
        KEY \`idx_${this.backupTable}_enrolmentId\` (\`enrolmentId\`),
        KEY \`idx_${this.backupTable}_teacherId\` (\`teacherId\`),
        KEY \`idx_${this.backupTable}_invoiceLineItemId\` (\`invoiceLineItemId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.backupTable}\` (
        migrationName,
        lessonId,
        enrolmentId,
        courseId,
        studentId,
        teacherId,
        invoiceLineItemId,
        oldLessonTeacherRate,
        newLessonTeacherRate
      )
      SELECT
        ? AS migrationName,
        l.id AS lessonId,
        e.id AS enrolmentId,
        c.id AS courseId,
        s.id AS studentId,
        l.teacherId AS teacherId,
        0 AS invoiceLineItemId,
        l.teacherRate AS oldLessonTeacherRate,
        q.rate AS newLessonTeacherRate
      FROM enrolment e
      INNER JOIN student s
        ON s.id = e.studentId
       AND s.isDeleted = 0
      INNER JOIN course c
        ON c.id = e.courseId
       AND c.isDeleted = 0
      INNER JOIN location loc
        ON loc.id = c.locationId
       AND loc.id = ?
       AND loc.isDeleted = 0
      INNER JOIN program p
        ON p.id = c.programId
       AND p.isDeleted = 0
       AND p.type = 1
      INNER JOIN lesson l
        ON l.courseId = c.id
       AND l.isDeleted = 0
       AND l.status <> 4
      INNER JOIN private_lesson pl
        ON pl.lessonId = l.id
      INNER JOIN user_profile tp
        ON tp.user_id = l.teacherId
      INNER JOIN qualification q
        ON q.teacher_id = l.teacherId
       AND q.program_id = c.programId
       AND q.isDeleted = 0
       AND q.rate IS NOT NULL
      WHERE e.id = ?
        AND e.isDeleted = 0
        AND e.isConfirmed = 1
        AND DATE(l.date) >= ?
        AND ROUND(COALESCE(l.teacherRate, 0), 2) = 23.00
        AND NOT EXISTS (
          SELECT 1
          FROM invoice_item_lesson iil
          INNER JOIN invoice_line_item ili
            ON ili.id = iil.invoiceLineItemId
           AND ili.isDeleted = 0
          INNER JOIN invoice inv
            ON inv.id = ili.invoice_id
           AND inv.isDeleted = 0
           AND inv.type = 2
           AND inv.isCanceled = 0
           AND inv.isVoid = 0
          WHERE iil.lessonId = l.id
        )
      `,
      [
        this.migrationName,
        this.locationId,
        this.enrolmentId,
        this.futureLessonStartDate,
      ],
    );

    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.backupTable}\` (
        migrationName,
        lessonId,
        enrolmentId,
        courseId,
        studentId,
        teacherId,
        invoiceLineItemId,
        oldLessonTeacherRate,
        newLessonTeacherRate,
        oldInvoiceRate,
        newInvoiceRate,
        oldInvoiceCost,
        newInvoiceCost
      )
      SELECT
        ? AS migrationName,
        l.id AS lessonId,
        e.id AS enrolmentId,
        c.id AS courseId,
        s.id AS studentId,
        l.teacherId AS teacherId,
        ili.id AS invoiceLineItemId,
        l.teacherRate AS oldLessonTeacherRate,
        q.rate AS newLessonTeacherRate,
        ili.rate AS oldInvoiceRate,
        q.rate AS newInvoiceRate,
        ili.cost AS oldInvoiceCost,
        CASE
          WHEN l.status = 5 THEN CAST(0.00 AS DECIMAL(10,2))
          ELSE CAST(ROUND(q.rate * (TIME_TO_SEC(l.duration) / 3600), 2) AS DECIMAL(10,2))
        END AS newInvoiceCost
      FROM enrolment e
      INNER JOIN student s
        ON s.id = e.studentId
       AND s.isDeleted = 0
      INNER JOIN course c
        ON c.id = e.courseId
       AND c.isDeleted = 0
      INNER JOIN location loc
        ON loc.id = c.locationId
       AND loc.id = ?
       AND loc.isDeleted = 0
      INNER JOIN program p
        ON p.id = c.programId
       AND p.isDeleted = 0
       AND p.type = 1
      INNER JOIN lesson l
        ON l.courseId = c.id
       AND l.isDeleted = 0
       AND l.status <> 4
      INNER JOIN private_lesson pl
        ON pl.lessonId = l.id
      INNER JOIN qualification q
        ON q.teacher_id = l.teacherId
       AND q.program_id = c.programId
       AND q.isDeleted = 0
       AND q.rate IS NOT NULL
      INNER JOIN invoice_item_lesson iil
        ON iil.lessonId = l.id
      INNER JOIN invoice_line_item ili
        ON ili.id = iil.invoiceLineItemId
       AND ili.isDeleted = 0
      INNER JOIN invoice inv
        ON inv.id = ili.invoice_id
       AND inv.isDeleted = 0
       AND inv.type = 2
       AND inv.isCanceled = 0
       AND inv.isVoid = 0
      WHERE e.id = ?
        AND e.isDeleted = 0
        AND e.isConfirmed = 1
        AND DATE(l.date) >= ?
        AND ROUND(COALESCE(ili.rate, 0), 2) = 23.00
        AND ROUND(COALESCE(ili.rate, 0), 2) <> ROUND(COALESCE(q.rate, 0), 2)
      `,
      [
        this.migrationName,
        this.locationId,
        this.enrolmentId,
        this.invoicedLessonStartDate,
      ],
    );

    await queryRunner.query(
      `
      UPDATE lesson l
      INNER JOIN (
        SELECT DISTINCT lessonId, newLessonTeacherRate
        FROM \`${this.backupTable}\`
        WHERE migrationName = ?
      ) b
        ON b.lessonId = l.id
      SET l.teacherRate = b.newLessonTeacherRate
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE invoice_line_item ili
      INNER JOIN \`${this.backupTable}\` b
        ON b.invoiceLineItemId = ili.id
       AND b.migrationName = ?
       AND b.invoiceLineItemId <> 0
      SET
        ili.rate = b.newInvoiceRate,
        ili.cost = b.newInvoiceCost
      `,
      [this.migrationName],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE lesson l
      INNER JOIN (
        SELECT DISTINCT lessonId, oldLessonTeacherRate
        FROM \`${this.backupTable}\`
        WHERE migrationName = ?
      ) b
        ON b.lessonId = l.id
      SET l.teacherRate = b.oldLessonTeacherRate
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE invoice_line_item ili
      INNER JOIN \`${this.backupTable}\` b
        ON b.invoiceLineItemId = ili.id
       AND b.migrationName = ?
       AND b.invoiceLineItemId <> 0
      SET
        ili.rate = b.oldInvoiceRate,
        ili.cost = b.oldInvoiceCost
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `DELETE FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
  }
}
