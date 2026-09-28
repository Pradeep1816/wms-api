import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrepaidPricingService } from './prepaid-pricing.service';
import { PricingCategoryEnum } from '../enums/pricing-category.enum';

/**
 * The published standard 30-minute column, transcribed from the rate card
 * independently of the fixture the resolver reads.
 */
const PUBLISHED: Record<
  number,
  { monthly: string; terms: Record<number, string> }
> = {
  1: { monthly: '145.00', terms: { 3: '422.00', 6: '827.00', 12: '1601.00' } },
  2: { monthly: '175.00', terms: { 3: '510.00', 6: '998.00', 12: '1932.00' } },
  3: { monthly: '205.00', terms: { 3: '597.00', 6: '1169.00', 12: '2264.00' } },
};

describe('PrepaidPricingService', () => {
  let service: PrepaidPricingService;
  let pricingResolver: { resolve: ReturnType<typeof vi.fn> };

  const input = {
    locationId: null,
    pricingCategory: PricingCategoryEnum.STANDARD,
    pricingTier: 2,
    durationMinutes: 30,
    frequencyLength: 3,
    effectiveDate: '2026-09-01',
  };

  beforeEach(() => {
    pricingResolver = {
      resolve: vi.fn(
        ({
          pricingTier,
          termMonths,
        }: {
          pricingTier: number;
          termMonths: number;
        }) => {
          const row = PUBLISHED[pricingTier];
          const termAmount =
            row.terms[termMonths] ??
            // A term nobody priced: monthly times N, no reduction.
            (Number(row.monthly) * termMonths).toFixed(2);
          return { monthlyAmount: row.monthly, termAmount };
        },
      ),
    };
    service = new PrepaidPricingService(pricingResolver as never);
  });

  it('charges the published total, not a percentage of the monthly', async () => {
    // The whole reason this service exists: 3% of 525.00 is 509.25, and the
    // rate card says 510.00.
    const pricing = await service.resolve(input);

    expect(pricing.payableTermAmount).toBe('510.00');
    expect(pricing.standardTermAmount).toBe('525.00');
    expect(pricing.cycleDiscountAmount).toBe('15.00');
  });

  it('derives the reduction backwards from the total, for every published term', async () => {
    for (const tier of [1, 2, 3]) {
      for (const term of [3, 6, 12]) {
        const pricing = await service.resolve({
          ...input,
          pricingTier: tier,
          frequencyLength: term,
        });

        const published = PUBLISHED[tier];
        expect(pricing.payableTermAmount).toBe(published.terms[term]);
        // standard - discount must land exactly on the published figure.
        expect(
          (
            Number(pricing.standardTermAmount) -
            Number(pricing.cycleDiscountAmount)
          ).toFixed(2),
        ).toBe(Number(published.terms[term]).toFixed(2));
        expect(pricing.isApprovedTerm).toBe(true);
      }
    }
  });

  it('disagrees with the percentage on eight of the nine published totals', async () => {
    // Pinned deliberately. If a future change reintroduces percentage-based
    // prepaid pricing, this is the test that should stop it.
    const percentages: Record<number, number> = { 3: 3, 6: 5, 12: 8 };
    let disagreements = 0;

    for (const tier of [1, 2, 3]) {
      for (const term of [3, 6, 12]) {
        const pricing = await service.resolve({
          ...input,
          pricingTier: tier,
          frequencyLength: term,
        });
        const byPercentage = (
          Number(pricing.standardTermAmount) *
          (1 - percentages[term] / 100)
        ).toFixed(2);

        if (byPercentage !== Number(pricing.payableTermAmount).toFixed(2)) {
          disagreements += 1;
        }
      }
    }

    expect(disagreements).toBe(8);
  });

  it('charges monthly times N for a term nobody priced', async () => {
    // C10: odd frequencies get no reduction at all.
    const pricing = await service.resolve({ ...input, frequencyLength: 5 });

    expect(pricing.payableTermAmount).toBe('875.00');
    expect(pricing.standardTermAmount).toBe('875.00');
    expect(pricing.cycleDiscountAmount).toBe('0.00');
    expect(pricing.isApprovedTerm).toBe(false);
  });

  it('treats a monthly cycle as no reduction', async () => {
    const pricing = await service.resolve({ ...input, frequencyLength: 1 });

    expect(pricing.payableTermAmount).toBe('175.00');
    expect(pricing.cycleDiscountAmount).toBe('0.00');
    expect(pricing.isApprovedTerm).toBe(false);
  });

  it('never returns a negative reduction', async () => {
    for (const term of [1, 2, 3, 5, 6, 11, 12]) {
      const pricing = await service.resolve({
        ...input,
        frequencyLength: term,
      });
      expect(Number(pricing.cycleDiscountAmount)).toBeGreaterThanOrEqual(0);
    }
  });
});
