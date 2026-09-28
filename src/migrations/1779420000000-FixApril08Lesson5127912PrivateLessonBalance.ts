import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixApril08Lesson5127912PrivateLessonBalance1779420000000
  implements MigrationInterface
{
  name = 'FixApril08Lesson5127912PrivateLessonBalance1779420000000';

  private readonly backupTable =
    'migration_april_08_lesson_5127912_balance_backup';
  private readonly migrationName =
    'FixApril08Lesson5127912PrivateLessonBalance1779420000000';
  private readonly targets = [
    { lessonId: 5127912, privateLessonId: 4676418 },
    { lessonId: 5127910, privateLessonId: 4676416 },
  ] as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`${this.backupTable}\` (
        \`migrationName\` varchar(190) NOT NULL,
        \`lessonId\` int unsigned NOT NULL,
        \`privateLessonId\` int unsigned NOT NULL,
        \`oldTotal\` decimal(10,4) NOT NULL,
        \`oldBalance\` decimal(10,4) NOT NULL,
        \`newTotal\` decimal(10,4) NOT NULL,
        \`newBalance\` decimal(10,4) NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`migrationName\`, \`privateLessonId\`),
        KEY \`idx_${this.backupTable}_lessonId\` (\`lessonId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8
    `);

    await queryRunner.query(
      `
      INSERT IGNORE INTO \`${this.backupTable}\` (
        migrationName,
        lessonId,
        privateLessonId,
        oldTotal,
        oldBalance,
        newTotal,
        newBalance
      )
      SELECT
        ? AS migrationName,
        pl.lessonId AS lessonId,
        pl.id AS privateLessonId,
        CAST(ROUND(pl.total, 4) AS DECIMAL(10,4)) AS oldTotal,
        CAST(ROUND(pl.balance, 4) AS DECIMAL(10,4)) AS oldBalance,
        CAST(ROUND(pl.total, 4) AS DECIMAL(10,4)) AS newTotal,
        CAST(
          ROUND(
            pl.total - COALESCE(paid.totalPaid, 0),
            4
          ) AS DECIMAL(10,4)
        ) AS newBalance
      FROM private_lesson pl
      LEFT JOIN (
        SELECT
          lp.lessonId,
          ROUND(SUM(lp.amount), 2) AS totalPaid
        FROM lesson_payment lp
        INNER JOIN payment p
          ON p.id = lp.paymentId
         AND p.isDeleted = 0
         AND p.payment_method_id <> 2
        WHERE lp.isDeleted = 0
        GROUP BY lp.lessonId
      ) paid
        ON paid.lessonId = pl.lessonId
      WHERE (pl.lessonId = ? AND pl.id = ?)
         OR (pl.lessonId = ? AND pl.id = ?)
      `,
      [
        this.migrationName,
        this.targets[0].lessonId,
        this.targets[0].privateLessonId,
        this.targets[1].lessonId,
        this.targets[1].privateLessonId,
      ],
    );

    await queryRunner.query(
      `
      UPDATE private_lesson pl
      INNER JOIN \`${this.backupTable}\` b
        ON b.privateLessonId = pl.id
       AND b.migrationName = ?
      SET
        pl.total = b.newTotal,
        pl.balance = b.newBalance
      WHERE (pl.lessonId = ? AND pl.id = ?)
         OR (pl.lessonId = ? AND pl.id = ?)
      `,
      [
        this.migrationName,
        this.targets[0].lessonId,
        this.targets[0].privateLessonId,
        this.targets[1].lessonId,
        this.targets[1].privateLessonId,
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE private_lesson pl
      INNER JOIN \`${this.backupTable}\` b
        ON b.privateLessonId = pl.id
       AND b.migrationName = ?
      SET
        pl.total = b.oldTotal,
        pl.balance = b.oldBalance
      WHERE (pl.lessonId = ? AND pl.id = ?)
         OR (pl.lessonId = ? AND pl.id = ?)
      `,
      [
        this.migrationName,
        this.targets[0].lessonId,
        this.targets[0].privateLessonId,
        this.targets[1].lessonId,
        this.targets[1].privateLessonId,
      ],
    );

    await queryRunner.query(
      `DELETE FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
  }
}
