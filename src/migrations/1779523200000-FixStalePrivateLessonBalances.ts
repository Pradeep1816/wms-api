import { DataSource, MigrationInterface, QueryRunner } from 'typeorm';
import { CustomerBalanceCalculationRepository } from '../customer/repositories/customer-balance-calculation.repository';

export class FixStalePrivateLessonBalances1779523200000
  implements MigrationInterface
{
  name = 'FixStalePrivateLessonBalances1779523200000';

  private readonly backupTable =
    'migration_stale_private_lesson_balance_backup';
  private readonly migrationName =
    'FixStalePrivateLessonBalances1779523200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.backupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`privateLessonId\` int unsigned NOT NULL,
        \`lessonId\` int unsigned NOT NULL,
        \`locationId\` int unsigned NOT NULL,
        \`oldTotal\` decimal(10,4) NOT NULL,
        \`oldBalance\` decimal(10,4) NOT NULL,
        \`newBalance\` decimal(10,4) NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`privateLessonId\`),
        KEY \`idx_${this.backupTable}_lessonId\` (\`lessonId\`),
        KEY \`idx_${this.backupTable}_locationId\` (\`locationId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.backupTable}\` (
        migrationName,
        privateLessonId,
        lessonId,
        locationId,
        oldTotal,
        oldBalance,
        newBalance
      )
      SELECT
        ? AS migrationName,
        pl.id AS privateLessonId,
        pl.lessonId AS lessonId,
        c.locationId AS locationId,
        CAST(ROUND(pl.total, 4) AS DECIMAL(10,4)) AS oldTotal,
        CAST(ROUND(pl.balance, 4) AS DECIMAL(10,4)) AS oldBalance,
        CAST(
          ROUND(
            pl.total - COALESCE(paid.totalPaid, 0),
            4
          ) AS DECIMAL(10,4)
        ) AS newBalance
      FROM private_lesson pl
      INNER JOIN lesson l
        ON l.id = pl.lessonId
       AND l.isDeleted = 0
       AND l.isConfirmed = 1
       AND l.status <> 4
      INNER JOIN course c
        ON c.id = l.courseId
       AND c.isDeleted = 0
       AND c.isConfirmed = 1
      INNER JOIN program prog
        ON prog.id = c.programId
       AND prog.type = 1
      LEFT JOIN (
        SELECT
          lp.lessonId,
          ROUND(SUM(lp.amount), 4) AS totalPaid
        FROM lesson_payment lp
        INNER JOIN payment pay
          ON pay.id = lp.paymentId
         AND pay.isDeleted = 0
         AND pay.payment_method_id <> 2
        WHERE lp.isDeleted = 0
        GROUP BY lp.lessonId
      ) paid
        ON paid.lessonId = pl.lessonId
      WHERE l.date >= '2026-01-01 00:00:00'
        AND c.locationId <> 22
        AND ROUND(pl.balance, 2) > 0.09
        AND ROUND(pl.total - COALESCE(paid.totalPaid, 0), 2) <= 0.09
        AND ROUND(pl.total - COALESCE(paid.totalPaid, 0), 2) >= 0
        AND NOT EXISTS (
          SELECT 1
          FROM invoice_item_lesson iil
          INNER JOIN invoice_line_item ili
            ON ili.id = iil.invoiceLineItemId
           AND ili.isDeleted = 0
           AND ili.item_type_id = 1
          INNER JOIN invoice i
            ON i.id = ili.invoice_id
           AND i.isDeleted = 0
           AND i.isCanceled = 0
           AND i.type = 2
          WHERE iil.lessonId = pl.lessonId
            AND ROUND(i.balance, 2) > 0.09
        )
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE private_lesson pl
      INNER JOIN \`${this.backupTable}\` b
        ON b.privateLessonId = pl.id
       AND b.migrationName = ?
      SET
        pl.balance = b.newBalance
      `,
      [this.migrationName],
    );

    await this.refreshAffectedCustomerBalances(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE private_lesson pl
      INNER JOIN \`${this.backupTable}\` b
        ON b.privateLessonId = pl.id
       AND b.migrationName = ?
      SET
        pl.balance = b.oldBalance
      `,
      [this.migrationName],
    );

    await this.refreshAffectedCustomerBalances(queryRunner);

    await queryRunner.query(
      `DELETE FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
  }

  private async refreshAffectedCustomerBalances(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      `
      SELECT DISTINCT s.customer_id AS customerId
      FROM \`${this.backupTable}\` b
      INNER JOIN lesson_payment lp
        ON lp.lessonId = b.lessonId
       AND lp.isDeleted = 0
      INNER JOIN enrolment e
        ON e.id = lp.enrolmentId
       AND e.isDeleted = 0
       AND e.isConfirmed = 1
      INNER JOIN student s
        ON s.id = e.studentId
      WHERE b.migrationName = ?
      `,
      [this.migrationName],
    );

    if (!rows.length) {
      return;
    }

    const customerBalanceRepository = new CustomerBalanceCalculationRepository(
      queryRunner.connection as DataSource,
    );

    for (const row of rows) {
      const customerId = Number(row.customerId || 0);
      if (!Number.isFinite(customerId) || customerId <= 0) {
        continue;
      }

      const balance = await customerBalanceRepository.calculateBalance(
        customerId,
        queryRunner.manager,
      );

      await customerBalanceRepository.upsertCustomerAccountBalance(customerId, balance, {
        manager: queryRunner.manager,
      });
    }
  }
}
