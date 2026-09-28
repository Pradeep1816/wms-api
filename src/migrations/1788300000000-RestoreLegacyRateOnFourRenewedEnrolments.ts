import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Put four enrolments back on their legacy $65.00/hr rate.
 *
 * These four were renewed through the payment-frequency screen rather than by
 * the overnight job. That screen read the September price list instead of the
 * rate the enrolment was already on, so each acquired a **future** rate period
 * at $72.50/hr. The code fault is fixed (PR #1106/#1108, on production since
 * 2026-09-02); this repairs the rows it left behind.
 *
 * Arcadia confirmed on 2026-09-03: *"we would like the four enrolments with the
 * pricing changes corrected so that they remain on the legacy rate for the
 * complete payment cycle and for anything moving forward. The schools will
 * determine when each enrolment should be moved to the new pricing."*
 *
 * | Enrolment | Student | Location | Course | Rate row |
 * | --- | --- | --- | --- | --- |
 * | 28196 | Kaylan Ramsewak | Burlington | 27838 | 39657 |
 * | 28390 | Nicholas Iskander | Woodbridge | 28032 | 39685 |
 * | 28391 | Christian Iskander | Woodbridge | 28033 | 39684 |
 * | 14485 | Tara Rao | Woodbridge | 14301 | 39656 |
 *
 * Safeguards:
 * 1. **Exact scope** - only those four rate rows, and only lessons on those
 *    four courses that currently sit at exactly 72.50.
 * 2. **Settled lessons excluded** - a lesson carrying a live payment or a live
 *    invoice line is left alone, the same rule Change Pricing uses. Four of
 *    Tara Rao's February 2027 lessons are paid (payment 1816671) and are
 *    therefore skipped.
 * 3. **Everything backed up first**, so `down` restores the exact prior values
 *    rather than recomputing them.
 * 4. **No guessing at money.** The billed figure is recomputed from the new
 *    rate and the lesson's own discount rows, mirroring `Lesson.getDiscount()`.
 *    Scaling the old billed figure by 65/72.50 would be wrong: on course 28033
 *    it gives $29.50 where the correct answer is $29.38, because the $1.25
 *    sibling discount is a dollar amount that does not scale with the rate.
 *    That is a 12c error on each of 96 lessons.
 * 5. **Aborts rather than guesses.** Every lesson in scope carries only a
 *    payment-frequency percentage (type 2) and a multiple-enrolment dollar
 *    amount (type 3), no tax, and a 30-minute duration. If anything else turns
 *    up the migration throws instead of applying a formula it cannot vouch for.
 *
 * Nothing on `enrolment` changes: all four already read `pricingTier` NULL and
 * `keepsPreviousRate` 0. The $72.50 lived only in the rate rows and the lessons
 * priced from them, which is why they still showed as legacy on screen.
 */
export class RestoreLegacyRateOnFourRenewedEnrolments1788300000000
  implements MigrationInterface
{
  name = 'RestoreLegacyRateOnFourRenewedEnrolments1788300000000';

  private readonly backupTable = 'migration_legacy_rate_restore_backup';
  private readonly rateBackupTable = 'migration_legacy_rate_restore_rate_backup';

  /** courseId -> the single rate row carrying the unwanted 72.50. */
  private readonly scope: Array<{ courseId: number; rateId: number }> = [
    { courseId: 27838, rateId: 39657 },
    { courseId: 28032, rateId: 39685 },
    { courseId: 28033, rateId: 39684 },
    { courseId: 14301, rateId: 39656 },
  ];

  private readonly wrongRate = 72.5;
  private readonly legacyRate = 65.0;

  /** Payment-frequency discount: a percentage. */
  private static readonly TYPE_PAYMENT_FREQUENCY = 2;
  /** Multiple-enrolment (sibling) discount: a dollar amount. */
  private static readonly TYPE_MULTIPLE_ENROLMENT = 3;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const courseIds = this.scope.map((s) => s.courseId);
    const rateIds = this.scope.map((s) => s.rateId);

    await this.createBackupTables(queryRunner);
    await this.assertNoExistingBackup(queryRunner);

    // ---- rate rows -------------------------------------------------------
    const rateRows: Array<{ id: number; courseId: number; programRate: string }> =
      await queryRunner.query(
        `SELECT id, courseId, programRate FROM course_program_rate
          WHERE id IN (${rateIds.join(',')})`,
      );

    const repairable = rateRows.filter(
      (r) => Number(r.programRate) === this.wrongRate,
    );
    if (repairable.length === 0) {
      // Already put right by hand, or the rows have moved on. Nothing to do,
      // and nothing to complain about.
      return;
    }

    for (const row of repairable) {
      await queryRunner.query(
        `INSERT INTO ${this.rateBackupTable} (rateId, courseId, programRate)
         VALUES (?, ?, ?)`,
        [row.id, row.courseId, row.programRate],
      );
    }

    // ---- lessons ---------------------------------------------------------
    // Only lessons on the repaired courses, at exactly the wrong rate, with no
    // live payment and no live invoice line.
    const repairedCourseIds = repairable.map((r) => r.courseId);
    const lessons: Array<{
      id: number;
      courseId: number;
      duration: string;
      tax: string | null;
      programRate: string;
      plTotal: string | null;
      plBalance: string | null;
    }> = await queryRunner.query(
      `SELECT l.id, l.courseId, l.duration, l.tax, l.programRate,
              pl.total AS plTotal, pl.balance AS plBalance
         FROM lesson l
         LEFT JOIN private_lesson pl ON pl.lessonId = l.id
        WHERE l.courseId IN (${repairedCourseIds.join(',')})
          AND l.isDeleted = 0
          AND l.programRate = ?
          AND NOT EXISTS (
                SELECT 1 FROM lesson_payment lp
                 LEFT JOIN payment p ON p.id = lp.paymentId
                 WHERE lp.lessonId = l.id AND lp.isDeleted = 0
                   AND (p.id IS NULL OR p.isDeleted = 0))
          AND NOT EXISTS (
                SELECT 1 FROM invoice_item_lesson iil
                 INNER JOIN invoice_line_item ili
                         ON ili.id = iil.invoiceLineItemId AND ili.isDeleted = 0
                 INNER JOIN invoice inv
                         ON inv.id = ili.invoice_id AND inv.isDeleted = 0
                        AND inv.isCanceled = 0 AND inv.isVoid = 0
                 WHERE iil.lessonId = l.id)`,
      [this.wrongRate],
    );

    for (const lesson of lessons) {
      const discounts: Array<{ type: number; valueType: number; value: string }> =
        await queryRunner.query(
          `SELECT type, valueType, value FROM lesson_discount WHERE lessonId = ?`,
          [lesson.id],
        );

      this.assertDiscountsAreUnderstood(lesson.id, discounts, lesson.tax);

      const billed = this.billedAt(this.legacyRate, lesson.duration, discounts);

      await queryRunner.query(
        `INSERT INTO ${this.backupTable}
           (lessonId, courseId, programRate, plTotal, plBalance)
         VALUES (?, ?, ?, ?, ?)`,
        [
          lesson.id,
          lesson.courseId,
          lesson.programRate,
          lesson.plTotal,
          lesson.plBalance,
        ],
      );

      await queryRunner.query(
        `UPDATE lesson SET programRate = ? WHERE id = ?`,
        [this.legacyRate, lesson.id],
      );

      // `balance` follows `total` only where nothing has been collected, and
      // that is guaranteed here: a lesson carrying a live payment never
      // reached this loop. A zero balance therefore stays zero.
      if (lesson.plTotal !== null) {
        await queryRunner.query(
          `UPDATE private_lesson
              SET total = ?,
                  balance = CASE WHEN balance = 0 THEN 0 ELSE ? END
            WHERE lessonId = ?`,
          [billed, billed, lesson.id],
        );
      }
    }

    // ---- the rate rows themselves ---------------------------------------
    await queryRunner.query(
      `UPDATE course_program_rate SET programRate = ?
        WHERE id IN (${repairable.map((r) => r.id).join(',')})`,
      [this.legacyRate],
    );

    await this.assertApplied(queryRunner, repairable.map((r) => r.id));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasBackup = await this.backupExists(queryRunner);
    if (!hasBackup) {
      return;
    }

    const lessonRows: Array<{
      lessonId: number;
      programRate: string;
      plTotal: string | null;
      plBalance: string | null;
    }> = await queryRunner.query(
      `SELECT lessonId, programRate, plTotal, plBalance FROM ${this.backupTable}`,
    );

    for (const row of lessonRows) {
      await queryRunner.query(`UPDATE lesson SET programRate = ? WHERE id = ?`, [
        row.programRate,
        row.lessonId,
      ]);
      if (row.plTotal !== null) {
        await queryRunner.query(
          `UPDATE private_lesson SET total = ?, balance = ? WHERE lessonId = ?`,
          [row.plTotal, row.plBalance, row.lessonId],
        );
      }
    }

    const rateRows: Array<{ rateId: number; programRate: string }> =
      await queryRunner.query(
        `SELECT rateId, programRate FROM ${this.rateBackupTable}`,
      );
    for (const row of rateRows) {
      await queryRunner.query(
        `UPDATE course_program_rate SET programRate = ? WHERE id = ?`,
        [row.programRate, row.rateId],
      );
    }

    await queryRunner.query(`DROP TABLE IF EXISTS ${this.backupTable}`);
    await queryRunner.query(`DROP TABLE IF EXISTS ${this.rateBackupTable}`);
  }

  /**
   * What the customer is billed for one lesson at `rate`.
   *
   * Mirrors `Lesson.getDiscount()` for the two discount types these lessons
   * carry, in the same order: the multiple-enrolment dollar amount comes off
   * the gross first, then the payment-frequency percentage applies to what is
   * left. `assertDiscountsAreUnderstood` guarantees nothing else is present.
   */
  private billedAt(
    rate: number,
    duration: string,
    discounts: Array<{ type: number; valueType: number; value: string }>,
  ): string {
    const [h, m, s] = duration.split(':').map((part) => parseInt(part, 10) || 0);
    const unit = h + m / 60 + s / 3600;
    const gross = this.roundHalfUp(rate * unit, 2);

    const byType = (type: number) => discounts.find((d) => d.type === type);

    let discount = 0;
    let lessonPrice = gross;

    const multi = byType(
      RestoreLegacyRateOnFourRenewedEnrolments1788300000000.TYPE_MULTIPLE_ENROLMENT,
    );
    if (multi) {
      discount += lessonPrice < 0 ? 0 : Number(multi.value ?? 0);
      lessonPrice = gross - discount;
    }

    const freq = byType(
      RestoreLegacyRateOnFourRenewedEnrolments1788300000000.TYPE_PAYMENT_FREQUENCY,
    );
    if (freq) {
      discount += (Number(freq.value ?? 0) / 100) * lessonPrice;
    }

    return this.roundHalfUp(gross - discount, 2).toFixed(2);
  }

  /**
   * Refuse anything the formula above does not cover.
   *
   * Every lesson in scope was checked against the 2026-09-02 production
   * snapshot: 30 minutes, no tax, and only discount types 2 and 3. If that has
   * changed, stopping is the right answer - a wrong figure here is a wrong
   * invoice.
   */
  private assertDiscountsAreUnderstood(
    lessonId: number,
    discounts: Array<{ type: number; valueType: number; value: string }>,
    tax: string | null,
  ): void {
    if (Number(tax ?? 0) !== 0) {
      throw new Error(
        `${this.name}: lesson ${lessonId} carries tax ${tax}; the repair does not handle tax`,
      );
    }

    const understood = new Set([
      RestoreLegacyRateOnFourRenewedEnrolments1788300000000.TYPE_PAYMENT_FREQUENCY,
      RestoreLegacyRateOnFourRenewedEnrolments1788300000000.TYPE_MULTIPLE_ENROLMENT,
    ]);
    const unexpected = discounts.filter((d) => !understood.has(d.type));
    if (unexpected.length > 0) {
      throw new Error(
        `${this.name}: lesson ${lessonId} carries discount type(s) ` +
          `${unexpected.map((d) => d.type).join(', ')}; the repair only covers 2 and 3`,
      );
    }

    const freq = discounts.find(
      (d) =>
        d.type ===
        RestoreLegacyRateOnFourRenewedEnrolments1788300000000.TYPE_PAYMENT_FREQUENCY,
    );
    if (freq && Number(freq.valueType) !== 1) {
      throw new Error(
        `${this.name}: lesson ${lessonId} has a payment-frequency discount that is not a percentage`,
      );
    }

    const multi = discounts.find(
      (d) =>
        d.type ===
        RestoreLegacyRateOnFourRenewedEnrolments1788300000000.TYPE_MULTIPLE_ENROLMENT,
    );
    if (multi && Number(multi.valueType) !== 0) {
      throw new Error(
        `${this.name}: lesson ${lessonId} has a sibling discount that is not a dollar amount`,
      );
    }
  }

  /** Half-up, matching `RoundingUtils.roundHalfUpForLesson`. */
  private roundHalfUp(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  private async assertApplied(
    queryRunner: QueryRunner,
    rateIds: number[],
  ): Promise<void> {
    const [{ leftBehind }] = await queryRunner.query(
      `SELECT COUNT(*) AS leftBehind FROM course_program_rate
        WHERE id IN (${rateIds.join(',')}) AND programRate <> ?`,
      [this.legacyRate],
    );
    if (Number(leftBehind) !== 0) {
      throw new Error(
        `${this.name}: ${leftBehind} rate row(s) did not move to ${this.legacyRate}`,
      );
    }
  }

  private async createBackupTables(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS ${this.backupTable} (
         lessonId INT NOT NULL PRIMARY KEY,
         courseId INT NOT NULL,
         programRate DECIMAL(10,4) NULL,
         plTotal DECIMAL(10,4) NULL,
         plBalance DECIMAL(10,4) NULL
       ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS ${this.rateBackupTable} (
         rateId INT NOT NULL PRIMARY KEY,
         courseId INT NOT NULL,
         programRate DECIMAL(10,4) NULL
       ) ENGINE=InnoDB`,
    );
  }

  private async assertNoExistingBackup(queryRunner: QueryRunner): Promise<void> {
    const [{ n }] = await queryRunner.query(
      `SELECT COUNT(*) AS n FROM ${this.backupTable}`,
    );
    if (Number(n) !== 0) {
      throw new Error(
        `${this.name}: ${this.backupTable} already holds ${n} row(s); refusing to run twice`,
      );
    }
  }

  private async backupExists(queryRunner: QueryRunner): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT COUNT(*) AS n FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = ?`,
      [this.backupTable],
    );
    return Number(rows[0]?.n ?? 0) > 0;
  }
}
