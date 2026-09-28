import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PricingResolverService } from './pricing-resolver.service';
import { TuitionPriceRepository } from '../repositories/tuition-price.repository';
import { PricingCategoryEnum } from '../enums/pricing-category.enum';
import { ProgramTypeEnum } from '../../program/enums/program-type';
import {
  PricingResolutionError,
  PricingResolutionErrorCode,
} from '../errors/pricing-resolution.error';
import { TuitionPrice } from '../entities/tuition-price.entity';
import { SEPTEMBER_2026_TUITION } from '../constants/september-2026-tuition';

function priceRow(overrides: Partial<TuitionPrice> = {}): TuitionPrice {
  return {
    id: 1,
    locationId: null,
    pricingCategory: PricingCategoryEnum.STANDARD,
    pricingTier: 1,
    durationMinutes: 30,
    effectiveFrom: '2026-09-01' as unknown as Date,
    effectiveTo: null,
    monthlyAmount: '145.00',
    hourlyRate: '72.50',
    isDeleted: false,
    ...overrides,
  } as TuitionPrice;
}

describe('PricingResolverService', () => {
  let service: PricingResolverService;
  let findEffectiveCandidates: ReturnType<typeof vi.fn>;
  let findPrepaidPrice: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    findEffectiveCandidates = vi.fn();
    findPrepaidPrice = vi.fn();
    service = new PricingResolverService({
      findEffectiveCandidates,
      findPrepaidPrice,
    } as unknown as TuitionPriceRepository);
  });

  const baseInput = {
    locationId: null,
    pricingCategory: PricingCategoryEnum.STANDARD,
    pricingTier: 1,
    durationMinutes: 30,
    termMonths: 1,
    effectiveDate: '2026-09-01',
  };

  describe('monthly billing', () => {
    it('returns the exact monthly amount and the hourly snapshot value', async () => {
      findEffectiveCandidates.mockResolvedValue([priceRow()]);

      const result = await service.resolve(baseInput);

      expect(result.monthlyAmount).toBe('145.00');
      expect(result.termAmount).toBe('145.00');
      expect(result.hourlyRate).toBe('72.50');
      expect(result.source).toBe('catalogue_monthly');
      expect(result.tuitionPrepaidPriceId).toBeNull();
    });

    it('keeps a half-dollar monthly amount exact', async () => {
      findEffectiveCandidates.mockResolvedValue([
        priceRow({ durationMinutes: 45, monthlyAmount: '217.50' }),
      ]);

      const result = await service.resolve({
        ...baseInput,
        durationMinutes: 45,
      });

      expect(result.termAmount).toBe('217.50');
    });
  });

  describe('prepaid terms use the approved total, never a percentage', () => {
    it('returns 510.00 for three months of the 30-minute tier 2 price', async () => {
      findEffectiveCandidates.mockResolvedValue([
        priceRow({
          id: 2,
          pricingTier: 2,
          monthlyAmount: '175.00',
          hourlyRate: '87.50',
        }),
      ]);
      findPrepaidPrice.mockResolvedValue({
        id: 99,
        amount: '510.00',
        termMonths: 3,
      });

      const result = await service.resolve({
        ...baseInput,
        pricingTier: 2,
        termMonths: 3,
      });

      expect(result.termAmount).toBe('510.00');
      // 3% off 175.00 x 3 would be 509.25. The approved figure wins.
      expect(result.termAmount).not.toBe('509.25');
      expect(result.source).toBe('catalogue_prepaid');
      expect(result.tuitionPrepaidPriceId).toBe(99);
    });

    it('fails closed when an approved total is missing', async () => {
      findEffectiveCandidates.mockResolvedValue([priceRow()]);
      findPrepaidPrice.mockResolvedValue(null);

      await expect(
        service.resolve({ ...baseInput, termMonths: 12 }),
      ).rejects.toMatchObject({
        code: PricingResolutionErrorCode.MISSING_PREPAID_PRICE,
      });
    });
  });

  describe('terms the client did not price', () => {
    // Bi-monthly, four-month and five-month frequencies are in live use but
    // carry no approved total. They are charged monthly times N with no
    // reduction, so nobody pays more than they would on monthly billing.
    it.each([
      [2, '290.00'],
      [4, '580.00'],
      [5, '725.00'],
    ])(
      'charges %i months as monthly times the term (%s)',
      async (termMonths, expected) => {
        findEffectiveCandidates.mockResolvedValue([priceRow()]);

        const result = await service.resolve({ ...baseInput, termMonths });

        expect(result.termAmount).toBe(expected);
        expect(result.source).toBe('catalogue_monthly_multiple');
        expect(findPrepaidPrice).not.toHaveBeenCalled();
      },
    );
  });

  describe('fails closed rather than guessing', () => {
    it('errors when nothing matches', async () => {
      findEffectiveCandidates.mockResolvedValue([]);

      await expect(service.resolve(baseInput)).rejects.toMatchObject({
        code: PricingResolutionErrorCode.NO_MATCHING_PRICE,
      });
    });

    it('errors on overlapping rows instead of taking the first', async () => {
      findEffectiveCandidates.mockResolvedValue([
        priceRow({ id: 1 }),
        priceRow({ id: 2, monthlyAmount: '999.00' }),
      ]);

      const error = await service
        .resolve(baseInput)
        .catch((e: PricingResolutionError) => e);

      expect(error).toBeInstanceOf(PricingResolutionError);
      expect((error as PricingResolutionError).code).toBe(
        PricingResolutionErrorCode.AMBIGUOUS_PRICE,
      );
      expect((error as PricingResolutionError).context.tuitionPriceIds).toEqual(
        [1, 2],
      );
    });

    it('rejects group programs', async () => {
      await expect(
        service.resolve({
          ...baseInput,
          programType: ProgramTypeEnum.GROUP_PROGRAM,
        }),
      ).rejects.toMatchObject({
        code: PricingResolutionErrorCode.UNSUPPORTED_PROGRAM_TYPE,
      });
      expect(findEffectiveCandidates).not.toHaveBeenCalled();
    });

    it('rejects an unsupported duration', async () => {
      await expect(
        service.resolve({ ...baseInput, durationMinutes: 20 }),
      ).rejects.toMatchObject({
        code: PricingResolutionErrorCode.INVALID_INPUT,
      });
    });

    it('rejects a malformed effective date', async () => {
      await expect(
        service.resolve({ ...baseInput, effectiveDate: '01/09/2026' }),
      ).rejects.toMatchObject({
        code: PricingResolutionErrorCode.INVALID_INPUT,
      });
    });
  });

  describe('location scope', () => {
    it('prefers a location row over the global row', async () => {
      findEffectiveCandidates.mockResolvedValue([
        priceRow({ id: 1, locationId: null, monthlyAmount: '145.00' }),
        priceRow({ id: 2, locationId: 9, monthlyAmount: '150.00' }),
      ]);

      const result = await service.resolve({ ...baseInput, locationId: 9 });

      expect(result.termAmount).toBe('150.00');
      expect(result.isLocationOverride).toBe(true);
    });

    it('falls back to the global row when the location has none', async () => {
      findEffectiveCandidates.mockResolvedValue([
        priceRow({ id: 1, locationId: null }),
      ]);

      const result = await service.resolve({ ...baseInput, locationId: 9 });

      expect(result.termAmount).toBe('145.00');
      expect(result.isLocationOverride).toBe(false);
    });

    it('errors when two location rows overlap', async () => {
      findEffectiveCandidates.mockResolvedValue([
        priceRow({ id: 2, locationId: 9 }),
        priceRow({ id: 3, locationId: 9 }),
      ]);

      await expect(
        service.resolve({ ...baseInput, locationId: 9 }),
      ).rejects.toMatchObject({
        code: PricingResolutionErrorCode.AMBIGUOUS_PRICE,
      });
    });
  });

  describe('the 1 September boundary', () => {
    it('passes the exact date through to the query, with no timezone shift', async () => {
      findEffectiveCandidates.mockResolvedValue([priceRow()]);

      await service.resolve({ ...baseInput, effectiveDate: '2026-09-01' });

      expect(findEffectiveCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ effectiveDate: '2026-09-01' }),
      );
    });

    it('reduces a Date to a plain calendar day', async () => {
      findEffectiveCandidates.mockResolvedValue([priceRow()]);

      await service.resolve({
        ...baseInput,
        effectiveDate: new Date('2026-09-01T00:00:00.000Z'),
      });

      expect(findEffectiveCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ effectiveDate: '2026-09-01' }),
      );
    });

    it('returns nothing for an August date when only a September row exists', async () => {
      // The repository filters by date; an August lookup finds no candidates,
      // and the resolver must refuse rather than reach for the newest row.
      findEffectiveCandidates.mockResolvedValue([]);

      await expect(
        service.resolve({ ...baseInput, effectiveDate: '2026-08-31' }),
      ).rejects.toMatchObject({
        code: PricingResolutionErrorCode.NO_MATCHING_PRICE,
      });
    });
  });

  describe('agrees with the authoritative fixture', () => {
    it.each(
      SEPTEMBER_2026_TUITION.map((p) => [
        `${p.category}-${p.durationMinutes}-${p.tier}`,
        p,
      ]),
    )('%s resolves its exact monthly amount', async (_label, price) => {
      findEffectiveCandidates.mockResolvedValue([
        priceRow({
          pricingCategory: price.category,
          pricingTier: price.tier,
          durationMinutes: price.durationMinutes,
          monthlyAmount: price.monthlyAmount,
          hourlyRate: price.hourlyRate,
        }),
      ]);

      const result = await service.resolve({
        ...baseInput,
        pricingCategory: price.category,
        pricingTier: price.tier,
        durationMinutes: price.durationMinutes,
      });

      expect(result.monthlyAmount).toBe(price.monthlyAmount);
      expect(result.hourlyRate).toBe(price.hourlyRate);
    });
  });
});
