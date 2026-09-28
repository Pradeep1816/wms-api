import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixLikelyPscInvoicedTeacherRates1778025600001
  implements MigrationInterface
{
  name = 'FixLikelyPscInvoicedTeacherRates1778025600001';

  private readonly backupTable = 'smw_1143_likely_psc_invoiced_backup';
  private readonly migrationName =
    'FixLikelyPscInvoicedTeacherRates1778025600001';

  private readonly incidentStartDate = '2026-01-01';
  private readonly incidentEndDate = '2026-05-07';
  private readonly invoiceStartDate = '2026-05-01';
  private readonly invoiceEndDate = '2026-06-01';
  private readonly canceledLessonStatus = 4;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.backupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`lessonId\` int unsigned NOT NULL,
        \`invoiceLineItemId\` int unsigned NOT NULL,
        \`invoiceId\` int unsigned NOT NULL,
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
        \`oldInvoiceRate\` decimal(10,4) NULL,
        \`newInvoiceRate\` decimal(10,4) NOT NULL,
        \`oldInvoiceCost\` decimal(10,2) NULL,
        \`newInvoiceCost\` decimal(10,2) NOT NULL,
        \`lessonDate\` date NOT NULL,
        \`lessonCreatedOn\` timestamp NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`lessonId\`, \`invoiceLineItemId\`),
        KEY \`idx_smw1143_inv_enrolmentId\` (\`enrolmentId\`),
        KEY \`idx_smw1143_inv_courseId\` (\`courseId\`),
        KEY \`idx_smw1143_inv_locationId\` (\`locationId\`),
        KEY \`idx_smw1143_inv_invoiceId\` (\`invoiceId\`),
        KEY \`idx_smw1143_inv_activeTeacherId\` (\`activeTeacherId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.backupTable}\` (
        migrationName,
        lessonId,
        invoiceLineItemId,
        invoiceId,
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
        oldInvoiceRate,
        newInvoiceRate,
        oldInvoiceCost,
        newInvoiceCost,
        lessonDate,
        lessonCreatedOn
      )
      SELECT
        ? AS migrationName,
        l.id AS lessonId,
        ili.id AS invoiceLineItemId,
        inv.id AS invoiceId,
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
        ili.rate AS oldInvoiceRate,
        q.rate AS newInvoiceRate,
        ili.cost AS oldInvoiceCost,
        CASE
          WHEN l.status = 5 THEN CAST(0.00 AS DECIMAL(10,2))
          ELSE CAST(ROUND(q.rate * (TIME_TO_SEC(l.duration) / 3600), 2) AS DECIMAL(10,2))
        END AS newInvoiceCost,
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
      INNER JOIN lesson old_l
        ON old_l.courseId = l.courseId
       AND old_l.isDeleted = 0
       AND old_l.status = ?
       AND old_l.teacherId <> l.teacherId
       AND (
            ROUND(old_l.teacherRate, 2) = ROUND(l.teacherRate, 2)
         OR ROUND(old_l.teacherRate, 2) = ROUND(ili.rate, 2)
       )
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
        AND (
             ROUND(l.teacherRate, 2) <> ROUND(q.rate, 2)
          OR ROUND(ili.rate, 2) <> ROUND(q.rate, 2)
        )
        AND inv.date >= ?
        AND inv.date < ?
      GROUP BY
        l.id,
        ili.id,
        inv.id,
        c.id,
        e.id,
        s.id,
        s.customer_id,
        loc.id,
        p.id,
        l.teacherId,
        l.teacherRate,
        q.rate,
        ili.rate,
        ili.cost,
        l.status,
        l.duration,
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
        this.invoiceStartDate,
        this.invoiceEndDate,
      ],
    );

    await queryRunner.query(
      `
      UPDATE lesson l
      INNER JOIN (
        SELECT DISTINCT
          lessonId,
          newLessonTeacherRate
        FROM \`${this.backupTable}\`
        WHERE migrationName = ?
      ) b
        ON b.lessonId = l.id
      SET
        l.teacherRate = b.newLessonTeacherRate,
        l.updatedOn = NOW()
      WHERE l.isDeleted = 0
        AND l.isConfirmed = 1
        AND l.status <> ?
        AND ROUND(l.teacherRate, 2) <> ROUND(b.newLessonTeacherRate, 2)
      `,
      [this.migrationName, this.canceledLessonStatus],
    );

    await queryRunner.query(
      `
      UPDATE invoice_line_item ili
      INNER JOIN \`${this.backupTable}\` b
        ON b.invoiceLineItemId = ili.id
       AND b.migrationName = ?
      SET
        ili.rate = b.newInvoiceRate,
        ili.cost = b.newInvoiceCost
      WHERE ili.isDeleted = 0
        AND (
             ROUND(COALESCE(ili.rate, 0), 2) <> ROUND(b.newInvoiceRate, 2)
          OR ROUND(COALESCE(ili.cost, 0), 2) <> ROUND(b.newInvoiceCost, 2)
        )
      `,
      [this.migrationName],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE lesson l
      INNER JOIN (
        SELECT DISTINCT
          lessonId,
          oldLessonTeacherRate,
          newLessonTeacherRate
        FROM \`${this.backupTable}\`
        WHERE migrationName = ?
      ) b
        ON b.lessonId = l.id
      SET
        l.teacherRate = b.oldLessonTeacherRate,
        l.updatedOn = NOW()
      WHERE ROUND(l.teacherRate, 2) = ROUND(b.newLessonTeacherRate, 2)
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE invoice_line_item ili
      INNER JOIN \`${this.backupTable}\` b
        ON b.invoiceLineItemId = ili.id
       AND b.migrationName = ?
      SET
        ili.rate = b.oldInvoiceRate,
        ili.cost = b.oldInvoiceCost
      WHERE ROUND(COALESCE(ili.rate, 0), 2) = ROUND(b.newInvoiceRate, 2)
        AND ROUND(COALESCE(ili.cost, 0), 2) = ROUND(b.newInvoiceCost, 2)
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `DELETE FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
  }
}
