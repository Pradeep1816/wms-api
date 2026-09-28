import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  SEPTEMBER_2026_TUITION,
  SEPTEMBER_2026_EFFECTIVE_FROM,
  SEPTEMBER_2026_PRICE_BOOK,
} from '../pricing/constants/september-2026-tuition';

/**
 * Applies Arcadia's revised rate sheet of 2026-08-27 to the seeded catalogue.
 *
 * `AddTuitionPriceCatalogue1786200000000` seeded the sheet approved on
 * 2026-08-04. Ashif Govani sent a corrected one on 2026-08-27 - "Tuition Rate
 * Guide - Internal Use Only" - with the note that they "had some internal
 * calculation issues and needed to make a few adjustments". Four values moved:
 *
 *   Standard 45 / Tier 1   monthly  217.50 -> 218.00   (rate 72.50 -> 72.67)
 *   Standard 45 / Tier 2   monthly  262.50 -> 263.00   (rate 87.50 -> 87.67)
 *   Standard 45 / Tier 3   monthly  307.50 -> 308.00   (rate 102.50 -> 102.67)
 *   Standard 30 / Tier 3   12-month prepaid  2263.00 -> 2264.00
 *
 * Everything else on the revised sheet matches what is already seeded.
 *
 * ## Why this corrects rows instead of adding a generation
 *
 * The catalogue is effective-dated precisely so a price change is a new row
 * rather than an edit, and `AddTuitionPriceCatalogue` says so. This is not a
 * price change. The September structure takes effect on 2026-09-01 and has not
 * billed anybody yet; Arcadia is fixing arithmetic in a sheet that is still in
 * front of them. A second row dated 2026-09-01 would collide with the first on
 * `UQ_tuition_price_scope` and, if it somehow did not, would leave the resolver
 * with two active matches for the same day - which it refuses, by design.
 *
 * ## Why the hourly rate moves at all
 *
 * A 45-minute lesson at 72.50/hr is 54.375, which is not a whole number of
 * cents. Billing rounds it to 54.38, so four lessons came to 217.52 against a
 * 217.50 month - the two-cent drift Arcadia hit while testing, and the reason
 * they rounded these months to whole dollars. 72.67/hr gives 54.5025, which
 * bills at 54.50, and four of those are exactly 218.00.
 *
 * Leaving the rate at 72.50 while moving the month to 218.00 would be worse
 * than doing nothing: `PrepaidCycleApplicationService.plan` treats a lesson
 * priced below `monthlyAmount / 4` as not yet re-rated and refuses to apply a
 * prepaid cycle to it, so every 45-minute Standard cycle would silently fall
 * back to monthly billing.
 *
 * ## No existing lesson is re-rated
 *
 * Checked against the 2026-08-25 production dump: the eleven tiered enrolments
 * are all 30-minute, so no lesson anywhere carries a 45-minute tiered rate.
 * This migration is forward-looking only and rewrites no lesson, invoice or
 * payment. There are also no location-scoped catalogue rows, on production or
 * on dev, so the global rows below are the whole catalogue.
 *
 * Idempotent: it sets values rather than adjusting them, and re-running the
 * seed migration now produces the same figures from the same constant.
 */
export class ReviseSeptember2026RateSheet1787600000000
  implements MigrationInterface
{
  name = 'ReviseSeptember2026RateSheet1787600000000';

  /** The four values this migration exists to move, and what they were. */
  private static readonly PREVIOUS = {
    monthly: {
      'standard-45-1': { monthlyAmount: '217.50', hourlyRate: '72.50' },
      'standard-45-2': { monthlyAmount: '262.50', hourlyRate: '87.50' },
      'standard-45-3': { monthlyAmount: '307.50', hourlyRate: '102.50' },
    } as Record<string, { monthlyAmount: string; hourlyRate: string }>,
    prepaid: {
      'standard-30-3': { 12: '2263.00' },
    } as Record<string, Record<number, string>>,
  };

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.write(queryRunner, 'forward');
  }

  /**
   * Puts the four values back exactly as the original seed left them.
   *
   * Only those four. Rolling the whole catalogue back from the constant would
   * write today's figures, since the constant now holds the revised sheet -
   * which would make `down` a no-op that looked like a rollback.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.write(queryRunner, 'back');
  }

  private async write(
    queryRunner: QueryRunner,
    direction: 'forward' | 'back',
  ): Promise<void> {
    const previous = ReviseSeptember2026RateSheet1787600000000.PREVIOUS;

    for (const price of SEPTEMBER_2026_TUITION) {
      const key = `${price.category}-${price.durationMinutes}-${price.tier}`;

      const rows = (await queryRunner.query(
        `SELECT id FROM tuition_price
          WHERE priceBook = ?
            AND locationId IS NULL
            AND pricingCategory = ?
            AND pricingTier = ?
            AND durationMinutes = ?
            AND effectiveFrom = ?
          LIMIT 1`,
        [
          SEPTEMBER_2026_PRICE_BOOK,
          price.category,
          price.tier,
          price.durationMinutes,
          SEPTEMBER_2026_EFFECTIVE_FROM,
        ],
      )) as { id: number }[];

      // Nothing to correct on a database where the seed has not run. The seed
      // reads the same constant, so it will insert the revised figures itself.
      if (rows.length === 0) {
        continue;
      }

      const tuitionPriceId = rows[0].id;
      const monthlyChange = previous.monthly[key];

      if (monthlyChange) {
        const target =
          direction === 'forward'
            ? { monthly: price.monthlyAmount, hourly: price.hourlyRate }
            : {
                monthly: monthlyChange.monthlyAmount,
                hourly: monthlyChange.hourlyRate,
              };

        await queryRunner.query(
          `UPDATE tuition_price
              SET monthlyAmount = ?, hourlyRate = ?
            WHERE id = ?`,
          [target.monthly, target.hourly, tuitionPriceId],
        );
      }

      const prepaidChange = previous.prepaid[key];

      if (prepaidChange) {
        for (const [termMonths, wasAmount] of Object.entries(prepaidChange)) {
          const amount =
            direction === 'forward'
              ? price.prepaid[Number(termMonths)]
              : wasAmount;

          await queryRunner.query(
            `UPDATE tuition_prepaid_price
                SET amount = ?
              WHERE tuitionPriceId = ? AND termMonths = ?`,
            [amount, tuitionPriceId, Number(termMonths)],
          );
        }
      }
    }
  }
}
