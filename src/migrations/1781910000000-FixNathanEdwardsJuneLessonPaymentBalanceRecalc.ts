import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nathan Edwards June repair.
 *
 * Soft-deletes the four June lesson-payment rows that were carrying the
 * prepaid allocation, then recomputes the root payment balance and the
 * affected private lesson balances so the remaining credit is visible.
 */
export class FixNathanEdwardsJuneLessonPaymentBalanceRecalc1781910000000
  implements MigrationInterface
{
  name = 'FixNathanEdwardsJuneLessonPaymentBalanceRecalc1781910000000';

  private readonly migrationName =
    'FixNathanEdwardsJuneLessonPaymentBalanceRecalc1781910000000';
  private readonly lessonPaymentBackupTable =
    'migration_nathan_june_lp_backup';
  private readonly paymentBackupTable =
    'migration_nathan_june_payment_backup';
  private readonly privateLessonBackupTable =
    'migration_nathan_june_private_lesson_backup';
  private readonly updatedByUserId = 727;
  private readonly affectedPaymentId = 1572732;
  private readonly affectedLessonPaymentIds = [
    1757779,
    1757780,
    1757781,
    1757782,
  ] as const;
  private readonly affectedLessonIds = [
    5225701,
    5225703,
    5225704,
    5225705,
  ] as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createBackupTables(queryRunner);
    await this.backupCurrentState(queryRunner);
    await this.softDeleteLessonPayments(queryRunner);
    await this.recalculatePaymentBalance(queryRunner);
    await this.recalculatePrivateLessonBalances(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.restoreLessonPayments(queryRunner);
    await this.restorePaymentBalance(queryRunner);
    await this.restorePrivateLessonBalances(queryRunner);

    await queryRunner.query(
      `DELETE FROM \`${this.lessonPaymentBackupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );

    await queryRunner.query(
      `DELETE FROM \`${this.paymentBackupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );

    await queryRunner.query(
      `DELETE FROM \`${this.privateLessonBackupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
  }

  private getLessonPaymentIdList(): string {
    return this.affectedLessonPaymentIds.join(', ');
  }

  private getLessonIdList(): string {
    return this.affectedLessonIds.join(', ');
  }

  private async createBackupTables(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.lessonPaymentBackupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`lessonPaymentId\` int unsigned NOT NULL,
        \`lessonId\` int unsigned NOT NULL,
        \`paymentId\` int unsigned NOT NULL,
        \`amount\` decimal(10,4) NOT NULL,
        \`enrolmentId\` int unsigned NULL,
        \`isDeleted\` tinyint(1) NOT NULL,
        \`date\` timestamp NOT NULL,
        \`createdOn\` timestamp NULL DEFAULT NULL,
        \`updatedOn\` timestamp NULL DEFAULT NULL,
        \`createdByUserId\` int NOT NULL,
        \`updatedByUserId\` int NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`lessonPaymentId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.paymentBackupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`paymentId\` int unsigned NOT NULL,
        \`balance\` decimal(10,4) NOT NULL,
        \`updatedOn\` timestamp NULL DEFAULT NULL,
        \`updatedByUserId\` int NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`paymentId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.privateLessonBackupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`privateLessonId\` int unsigned NOT NULL,
        \`lessonId\` int unsigned NOT NULL,
        \`balance\` decimal(10,4) NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`privateLessonId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);
  }

  private async backupCurrentState(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.lessonPaymentBackupTable}\` (
        migrationName,
        lessonPaymentId,
        lessonId,
        paymentId,
        amount,
        enrolmentId,
        isDeleted,
        date,
        createdOn,
        updatedOn,
        createdByUserId,
        updatedByUserId
      )
      SELECT
        ? AS migrationName,
        lp.id AS lessonPaymentId,
        lp.lessonId AS lessonId,
        lp.paymentId AS paymentId,
        lp.amount AS amount,
        lp.enrolmentId AS enrolmentId,
        lp.isDeleted AS isDeleted,
        lp.date AS date,
        lp.createdOn AS createdOn,
        lp.updatedOn AS updatedOn,
        lp.createdByUserId AS createdByUserId,
        lp.updatedByUserId AS updatedByUserId
      FROM lesson_payment lp
      WHERE lp.id IN (${this.getLessonPaymentIdList()})
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.paymentBackupTable}\` (
        migrationName,
        paymentId,
        balance,
        updatedOn,
        updatedByUserId
      )
      SELECT
        ? AS migrationName,
        p.id AS paymentId,
        p.balance AS balance,
        p.updatedOn AS updatedOn,
        p.updatedByUserId AS updatedByUserId
      FROM payment p
      WHERE p.id = ${this.affectedPaymentId}
      `,
      [this.migrationName],
    );

    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.privateLessonBackupTable}\` (
        migrationName,
        privateLessonId,
        lessonId,
        balance
      )
      SELECT
        ? AS migrationName,
        pl.id AS privateLessonId,
        pl.lessonId AS lessonId,
        pl.balance AS balance
      FROM private_lesson pl
      WHERE pl.lessonId IN (${this.getLessonIdList()})
      `,
      [this.migrationName],
    );
  }

  private async softDeleteLessonPayments(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE lesson_payment
      SET
        isDeleted = 1,
        updatedOn = CURRENT_TIMESTAMP,
        updatedByUserId = ?
      WHERE id IN (${this.getLessonPaymentIdList()})
      `,
      [this.updatedByUserId],
    );
  }

  private async recalculatePaymentBalance(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE payment p
      LEFT JOIN (
        SELECT
          ip.payment_id,
          ROUND(SUM(ip.amount), 4) AS totalApplied
        FROM invoice_payment ip
        INNER JOIN payment p2
          ON p2.id = ip.payment_id
         AND p2.isDeleted = 0
        WHERE ip.isDeleted = 0
        GROUP BY ip.payment_id
      ) invoiceTotals
        ON invoiceTotals.payment_id = p.id
      LEFT JOIN (
        SELECT
          lp.paymentId,
          ROUND(SUM(lp.amount), 4) AS totalPaid
        FROM lesson_payment lp
        INNER JOIN payment p3
          ON p3.id = lp.paymentId
         AND p3.isDeleted = 0
        WHERE lp.isDeleted = 0
        GROUP BY lp.paymentId
      ) lessonTotals
        ON lessonTotals.paymentId = p.id
      SET
        p.balance = CAST(ROUND(
          p.amount - COALESCE(invoiceTotals.totalApplied, 0) - COALESCE(lessonTotals.totalPaid, 0),
          4
        ) AS DECIMAL(10,4)),
        p.updatedOn = CURRENT_TIMESTAMP,
        p.updatedByUserId = ?
      WHERE p.id = ${this.affectedPaymentId}
      `,
      [this.updatedByUserId],
    );
  }

  private async recalculatePrivateLessonBalances(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE private_lesson pl
      LEFT JOIN (
        SELECT
          lessonId,
          ROUND(SUM(amount), 4) AS totalPaid
        FROM lesson_payment
        WHERE isDeleted = 0
          AND lessonId IN (${this.getLessonIdList()})
        GROUP BY lessonId
      ) paid
        ON paid.lessonId = pl.lessonId
      SET pl.balance = CAST(ROUND(pl.total - COALESCE(paid.totalPaid, 0), 4) AS DECIMAL(10,4))
      WHERE pl.lessonId IN (${this.getLessonIdList()})
      `,
    );
  }

  private async restoreLessonPayments(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE lesson_payment lp
      INNER JOIN \`${this.lessonPaymentBackupTable}\` b
        ON b.lessonPaymentId = lp.id
       AND b.migrationName = ?
      SET
        lp.lessonId = b.lessonId,
        lp.paymentId = b.paymentId,
        lp.amount = b.amount,
        lp.enrolmentId = b.enrolmentId,
        lp.isDeleted = b.isDeleted,
        lp.date = b.date,
        lp.createdOn = b.createdOn,
        lp.updatedOn = b.updatedOn,
        lp.createdByUserId = b.createdByUserId,
        lp.updatedByUserId = b.updatedByUserId
      WHERE lp.id IN (${this.getLessonPaymentIdList()})
      `,
      [this.migrationName],
    );
  }

  private async restorePaymentBalance(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE payment p
      INNER JOIN \`${this.paymentBackupTable}\` b
        ON b.paymentId = p.id
       AND b.migrationName = ?
      SET
        p.balance = b.balance,
        p.updatedOn = b.updatedOn,
        p.updatedByUserId = b.updatedByUserId
      WHERE p.id = ${this.affectedPaymentId}
      `,
      [this.migrationName],
    );
  }

  private async restorePrivateLessonBalances(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE private_lesson pl
      INNER JOIN \`${this.privateLessonBackupTable}\` b
        ON b.privateLessonId = pl.id
       AND b.migrationName = ?
      SET
        pl.balance = b.balance
      WHERE pl.lessonId IN (${this.getLessonIdList()})
      `,
      [this.migrationName],
    );
  }
}
