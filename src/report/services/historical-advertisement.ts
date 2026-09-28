import { RoundingUtils } from '../../utils/rounding.utils';

interface AdvertisementCategory {
  advertisement: number;
  historicalAdvertisementRevenue: number;
  historicalAdvertisementFreeRevenue: number;
  royaltyFree: boolean;
}

/** Restore the pre-category formula for backfilled activity only. The input is
 * in stable report order. Allocate its rounded total to categories by largest
 * remainder, including negative return rows, without altering saved new fees. */
export function applyHistoricalAdvertisement(
  categories: AdvertisementCategory[],
  baselineRate: number,
) {
  const round = (value: number, precision = 2) =>
    RoundingUtils.roundHalfUp(value, precision);
  const historicalRevenue = round(
    categories.reduce(
      (sum, row) => sum + round(row.historicalAdvertisementRevenue),
      0,
    ) -
      round(
        categories.reduce(
          (sum, row) => sum + row.historicalAdvertisementFreeRevenue,
          0,
        ),
      ),
  );
  // Match the old report's integer-cents calculation (also for negative ranges).
  const historicalCents = round(
    (round(historicalRevenue * 100, 0) * baselineRate) / 100,
    0,
  );
  const savedCents = categories.reduce(
    (sum, row) => sum + round(row.advertisement * 100, 0),
    0,
  );
  const allocations = categories
    .map((row, index) => {
      const exact = RoundingUtils.decimal(
        round(row.historicalAdvertisementRevenue),
      ).times(baselineRate);
      const cents = Math.floor(exact.toNumber());
      return { index, cents, remainder: exact.minus(cents).toNumber() };
    })
    .filter(
      ({ index }) =>
        !categories[index].royaltyFree &&
        categories[index].historicalAdvertisementRevenue !== 0,
    );
  let remaining =
    historicalCents - allocations.reduce((sum, row) => sum + row.cents, 0);
  allocations.sort((a, b) =>
    remaining < 0
      ? a.remainder - b.remainder || a.index - b.index
      : b.remainder - a.remainder || a.index - b.index,
  );
  // A free-only report can have a cent of revenue from the old report's two
  // rounding stages. Keep that compatibility residual visible on its first row.
  if (remaining && !allocations.length && categories.length) {
    allocations.push({ index: 0, cents: 0, remainder: 0 });
  }
  for (let i = 0; remaining !== 0 && allocations.length; i++) {
    const step = Math.sign(remaining);
    allocations[i % allocations.length].cents += step;
    remaining -= step;
  }
  for (const { index, cents } of allocations) {
    categories[index].advertisement =
      (round(categories[index].advertisement * 100, 0) + cents) / 100;
  }
  return {
    historicalRevenue: historicalRevenue.toFixed(2),
    historicalRate: baselineRate.toFixed(2),
    historicalAmount: (historicalCents / 100).toFixed(2),
    savedCategoryAmount: (savedCents / 100).toFixed(2),
  };
}
