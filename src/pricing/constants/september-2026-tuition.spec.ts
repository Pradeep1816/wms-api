import { describe, expect, it } from 'vitest';
import {
  SEPTEMBER_2026_TUITION,
  SEPTEMBER_2026_EFFECTIVE_FROM,
  TUITION_HOURLY_RATES,
  TUITION_DURATIONS_MINUTES,
} from './september-2026-tuition';
import { PricingCategoryEnum } from '../enums/pricing-category.enum';
import { RoundingUtils } from '../../utils/rounding.utils';

/**
 * Guards the 72 authoritative amounts from the client's approved schedule.
 *
 * If a value here changes, it means someone edited the September 2026 matrix.
 * That is almost always a mistake - a genuine price change belongs in a new
 * catalogue row with a later effective date, not an edit to this one.
 *
 * It has been edited twice, deliberately, both before the structure took
 * effect:
 *
 *  - 2026-08-27: the three 45-minute Standard months moved to whole dollars,
 *    and Standard 30-minute Tier 3 for twelve months was corrected to 2264.00.
 *  - 2026-08-31: the same three rows had their TERM totals re-derived from the
 *    whole-dollar month rather than the 217.50 / 262.50 / 307.50 they were
 *    originally worked out from. Nine values, all Standard 45-minute.
 *
 * The figures below are transcribed from the 2026-08-31 sheet, independently
 * of the fixture.
 */

/** The client's approved figures, transcribed independently of the fixture. */
const APPROVED_MONTHLY: Record<string, string> = {
  'standard-30-1': '145.00',
  'standard-30-2': '175.00',
  'standard-30-3': '205.00',
  'standard-45-1': '218.00',
  'standard-45-2': '263.00',
  'standard-45-3': '308.00',
  'standard-60-1': '290.00',
  'standard-60-2': '350.00',
  'standard-60-3': '410.00',
  'vocal-30-1': '160.00',
  'vocal-30-2': '190.00',
  'vocal-30-3': '220.00',
  'vocal-45-1': '240.00',
  'vocal-45-2': '285.00',
  'vocal-45-3': '330.00',
  'vocal-60-1': '320.00',
  'vocal-60-2': '380.00',
  'vocal-60-3': '440.00',
};

const APPROVED_PREPAID: Record<string, Record<number, string>> = {
  'standard-30-1': { 3: '422.00', 6: '827.00', 12: '1601.00' },
  'standard-30-2': { 3: '510.00', 6: '998.00', 12: '1932.00' },
  'standard-30-3': { 3: '597.00', 6: '1169.00', 12: '2264.00' },
  'standard-45-1': { 3: '634.00', 6: '1243.00', 12: '2406.00' },
  'standard-45-2': { 3: '766.00', 6: '1500.00', 12: '2904.00' },
  'standard-45-3': { 3: '897.00', 6: '1756.00', 12: '3401.00' },
  'standard-60-1': { 3: '844.00', 6: '1653.00', 12: '3202.00' },
  'standard-60-2': { 3: '1019.00', 6: '1995.00', 12: '3864.00' },
  'standard-60-3': { 3: '1194.00', 6: '2337.00', 12: '4527.00' },
  'vocal-30-1': { 3: '466.00', 6: '912.00', 12: '1767.00' },
  'vocal-30-2': { 3: '553.00', 6: '1083.00', 12: '2098.00' },
  'vocal-30-3': { 3: '641.00', 6: '1254.00', 12: '2429.00' },
  'vocal-45-1': { 3: '699.00', 6: '1368.00', 12: '2650.00' },
  'vocal-45-2': { 3: '830.00', 6: '1625.00', 12: '3147.00' },
  'vocal-45-3': { 3: '961.00', 6: '1881.00', 12: '3644.00' },
  'vocal-60-1': { 3: '932.00', 6: '1824.00', 12: '3533.00' },
  'vocal-60-2': { 3: '1106.00', 6: '2166.00', 12: '4196.00' },
  'vocal-60-3': { 3: '1281.00', 6: '2508.00', 12: '4858.00' },
};

const key = (category: string, duration: number, tier: number) =>
  `${category}-${duration}-${tier}`;

describe('September 2026 tuition matrix', () => {
  it('covers every category, duration and tier exactly once', () => {
    expect(SEPTEMBER_2026_TUITION).toHaveLength(18);

    const seen = new Set(
      SEPTEMBER_2026_TUITION.map((p) =>
        key(p.category, p.durationMinutes, p.tier),
      ),
    );
    expect(seen.size).toBe(18);

    for (const category of [
      PricingCategoryEnum.STANDARD,
      PricingCategoryEnum.VOCAL,
    ]) {
      for (const duration of TUITION_DURATIONS_MINUTES) {
        for (const tier of [1, 2, 3]) {
          expect(seen.has(key(category, duration, tier))).toBe(true);
        }
      }
    }
  });

  it('takes effect on 1 September 2026', () => {
    expect(SEPTEMBER_2026_EFFECTIVE_FROM).toBe('2026-09-01');
  });

  describe('monthly amounts', () => {
    for (const price of SEPTEMBER_2026_TUITION) {
      const k = key(price.category, price.durationMinutes, price.tier);
      it(`${k} is exactly ${APPROVED_MONTHLY[k]}`, () => {
        expect(price.monthlyAmount).toBe(APPROVED_MONTHLY[k]);
      });
    }
  });

  describe('prepaid amounts are the exact approved figures', () => {
    for (const price of SEPTEMBER_2026_TUITION) {
      const k = key(price.category, price.durationMinutes, price.tier);
      for (const term of [3, 6, 12]) {
        it(`${k} for ${term} months is exactly ${APPROVED_PREPAID[k][term]}`, () => {
          expect(price.prepaid[term]).toBe(APPROVED_PREPAID[k][term]);
        });
      }
    }
  });

  describe('prepaid amounts are NOT derived from the reference percentages', () => {
    // The whole-dollar figures are deliberate and differ from a strict
    // percentage. They are not arbitrary either - each is the percentage
    // rounded UP, which is what the ceiling test below pins down - but a
    // strict percentage is still the wrong answer, and these cases guard
    // against someone "correcting" 510.00 to 509.25.
    const notPercentageCases = [
      {
        k: 'standard-30-2',
        term: 3,
        approved: '510.00',
        strictPercentage: '509.25',
      },
      {
        k: 'standard-60-3',
        term: 3,
        approved: '1194.00',
        strictPercentage: '1193.10',
      },
      {
        k: 'vocal-30-1',
        term: 12,
        approved: '1767.00',
        strictPercentage: '1766.40',
      },
      {
        k: 'vocal-60-2',
        term: 12,
        approved: '4196.00',
        strictPercentage: '4195.20',
      },
    ];

    for (const { k, term, approved, strictPercentage } of notPercentageCases) {
      it(`${k} / ${term} months is ${approved}, not the calculated ${strictPercentage}`, () => {
        const [category, duration, tier] = k.split('-');
        const price = SEPTEMBER_2026_TUITION.find(
          (p) =>
            p.category === (category as PricingCategoryEnum) &&
            p.durationMinutes === Number(duration) &&
            p.tier === Number(tier),
        );
        expect(price).toBeDefined();
        expect(price!.prepaid[term]).toBe(approved);
        expect(price!.prepaid[term]).not.toBe(strictPercentage);
      });
    }
  });

  describe('hourly rate reproduces the exact monthly amount', () => {
    // A month is four BILLED lessons, and a lesson is billed in cents. So the
    // identity has to round the lesson before multiplying, exactly as
    // `Lesson.getGrossPrice` does - deriving it as `rate x hours x 4` in one
    // step passes for the 30- and 60-minute rows and lies about the 45-minute
    // ones, where 72.67 x 0.75 x 4 is 218.01 while four billed lessons are
    // 218.00.
    for (const price of SEPTEMBER_2026_TUITION) {
      const k = key(price.category, price.durationMinutes, price.tier);
      it(`${k}: ${price.hourlyRate}/hr yields ${price.monthlyAmount}/month`, () => {
        const perLesson = RoundingUtils.roundHalfUpForLesson(
          Number(price.hourlyRate) * (price.durationMinutes / 60),
          2,
        );
        expect((perLesson * 4).toFixed(2)).toBe(price.monthlyAmount);
      });
    }
  });

  describe('hourly rates against the headline card', () => {
    // Arcadia publishes one rate per category and tier. Two of the three
    // durations are priced straight from it.
    for (const price of SEPTEMBER_2026_TUITION) {
      const k = key(price.category, price.durationMinutes, price.tier);
      const headline = TUITION_HOURLY_RATES[price.category][price.tier];
      const isWholeDollarException =
        price.category === PricingCategoryEnum.STANDARD &&
        price.durationMinutes === 45;

      if (isWholeDollarException) {
        // The exception, and it has to be an exception rather than a drifted
        // value: at the headline 72.50 a 45-minute lesson is 54.375, and four
        // of them bill 217.52 against the 218.00 Arcadia approved.
        it(`${k} is lifted off the ${headline} card to bill a whole-dollar month`, () => {
          expect(price.hourlyRate).not.toBe(headline);
          expect(Number(price.hourlyRate)).toBeGreaterThan(Number(headline));
          expect(price.monthlyAmount).toMatch(/\.00$/);
        });
      } else {
        it(`${k} is priced straight from the ${headline} card`, () => {
          expect(price.hourlyRate).toBe(headline);
        });
      }
    }
  });

  describe('prepaid amounts are the percentage rounded up', () => {
    // Not how a price is produced - the stored figure is authoritative and is
    // what Arcadia quoted a parent. It is how the sheet is CHECKED, and all 54
    // values on the 2026-08-27 sheet satisfy it. That is what identified
    // Standard 30-minute Tier 3 / twelve months as the one stale cell on the
    // sheet before it: 2263.00 where the rule gives 2264.00.
    //
    // The basis is `monthlyAmount`. It was the headline card rate until
    // 2026-08-31, because the 45-minute Standard rows had their months rounded
    // up to whole dollars while their terms were still priced from 217.50.
    // Arcadia closed that gap on the 2026-08-31 sheet by re-deriving those
    // terms from 218.00, so one basis now serves every row.
    const FACTOR: Record<number, number> = { 3: 0.97, 6: 0.95, 12: 0.92 };

    /**
     * The two cells Arcadia rounded DOWN rather than up on the 2026-08-31
     * sheet. Both are Standard 45-minute Tier 1, and both are a dollar under
     * what their own rule gives: 634.00 against 635, 2406.00 against 2407.
     *
     * Listed rather than tolerated so that the rule still guards the other 52,
     * and so nobody "fixes" these two to match it - they are what Arcadia
     * published.
     */
    const ROUNDED_DOWN: Record<string, string> = {
      'standard-45-1/3': '634.00',
      'standard-45-1/12': '2406.00',
    };

    for (const price of SEPTEMBER_2026_TUITION) {
      const k = key(price.category, price.durationMinutes, price.tier);
      for (const term of [3, 6, 12]) {
        it(`${k} / ${term} months`, () => {
          // Guard the float before the ceiling: 509.2499999... must not become
          // 509.5000001 and ceil to 510 for the wrong reason.
          const exact = Number(
            (Number(price.monthlyAmount) * term * FACTOR[term]).toFixed(6),
          );
          const expected = ROUNDED_DOWN[`${k}/${term}`] ?? `${Math.ceil(exact)}.00`;
          expect(price.prepaid[term]).toBe(expected);
        });
      }
    }
  });

  it('states every amount as a decimal string, never a float', () => {
    for (const price of SEPTEMBER_2026_TUITION) {
      expect(typeof price.monthlyAmount).toBe('string');
      expect(price.monthlyAmount).toMatch(/^\d+\.\d{2}$/);
      expect(typeof price.hourlyRate).toBe('string');
      expect(price.hourlyRate).toMatch(/^\d+\.\d{2}$/);

      for (const term of [3, 6, 12]) {
        expect(typeof price.prepaid[term]).toBe('string');
        expect(price.prepaid[term]).toMatch(/^\d+\.\d{2}$/);
      }
    }
  });

  it('asserts all 72 authoritative values', () => {
    const monthlyCount = SEPTEMBER_2026_TUITION.length;
    const prepaidCount = SEPTEMBER_2026_TUITION.reduce(
      (total, price) => total + Object.keys(price.prepaid).length,
      0,
    );
    expect(monthlyCount).toBe(18);
    expect(prepaidCount).toBe(54);
    expect(monthlyCount + prepaidCount).toBe(72);
  });
});
