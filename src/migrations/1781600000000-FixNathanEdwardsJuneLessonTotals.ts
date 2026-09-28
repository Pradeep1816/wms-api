import { DataSource, MigrationInterface, QueryRunner } from 'typeorm';
import { CustomerBalanceCalculationRepository } from '../customer/repositories/customer-balance-calculation.repository';

/**
 * Follow-up repair for Nathan Edwards' June extra lessons.
 *
 * The relink migration repaired the payment and discount rows, but some target
 * databases still held the old stored lesson totals on the active June rows.
 * This migration normalizes the active lesson and private lesson totals back
 * to the pre-paid rate and refreshes the derived balances.
 */
export class FixNathanEdwardsJuneLessonTotals1781600000000
  implements MigrationInterface
{
  name = 'FixNathanEdwardsJuneLessonTotals1781600000000';

  private readonly migrationName =
    'FixNathanEdwardsJuneLessonTotals1781600000000';
  private readonly backupTable =
    'migration_nathan_edwards_june_lesson_total_backup';
  private readonly affectedCustomerId = 12909;
  private readonly restoredLessonTotal = 29.25;
  private readonly lessonIds = [5225701, 5225703, 5225704, 5225705] as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createBackupTable(queryRunner);
    await this.backupCurrentTotals(queryRunner);
    await this.restoreActiveTotals(queryRunner);
    await this.refreshBalances(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.restoreBackedUpTotals(queryRunner);
    await this.refreshBalances(queryRunner);

    await queryRunner.query(
      `DELETE FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
  }

  private getLessonIdList(): string {
    return this.lessonIds.join(', ');
  }

  private async createBackupTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.backupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`lessonId\` int unsigned NOT NULL,
        \`lessonTotal\` decimal(10,4) NOT NULL,
        \`privateLessonTotal\` decimal(10,4) NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`lessonId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);
  }

  private async backupCurrentTotals(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.backupTable}\` (
        migrationName,
        lessonId,
        lessonTotal,
        privateLessonTotal
      )
      SELECT
        ? AS migrationName,
        l.id AS lessonId,
        l.total AS lessonTotal,
        pl.total AS privateLessonTotal
      FROM lesson l
      INNER JOIN private_lesson pl
        ON pl.lessonId = l.id
      WHERE l.id IN (${this.getLessonIdList()})
      `,
      [this.migrationName],
    );
  }

  private async restoreActiveTotals(queryRunner: QueryRunner): Promise<void> {
    const lessonTotal = String(this.restoredLessonTotal.toFixed(4));

    await queryRunner.query(
      `
      UPDATE lesson
      SET total = ${lessonTotal}
      WHERE id IN (${this.getLessonIdList()})
      `,
    );

    await queryRunner.query(
      `
      UPDATE private_lesson
      SET total = ${lessonTotal}
      WHERE lessonId IN (${this.getLessonIdList()})
      `,
    );
  }

  private async restoreBackedUpTotals(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE lesson l
      INNER JOIN \`${this.backupTable}\` b
        ON b.migrationName = ?
       AND b.lessonId = l.id
      SET l.total = b.lessonTotal
      WHERE l.id IN (${this.getLessonIdList()})
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      UPDATE private_lesson pl
      INNER JOIN \`${this.backupTable}\` b
        ON b.migrationName = ?
       AND b.lessonId = pl.lessonId
      SET pl.total = b.privateLessonTotal
      WHERE pl.lessonId IN (${this.getLessonIdList()})
      `,
      [this.migrationName],
    );
  }

  private async refreshBalances(queryRunner: QueryRunner): Promise<void> {
    const lessonIdList = this.getLessonIdList();

    await queryRunner.query(
      `
      UPDATE private_lesson pl
      LEFT JOIN (
        SELECT
          lessonId,
          ROUND(SUM(amount), 4) AS totalPaid
        FROM lesson_payment
        WHERE isDeleted = 0
          AND lessonId IN (${lessonIdList})
        GROUP BY lessonId
      ) paid
        ON paid.lessonId = pl.lessonId
      SET pl.balance = CAST(ROUND(pl.total - COALESCE(paid.totalPaid, 0), 4) AS DECIMAL(10,4))
      WHERE pl.lessonId IN (${lessonIdList})
      `,
    );

    await queryRunner.query(
      `
      UPDATE lesson l
      INNER JOIN private_lesson pl
        ON pl.lessonId = l.id
      SET l.paidStatus = CASE
        WHEN ROUND(pl.balance, 2) <= 0.09 THEN 1
        ELSE 3
      END
      WHERE l.id IN (${lessonIdList})
      `,
    );

    const customerBalanceRepository = new CustomerBalanceCalculationRepository(
      queryRunner.connection as DataSource,
    );

    const balance = await customerBalanceRepository.calculateBalance(
      this.affectedCustomerId,
      queryRunner.manager,
    );

    await customerBalanceRepository.upsertCustomerAccountBalance(
      this.affectedCustomerId,
      balance,
      {
        manager: queryRunner.manager,
      },
    );
  }
}
