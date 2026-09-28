import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  SEPTEMBER_2026_TUITION,
  SEPTEMBER_2026_EFFECTIVE_FROM,
  SEPTEMBER_2026_PRICE_BOOK,
} from '../pricing/constants/september-2026-tuition';

/**
 * Applies Arcadia's sheet of 2026-08-31 to the seeded catalogue.
 *
 * `ReviseSeptember2026RateSheet1787600000000` rounded the three Standard
 * 45-minute MONTHS up to whole dollars but left their term totals as they were,
 * because that is what the 2026-08-27 sheet printed. Those terms were still
 * derived from 217.50 / 262.50 / 307.50, which is the inconsistency Arcadia
 * were told about and have now closed: the 2026-08-31 sheet re-derives them
 * from the whole-dollar month.
 *
 * Nine values, all Standard 45-minute prepaid totals:
 *
 *   Tier 1    3M 633 -> 634    6M 1240 -> 1243    12M 2402 -> 2406
 *   Tier 2    3M 764 -> 766    6M 1497 -> 1500    12M 2898 -> 2904
 *   Tier 3    3M 895 -> 897    6M 1753 -> 1756    12M 3395 -> 3401
 *
 * Nothing else on the sheet moved - the monthly amounts, the hourly rates, and
 * every 30-minute, 60-minute and Vocal row are unchanged, verified cell by
 * cell against what is seeded.
 *
 * ## Why this corrects rows rather than adding a generation
 *
 * Same reasoning as the migration before it: the September structure takes
 * effect on 2026-09-01 and has billed nobody, so this is Arcadia finishing an
 * arithmetic correction on a sheet still in front of them. A second row dated
 * 2026-09-01 would collide on `UQ_tuition_price_scope`.
 *
 * ## What this does NOT touch
 *
 * The sibling / second-instrument discount stays staff-entered, per Arcadia's
 * decision of 2026-08-27. Their sheet also prints a "Disc." column, and the
 * system will continue to arrive at slightly different discounted totals than
 * those, because it subtracts the entered discount from the published term
 * where their column re-derives the whole term from the discounted month.
 * Reproducing that column automatically is a separate change Arcadia have not
 * asked for - they are still deciding whether they want an automatic discount
 * system at all.
 *
 * Idempotent: it sets values rather than adjusting them, and re-running the
 * seed migration now produces the same figures from the same constant.
 */
export class September2026FortyFiveMinuteTermPrices1787700000000
  implements MigrationInterface
{
  name = 'September2026FortyFiveMinuteTermPrices1787700000000';

  /** The nine values this migration moves, and what they were. */
  private static readonly PREVIOUS: Record<string, Record<number, string>> = {
    'standard-45-1': { 3: '633.00', 6: '1240.00', 12: '2402.00' },
    'standard-45-2': { 3: '764.00', 6: '1497.00', 12: '2898.00' },
    'standard-45-3': { 3: '895.00', 6: '1753.00', 12: '3395.00' },
  };

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.write(queryRunner, 'forward');
  }

  /**
   * Puts the nine values back exactly as the 2026-08-27 migration left them.
   *
   * Only those nine. Rolling the catalogue back from the constant would write
   * today's figures, since the constant now holds the 2026-08-31 sheet.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.write(queryRunner, 'back');
  }

  private async write(
    queryRunner: QueryRunner,
    direction: 'forward' | 'back',
  ): Promise<void> {
    const previous =
      September2026FortyFiveMinuteTermPrices1787700000000.PREVIOUS;

    for (const price of SEPTEMBER_2026_TUITION) {
      const key = `${price.category}-${price.durationMinutes}-${price.tier}`;
      const change = previous[key];

      if (!change) {
        continue;
      }

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

      // Nothing to correct where the seed has not run. The seed reads the same
      // constant and will insert the 2026-08-31 figures itself.
      if (rows.length === 0) {
        continue;
      }

      for (const [termMonths, wasAmount] of Object.entries(change)) {
        const amount =
          direction === 'forward' ? price.prepaid[Number(termMonths)] : wasAmount;

        await queryRunner.query(
          `UPDATE tuition_prepaid_price
              SET amount = ?
            WHERE tuitionPriceId = ? AND termMonths = ?`,
          [amount, rows[0].id, Number(termMonths)],
        );
      }
    }
  }
}
