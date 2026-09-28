import { DataSource, MigrationInterface, QueryRunner } from 'typeorm';
import { CustomerBalanceCalculationRepository } from '../customer/repositories/customer-balance-calculation.repository';
import { LessonStatusEnum } from '../lesson/enums/lesson-status';

/**
 * Repairs the frequency-change auto-renewal writer before it began creating
 * private_lesson rows.  The census on the deployment dump found seven
 * scheduled, unpaid and un-invoiced enrolments.  Two other historical targets
 * (Haomiao Fu and Sehrish Kazi) are now non-scheduled and are deliberately not
 * included here.
 */
export class BackfillAutoRenewalMissingPrivateLessons1791400000000 implements MigrationInterface {
  name = 'BackfillAutoRenewalMissingPrivateLessons1791400000000';

  private readonly migrationName =
    'BackfillAutoRenewalMissingPrivateLessons1791400000000';
  private readonly backupTable =
    'migration_auto_renewal_missing_private_lesson_backup';
  private readonly discountBackupTable =
    'migration_auto_renewal_missing_pl_discount_backup';

  private readonly targets = [
    // enrolment, course, student, customer, location, auto-renewal, lesson range,
    // rate, duration, PF percentage, per-lesson multiple-enrolment discount.
    [
      16688,
      16498,
      3737,
      2218,
      16,
      5467,
      5131751,
      5131855,
      65,
      '00:45:00',
      10,
      0,
    ],
    [
      16689,
      16499,
      11255,
      2218,
      16,
      5466,
      5131647,
      5131750,
      65,
      '00:30:00',
      10,
      1.25,
    ],
    [
      20112,
      19854,
      15850,
      10685,
      22,
      5834,
      5296755,
      5296851,
      72.5,
      '00:30:00',
      3,
      0,
    ],
    [
      20134,
      19874,
      12596,
      7910,
      18,
      5819,
      5282029,
      5282124,
      65,
      '00:30:00',
      3,
      0,
    ],
    [
      20736,
      20466,
      16107,
      10923,
      20,
      5941,
      5362399,
      5362494,
      65,
      '00:30:00',
      6,
      0,
    ],
    [
      20737,
      20467,
      16108,
      10923,
      20,
      5942,
      5362495,
      5362590,
      65,
      '00:30:00',
      6,
      1.25,
    ],
    [
      28962,
      28600,
      13531,
      8693,
      14,
      5506,
      5172535,
      5172639,
      65,
      '00:30:00',
      10,
      0,
    ],
  ] as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createBackupTables(queryRunner);
    await this.assertNoExistingBackup(queryRunner);
    await this.backupEligibleCandidates(queryRunner);

    const count = await this.backupCount(queryRunner);
    if (count === 0) return;

    await this.assertCandidatesStillEligible(queryRunner, count);
    await this.insertMissingLessonDiscounts(queryRunner);
    await this.stampInsertedLessonDiscounts(queryRunner);
    await this.insertPrivateLessons(queryRunner);
    await this.stampInsertedPrivateLessons(queryRunner);
    await this.assertPostInsertState(queryRunner, count);
    await this.refreshAffectedCustomerBalances(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const count = await this.backupCount(queryRunner);
    if (count === 0) return;

    await queryRunner.query(
      `DELETE pl FROM private_lesson pl
       INNER JOIN \`${this.backupTable}\` b
         ON b.privateLessonId = pl.id AND b.migrationName = ?`,
      [this.migrationName],
    );
    await queryRunner.query(
      `DELETE ld FROM lesson_discount ld
       INNER JOIN \`${this.discountBackupTable}\` b
         ON b.lessonDiscountId = ld.id AND b.migrationName = ?`,
      [this.migrationName],
    );
    await this.refreshAffectedCustomerBalances(queryRunner);
    await queryRunner.query(
      `DELETE FROM \`${this.discountBackupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
    await queryRunner.query(
      `DELETE FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    );
  }

  private targetScope(): string {
    return this.targets
      .map(
        ([
          enrolmentId,
          courseId,
          studentId,
          customerId,
          locationId,
          autoRenewalId,
          firstLessonId,
          lastLessonId,
          programRate,
          duration,
          pfDiscount,
          multipleDiscount,
        ]) => `SELECT ${enrolmentId} enrolmentId, ${courseId} courseId, ${studentId} studentId,
          ${customerId} customerId, ${locationId} locationId, ${autoRenewalId} autoRenewalId,
          ${firstLessonId} firstLessonId, ${lastLessonId} lastLessonId,
          ${programRate} programRate, '${duration}' duration, ${pfDiscount} pfDiscount,
          ${multipleDiscount} multipleDiscount`,
      )
      .join(' UNION ALL ');
  }

  /** A target has either no copied lesson discounts or exactly its audited profile. */
  private discountProfileIsValid(): string {
    return `
      (
        (SELECT COUNT(*) FROM lesson_discount ld WHERE ld.lessonId = l.id) = 0
        OR (
          (SELECT COUNT(*) FROM lesson_discount ld WHERE ld.lessonId = l.id)
            = 1 + (t.multipleDiscount > 0)
          AND (SELECT COUNT(*) FROM lesson_discount ld
               WHERE ld.lessonId = l.id AND ld.type = 2 AND ld.valueType = 1
                 AND ld.enrolmentId = t.enrolmentId
                 AND ABS(ld.value - t.pfDiscount) < 0.00005) = 1
          AND (
            t.multipleDiscount = 0 OR
            (SELECT COUNT(*) FROM lesson_discount ld
             WHERE ld.lessonId = l.id AND ld.type = 3 AND ld.valueType = 0
               AND ld.enrolmentId = t.enrolmentId
               AND ABS(ld.value - t.multipleDiscount) < 0.00005) = 1
          )
        )
      )`;
  }

  private candidateFilter(): string {
    return `
      l.id BETWEEN t.firstLessonId AND t.lastLessonId
      AND l.courseId = t.courseId
      AND e.id = t.enrolmentId AND e.courseId = t.courseId
      AND e.studentId = t.studentId AND e.isDeleted = 0 AND e.isConfirmed = 1
      AND s.id = t.studentId AND s.customer_id = t.customerId
      AND c.id = t.courseId AND c.locationId = t.locationId
      AND l.isDeleted = 0 AND l.isConfirmed = 1 AND l.type = 1
      AND l.status = ${LessonStatusEnum.SCHEDULED}
      AND ABS(l.programRate - t.programRate) < 0.00005
      AND l.duration = t.duration AND ABS(l.tax) < 0.00005
      AND pl.id IS NULL
      AND NOT EXISTS (SELECT 1 FROM invoice_item_lesson iil WHERE iil.lessonId = l.id)
      AND NOT EXISTS (
        SELECT 1 FROM lesson_payment lp LEFT JOIN payment p ON p.id = lp.paymentId
        WHERE lp.lessonId = l.id AND lp.isDeleted = 0
          AND COALESCE(p.isDeleted, 0) = 0 AND ABS(lp.amount) > 0.00005
      )
      AND NOT EXISTS (
        SELECT 1 FROM customer_discount cd
        WHERE cd.customerId = t.customerId AND COALESCE(cd.isDeleted, 0) = 0
          AND ABS(COALESCE(cd.value, 0)) > 0.00005
      )
      AND (SELECT COUNT(*) FROM enrolment_discount ed
           WHERE ed.enrolmentId = t.enrolmentId AND ed.type = 1
             AND ed.discountType = 0 AND ABS(COALESCE(ed.discount, 0) - t.pfDiscount) < 0.00005) = 1
      AND (
        t.multipleDiscount = 0 OR
        (SELECT COUNT(*) FROM enrolment_discount ed
         WHERE ed.enrolmentId = t.enrolmentId AND ed.type = 2 AND ed.discountType = 1
           AND ABS(COALESCE(ed.discount, 0) - (t.multipleDiscount * 4)) < 0.00005) = 1
      )
      AND ${this.discountProfileIsValid()}`;
  }

  private totalExpression(): string {
    return `CAST(ROUND(((l.programRate * TIME_TO_SEC(l.duration) / 3600) - t.multipleDiscount)
      * (1 - t.pfDiscount / 100) + l.tax, 2) AS DECIMAL(10,4))`;
  }

  private async createBackupTables(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS \`${this.backupTable}\` (
      migrationName varchar(190) NOT NULL, lessonId int unsigned NOT NULL,
      enrolmentId int unsigned NOT NULL, customerId int unsigned NOT NULL,
      pfDiscount decimal(10,4) NOT NULL, multipleDiscount decimal(10,4) NOT NULL,
      initialLessonDiscountCount tinyint unsigned NOT NULL, expiryDate datetime NOT NULL,
      dueDate date NOT NULL, total decimal(10,4) NOT NULL, privateLessonId int unsigned NULL,
      PRIMARY KEY (migrationName, lessonId), KEY idx_marmp_plid (privateLessonId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS \`${this.discountBackupTable}\` (
      migrationName varchar(190) NOT NULL, lessonId int unsigned NOT NULL,
      lessonDiscountId int unsigned NOT NULL,
      PRIMARY KEY (migrationName, lessonDiscountId), KEY idx_marmpd_lesson (lessonId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8`);
  }

  private async assertNoExistingBackup(
    queryRunner: QueryRunner,
  ): Promise<void> {
    if ((await this.backupCount(queryRunner)) !== 0) {
      throw new Error(`${this.migrationName}: backup already exists`);
    }
  }

  private async backupEligibleCandidates(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(
      `INSERT INTO \`${this.backupTable}\` (
        migrationName, lessonId, enrolmentId, customerId, pfDiscount, multipleDiscount,
        initialLessonDiscountCount, expiryDate, dueDate, total
      )
      SELECT ?, l.id, t.enrolmentId, t.customerId, t.pfDiscount, t.multipleDiscount,
        (SELECT COUNT(*) FROM lesson_discount ld WHERE ld.lessonId = l.id),
        DATE_ADD(l.date, INTERVAL 90 DAY), DATE(l.dueDate), ${this.totalExpression()}
      FROM (${this.targetScope()}) t
      INNER JOIN enrolment e ON e.id = t.enrolmentId
      INNER JOIN student s ON s.id = e.studentId
      INNER JOIN course c ON c.id = e.courseId
      INNER JOIN lesson l ON l.courseId = t.courseId AND l.id BETWEEN t.firstLessonId AND t.lastLessonId
      INNER JOIN auto_renewal_lessons arl ON arl.lessonId = l.id AND arl.autoRenewalId = t.autoRenewalId
      LEFT JOIN private_lesson pl ON pl.lessonId = l.id
      WHERE ${this.candidateFilter()}`,
      [this.migrationName],
    );
  }

  private async backupCount(queryRunner: QueryRunner): Promise<number> {
    const rows = (await queryRunner.query(
      `SELECT COUNT(*) count FROM \`${this.backupTable}\` WHERE migrationName = ?`,
      [this.migrationName],
    )) as Array<{ count: string | number }>;
    return Number(rows[0]?.count ?? 0);
  }

  private async assertCandidatesStillEligible(
    queryRunner: QueryRunner,
    count: number,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT COUNT(*) count FROM \`${this.backupTable}\` b
      INNER JOIN (${this.targetScope()}) t ON t.enrolmentId = b.enrolmentId
      INNER JOIN enrolment e ON e.id = t.enrolmentId
      INNER JOIN student s ON s.id = e.studentId
      INNER JOIN course c ON c.id = e.courseId
      INNER JOIN lesson l ON l.id = b.lessonId
      INNER JOIN auto_renewal_lessons arl ON arl.lessonId = l.id AND arl.autoRenewalId = t.autoRenewalId
      LEFT JOIN private_lesson pl ON pl.lessonId = l.id
      WHERE b.migrationName = ? AND ${this.candidateFilter()}
        AND ABS(b.total - ${this.totalExpression()}) < 0.00005`,
      [this.migrationName],
    )) as Array<{ count: string | number }>;
    if (Number(rows[0]?.count ?? 0) !== count) {
      throw new Error(
        `${this.migrationName}: candidate state changed after backup`,
      );
    }
  }

  private async insertMissingLessonDiscounts(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(
      `INSERT INTO lesson_discount (lessonId, type, value, valueType, enrolmentId)
      SELECT b.lessonId, 2, b.pfDiscount, 1, b.enrolmentId
      FROM \`${this.backupTable}\` b WHERE b.migrationName = ? AND b.initialLessonDiscountCount = 0
      UNION ALL
      SELECT b.lessonId, 3, b.multipleDiscount, 0, b.enrolmentId
      FROM \`${this.backupTable}\` b
      WHERE b.migrationName = ? AND b.initialLessonDiscountCount = 0 AND b.multipleDiscount > 0`,
      [this.migrationName, this.migrationName],
    );
  }

  private async stampInsertedLessonDiscounts(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(
      `INSERT INTO \`${this.discountBackupTable}\` (migrationName, lessonId, lessonDiscountId)
      SELECT ?, b.lessonId, ld.id
      FROM \`${this.backupTable}\` b
      INNER JOIN lesson_discount ld ON ld.lessonId = b.lessonId AND ld.enrolmentId = b.enrolmentId
       AND ((ld.type = 2 AND ld.valueType = 1 AND ABS(ld.value - b.pfDiscount) < 0.00005)
         OR (ld.type = 3 AND ld.valueType = 0 AND ABS(ld.value - b.multipleDiscount) < 0.00005))
      WHERE b.migrationName = ? AND b.initialLessonDiscountCount = 0`,
      [this.migrationName, this.migrationName],
    );
  }

  private async insertPrivateLessons(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO private_lesson (lessonId, expiryDate, total, balance, dueDate)
      SELECT b.lessonId, b.expiryDate, b.total, b.total, b.dueDate
      FROM \`${this.backupTable}\` b LEFT JOIN private_lesson pl ON pl.lessonId = b.lessonId
      WHERE b.migrationName = ? AND pl.id IS NULL`,
      [this.migrationName],
    );
  }

  private async stampInsertedPrivateLessons(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(
      `UPDATE \`${this.backupTable}\` b INNER JOIN private_lesson pl ON pl.lessonId = b.lessonId
      SET b.privateLessonId = pl.id WHERE b.migrationName = ? AND b.privateLessonId IS NULL
        AND ABS(pl.total - b.total) < 0.00005 AND ABS(pl.balance - b.total) < 0.00005`,
      [this.migrationName],
    );
  }

  private async assertPostInsertState(
    queryRunner: QueryRunner,
    count: number,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT COUNT(*) count FROM \`${this.backupTable}\` b
      INNER JOIN private_lesson pl ON pl.id = b.privateLessonId AND pl.lessonId = b.lessonId
      WHERE b.migrationName = ? AND ABS(pl.total - b.total) < 0.00005
        AND ABS(pl.balance - b.total) < 0.00005 AND pl.dueDate = b.dueDate
        AND pl.expiryDate = b.expiryDate
        AND (SELECT COUNT(*) FROM lesson_discount ld WHERE ld.lessonId = b.lessonId)
          = 1 + (b.multipleDiscount > 0)
        AND (SELECT COUNT(*) FROM lesson_discount ld
             WHERE ld.lessonId = b.lessonId AND ld.type = 2 AND ld.valueType = 1
               AND ld.enrolmentId = b.enrolmentId
               AND ABS(ld.value - b.pfDiscount) < 0.00005) = 1
        AND (b.multipleDiscount = 0 OR
             (SELECT COUNT(*) FROM lesson_discount ld
              WHERE ld.lessonId = b.lessonId AND ld.type = 3 AND ld.valueType = 0
                AND ld.enrolmentId = b.enrolmentId
                AND ABS(ld.value - b.multipleDiscount) < 0.00005) = 1)`,
      [this.migrationName],
    )) as Array<{ count: string | number }>;
    if (Number(rows[0]?.count ?? 0) !== count) {
      throw new Error(
        `${this.migrationName}: private_lesson insert validation failed`,
      );
    }
  }

  private async refreshAffectedCustomerBalances(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT DISTINCT customerId FROM \`${this.backupTable}\`
      WHERE migrationName = ?`,
      [this.migrationName],
    )) as Array<{ customerId: number | string }>;
    const repository = new CustomerBalanceCalculationRepository(
      queryRunner.connection as DataSource,
    );
    for (const row of rows) {
      const customerId = Number(row.customerId);
      const balance = await repository.calculateBalance(
        customerId,
        queryRunner.manager,
      );
      await repository.upsertCustomerAccountBalance(customerId, balance, {
        manager: queryRunner.manager,
      });
    }
  }
}
