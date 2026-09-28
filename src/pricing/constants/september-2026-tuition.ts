import { PricingCategoryEnum } from '../enums/pricing-category.enum';

/**
 * Authoritative September 2026 tuition matrix.
 *
 * Source: "Tuition Rate Guide - Internal Use Only", the revised sheet Ashif
 * Govani sent on 2026-08-27. It supersedes the sheet confirmed on 2026-07-31
 * and again by Maurizio Di Rauso and Ashif on the 2026-08-04 call, and it
 * lands before the structure takes effect on 1 September - so it is a
 * correction to this book rather than a second one. Four values moved; see
 * `ReviseSeptember2026RateSheet` for the list.
 *
 * Two rules that must not be relaxed:
 *
 *  1. The prepaid amounts are EXACT approved dollar figures. Load them; never
 *     recompute them.
 *
 *     They are, as it turns out, nearly reproducible: 52 of the 54 are
 *     `ceil(monthlyAmount x months x factor)` at 0.97 / 0.95 / 0.92. That is
 *     where 510.00 comes from - `ceil(509.25)`. The two exceptions are
 *     Standard 45-minute Tier 1 for three and twelve months, where Arcadia
 *     rounded down instead - 634.00 and 2406.00 against the rule's 635 and
 *     2407, on the 2026-08-31 sheet. Useful when a figure looks wrong. Still
 *     not a licence to compute one: the stored value is what Arcadia has
 *     quoted to a parent, exceptions included.
 *
 *  2. Monthly amounts are the authoritative total for a month, and each row's
 *     hourly rate is chosen so that four lessons bill exactly that total.
 *
 *     The 45-minute Standard rows are why that needs saying. At 72.50/hr a
 *     45-minute lesson is 54.375, which is not a whole number of cents, and
 *     four lessons rounded to 54.38 billed 217.52 against a 217.50 month.
 *     Arcadia settled it on 2026-08-27 by rounding those months to whole
 *     dollars, so the rate that reproduces them is 72.67, not the 72.50 on the
 *     headline card. On 2026-08-31 they followed through and re-derived those
 *     rows' TERM totals from 218.00 as well, which is where 634 / 1243 / 2406
 *     replaced 633 / 1240 / 2402.
 *
 * Amounts are decimal strings so that no value passes through a JavaScript
 * float on its way into the database or out through the API.
 */

/** Effective date of the new structure. */
export const SEPTEMBER_2026_EFFECTIVE_FROM = '2026-09-01';

/**
 * Price book this catalogue is filed under.
 *
 * The `priceBook` column exists because Arcadia has more than one generation of
 * pricing live at once. Only this book is in scope; the two legacy books were
 * built for the conversion of existing enrolments, which Arcadia paused on
 * 2026-08-14, and they live on `feature/september-2026-lesson-pricing`.
 */
export const SEPTEMBER_2026_PRICE_BOOK = 'september_2026';

/** Lesson durations offered, in minutes. */
export const TUITION_DURATIONS_MINUTES = [30, 45, 60] as const;

/**
 * Headline hourly rate by category and tier - the card Arcadia publishes.
 *
 * Storing an hourly rate at all is what keeps lesson generation on the existing
 * `programRate` mechanism. The 30- and 60-minute rows are priced straight from
 * this card.
 *
 * The three 45-minute STANDARD rows are not, and deliberately so: rounding
 * their months to whole dollars means their rate is 72.67 / 87.67 / 102.67.
 * Each fixture's own `hourlyRate` is therefore the authoritative figure for
 * that row, and this constant is the card those figures come from rather than
 * a value to look a row's rate up in.
 */
export const TUITION_HOURLY_RATES: Record<
  PricingCategoryEnum,
  Record<number, string>
> = {
  [PricingCategoryEnum.STANDARD]: { 1: '72.50', 2: '87.50', 3: '102.50' },
  [PricingCategoryEnum.VOCAL]: { 1: '80.00', 2: '95.00', 3: '110.00' },
};

export interface TuitionPriceFixture {
  category: PricingCategoryEnum;
  durationMinutes: number;
  tier: number;
  /** Exact approved monthly tuition. */
  monthlyAmount: string;
  /** Hourly rate used to populate lesson rate snapshots. */
  hourlyRate: string;
  /** Exact approved prepaid totals, keyed by term length in months. */
  prepaid: Record<number, string>;
}

/**
 * All 18 category/duration/tier combinations, each carrying its exact monthly
 * amount and its three exact prepaid totals - 72 authoritative values.
 */
export const SEPTEMBER_2026_TUITION: TuitionPriceFixture[] = [
  // ---------------------------------------------------------------- Standard
  {
    category: PricingCategoryEnum.STANDARD,
    durationMinutes: 30,
    tier: 1,
    monthlyAmount: '145.00',
    hourlyRate: '72.50',
    prepaid: { 3: '422.00', 6: '827.00', 12: '1601.00' },
  },
  {
    category: PricingCategoryEnum.STANDARD,
    durationMinutes: 30,
    tier: 2,
    monthlyAmount: '175.00',
    hourlyRate: '87.50',
    prepaid: { 3: '510.00', 6: '998.00', 12: '1932.00' },
  },
  {
    category: PricingCategoryEnum.STANDARD,
    durationMinutes: 30,
    tier: 3,
    monthlyAmount: '205.00',
    hourlyRate: '102.50',
    prepaid: { 3: '597.00', 6: '1169.00', 12: '2264.00' },
  },
  {
    category: PricingCategoryEnum.STANDARD,
    durationMinutes: 45,
    tier: 1,
    monthlyAmount: '218.00',
    hourlyRate: '72.67',
    prepaid: { 3: '634.00', 6: '1243.00', 12: '2406.00' },
  },
  {
    category: PricingCategoryEnum.STANDARD,
    durationMinutes: 45,
    tier: 2,
    monthlyAmount: '263.00',
    hourlyRate: '87.67',
    prepaid: { 3: '766.00', 6: '1500.00', 12: '2904.00' },
  },
  {
    category: PricingCategoryEnum.STANDARD,
    durationMinutes: 45,
    tier: 3,
    monthlyAmount: '308.00',
    hourlyRate: '102.67',
    prepaid: { 3: '897.00', 6: '1756.00', 12: '3401.00' },
  },
  {
    category: PricingCategoryEnum.STANDARD,
    durationMinutes: 60,
    tier: 1,
    monthlyAmount: '290.00',
    hourlyRate: '72.50',
    prepaid: { 3: '844.00', 6: '1653.00', 12: '3202.00' },
  },
  {
    category: PricingCategoryEnum.STANDARD,
    durationMinutes: 60,
    tier: 2,
    monthlyAmount: '350.00',
    hourlyRate: '87.50',
    prepaid: { 3: '1019.00', 6: '1995.00', 12: '3864.00' },
  },
  {
    category: PricingCategoryEnum.STANDARD,
    durationMinutes: 60,
    tier: 3,
    monthlyAmount: '410.00',
    hourlyRate: '102.50',
    prepaid: { 3: '1194.00', 6: '2337.00', 12: '4527.00' },
  },

  // ------------------------------------------------------------------- Vocal
  {
    category: PricingCategoryEnum.VOCAL,
    durationMinutes: 30,
    tier: 1,
    monthlyAmount: '160.00',
    hourlyRate: '80.00',
    prepaid: { 3: '466.00', 6: '912.00', 12: '1767.00' },
  },
  {
    category: PricingCategoryEnum.VOCAL,
    durationMinutes: 30,
    tier: 2,
    monthlyAmount: '190.00',
    hourlyRate: '95.00',
    prepaid: { 3: '553.00', 6: '1083.00', 12: '2098.00' },
  },
  {
    category: PricingCategoryEnum.VOCAL,
    durationMinutes: 30,
    tier: 3,
    monthlyAmount: '220.00',
    hourlyRate: '110.00',
    prepaid: { 3: '641.00', 6: '1254.00', 12: '2429.00' },
  },
  {
    category: PricingCategoryEnum.VOCAL,
    durationMinutes: 45,
    tier: 1,
    monthlyAmount: '240.00',
    hourlyRate: '80.00',
    prepaid: { 3: '699.00', 6: '1368.00', 12: '2650.00' },
  },
  {
    category: PricingCategoryEnum.VOCAL,
    durationMinutes: 45,
    tier: 2,
    monthlyAmount: '285.00',
    hourlyRate: '95.00',
    prepaid: { 3: '830.00', 6: '1625.00', 12: '3147.00' },
  },
  {
    category: PricingCategoryEnum.VOCAL,
    durationMinutes: 45,
    tier: 3,
    monthlyAmount: '330.00',
    hourlyRate: '110.00',
    prepaid: { 3: '961.00', 6: '1881.00', 12: '3644.00' },
  },
  {
    category: PricingCategoryEnum.VOCAL,
    durationMinutes: 60,
    tier: 1,
    monthlyAmount: '320.00',
    hourlyRate: '80.00',
    prepaid: { 3: '932.00', 6: '1824.00', 12: '3533.00' },
  },
  {
    category: PricingCategoryEnum.VOCAL,
    durationMinutes: 60,
    tier: 2,
    monthlyAmount: '380.00',
    hourlyRate: '95.00',
    prepaid: { 3: '1106.00', 6: '2166.00', 12: '4196.00' },
  },
  {
    category: PricingCategoryEnum.VOCAL,
    durationMinutes: 60,
    tier: 3,
    monthlyAmount: '440.00',
    hourlyRate: '110.00',
    prepaid: { 3: '1281.00', 6: '2508.00', 12: '4858.00' },
  },
];
