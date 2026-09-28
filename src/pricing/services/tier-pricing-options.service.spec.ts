import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TierPricingOptionsService } from './tier-pricing-options.service';
import { PricingCategoryEnum } from '../enums/pricing-category.enum';
import { ResolvePriceInput } from './pricing-resolver.service';

describe('TierPricingOptionsService', () => {
  let service: TierPricingOptionsService;
  let programRepository: { findOne: ReturnType<typeof vi.fn> };
  let pricingResolver: { resolve: ReturnType<typeof vi.fn> };
  let programPresentation: {
    isClassified: ReturnType<typeof vi.fn>;
    isTierable: ReturnType<typeof vi.fn>;
    hasInternalMarker: ReturnType<typeof vi.fn>;
    pricingCategoryFor: ReturnType<typeof vi.fn>;
  };
  let rollout: { isEnabledForLocation: ReturnType<typeof vi.fn> };

  const input = {
    locationId: 3,
    programId: 8,
    durationMinutes: 60,
    effectiveDate: '2026-09-01',
  };

  /**
   * The September sheet's standard 60-minute column, copied from
   * `SEPTEMBER_2026_TUITION` rather than restated - these are the client's
   * approved figures.
   *
   * Note $844.00 for three months of tier 1 against $870.00 for three monthly
   * payments: the reduction is real but is not a clean percentage, which is the
   * whole reason these totals are stored rather than computed.
   */
  const STANDARD_60: Record<
    number,
    { hourly: string; monthly: string; prepaid: Record<number, string> }
  > = {
    1: {
      hourly: '72.50',
      monthly: '290.00',
      prepaid: { 3: '844.00', 6: '1653.00', 12: '3202.00' },
    },
    2: {
      hourly: '87.50',
      monthly: '350.00',
      prepaid: { 3: '1019.00', 6: '1995.00', 12: '3864.00' },
    },
    3: {
      hourly: '102.50',
      monthly: '410.00',
      prepaid: { 3: '1194.00', 6: '2337.00', 12: '4527.00' },
    },
  };

  beforeEach(() => {
    programRepository = { findOne: vi.fn() };
    pricingResolver = { resolve: vi.fn() };
    programPresentation = {
      isClassified: vi.fn().mockReturnValue(true),
      // Mirrors classification unless a test says otherwise, which is the real
      // behaviour for any program without a marker prefix. The cast is only
      // because `isClassified` is declared as a bare `vi.fn()` above, which
      // TypeScript will not let us call directly - it says nothing about
      // behaviour.
      isTierable: vi.fn((program: unknown) =>
        (
          programPresentation.isClassified as unknown as (p: unknown) => boolean
        )(program),
      ),
      hasInternalMarker: vi.fn(() => false),
      pricingCategoryFor: vi.fn().mockReturnValue(PricingCategoryEnum.STANDARD),
    };

    rollout = { isEnabledForLocation: vi.fn().mockResolvedValue(true) };

    programRepository.findOne.mockResolvedValue({ id: 8, type: 1 });
    // Deliberately not `async`: the service awaits the result either way, and
    // an async arrow here trips no-misused-promises on the mock's signature.
    pricingResolver.resolve.mockImplementation(
      ({
        pricingTier,
        termMonths,
      }: {
        pricingTier: number;
        termMonths: number;
      }) => ({
        hourlyRate: STANDARD_60[pricingTier].hourly,
        monthlyAmount: STANDARD_60[pricingTier].monthly,
        termAmount:
          termMonths === 1
            ? STANDARD_60[pricingTier].monthly
            : (STANDARD_60[pricingTier].prepaid?.[termMonths] ?? null),
        source: termMonths === 1 ? 'catalogue_monthly' : 'catalogue_prepaid',
      }),
    );

    service = new TierPricingOptionsService(
      programRepository as any,
      pricingResolver as any,
      programPresentation as any,
      rollout as any,
    );
  });

  it('offers all three tiers with the monthly price staff read', async () => {
    const result = await service.findForProgram(input);

    expect(result.isTiered).toBe(true);
    expect(result.pricingCategory).toBe(PricingCategoryEnum.STANDARD);
    expect(result.termMonths).toBe(1);
    expect(result.options).toEqual([
      {
        pricingTier: 1,
        hourlyRate: '72.50',
        monthlyAmount: '290.00',
        termAmount: '290.00',
        termAmountSource: 'catalogue_monthly',
      },
      {
        pricingTier: 2,
        hourlyRate: '87.50',
        monthlyAmount: '350.00',
        termAmount: '350.00',
        termAmountSource: 'catalogue_monthly',
      },
      {
        pricingTier: 3,
        hourlyRate: '102.50',
        monthlyAmount: '410.00',
        termAmount: '410.00',
        termAmountSource: 'catalogue_monthly',
      },
    ]);
  });

  describe('prepaid terms', () => {
    // Ashif, 2026-08-24: "when I change the payment frequency, it keeps the
    // monthly rate rather than applying the corresponding 3, 6, or 12-month
    // pricing." The endpoint had no term at all until then.
    it('quotes the approved three-month total, not three monthly payments', async () => {
      const result = await service.findForProgram({ ...input, termMonths: 3 });

      expect(result.termMonths).toBe(3);
      expect(result.options.map((o) => o.termAmount)).toEqual([
        '844.00',
        '1019.00',
        '1194.00',
      ]);

      // The point of storing them: three months of tier 1 is $844.00, not the
      // $870.00 that three monthly payments would come to.
      const [tier1] = result.options;
      expect(Number(tier1.monthlyAmount) * 3).toBeCloseTo(870, 2);
      expect(Number(tier1.termAmount)).toBeCloseTo(844, 2);
    });

    it('quotes the six and twelve month totals too', async () => {
      const six = await service.findForProgram({ ...input, termMonths: 6 });
      const twelve = await service.findForProgram({ ...input, termMonths: 12 });

      expect(six.options.map((o) => o.termAmount)).toEqual([
        '1653.00',
        '1995.00',
        '2337.00',
      ]);
      expect(twelve.options.map((o) => o.termAmount)).toEqual([
        '3202.00',
        '3864.00',
        '4527.00',
      ]);
    });

    it('still reports the monthly amount alongside a prepaid total', async () => {
      // Staff compare the two, and the monthly figure is what the tier means.
      const result = await service.findForProgram({ ...input, termMonths: 12 });

      expect(result.options.map((o) => o.monthlyAmount)).toEqual([
        '290.00',
        '350.00',
        '410.00',
      ]);
    });

    it('defaults to a single month when no term is asked for', async () => {
      // Every caller before prepaid terms existed. The answer must not change.
      const result = await service.findForProgram(input);

      expect(result.termMonths).toBe(1);
      expect(
        result.options.every((o) => o.termAmount === o.monthlyAmount),
      ).toBe(true);
      expect(pricingResolver.resolve).toHaveBeenCalledWith(
        expect.objectContaining({ termMonths: 1 }),
      );
    });

    it('passes the term through to the resolver rather than deriving a price', async () => {
      await service.findForProgram({ ...input, termMonths: 6 });

      expect(pricingResolver.resolve).toHaveBeenCalledWith(
        expect.objectContaining({ termMonths: 6 }),
      );
    });

    // A term the client never priced - four and five months are in live use.
    // The resolver charges monthly times the term with no reduction, and the
    // screen must be able to say so rather than implying a prepaid discount.
    it('reports how an unapproved term was priced', async () => {
      pricingResolver.resolve.mockImplementation(
        ({ pricingTier }: { pricingTier: number }) => ({
          hourlyRate: STANDARD_60[pricingTier].hourly,
          monthlyAmount: STANDARD_60[pricingTier].monthly,
          termAmount: (Number(STANDARD_60[pricingTier].monthly) * 4).toFixed(2),
          source: 'catalogue_monthly_multiple',
        }),
      );

      const result = await service.findForProgram({ ...input, termMonths: 4 });

      expect(result.options[0].termAmount).toBe('1160.00');
      expect(result.options[0].termAmountSource).toBe(
        'catalogue_monthly_multiple',
      );
    });

    // The tier is priced; only the prepaid total is missing. Withdrawing the
    // tier would leave staff unable to enrol the student at all, which is a
    // worse failure than showing the monthly price and saying so.
    it('keeps offering the tier when a term has no approved total', async () => {
      pricingResolver.resolve.mockImplementation(
        ({
          pricingTier,
          termMonths,
        }: {
          pricingTier: number;
          termMonths: number;
        }) => {
          if (termMonths !== 1) throw new Error('MISSING_PREPAID_PRICE');
          return {
            hourlyRate: STANDARD_60[pricingTier].hourly,
            monthlyAmount: STANDARD_60[pricingTier].monthly,
            termAmount: STANDARD_60[pricingTier].monthly,
            source: 'catalogue_monthly',
          };
        },
      );

      const result = await service.findForProgram({ ...input, termMonths: 3 });

      expect(result.isTiered).toBe(true);
      expect(result.options).toHaveLength(3);
      expect(result.options[0].monthlyAmount).toBe('290.00');
      // Never invented. A null says "no approved total", not "free".
      expect(result.options.every((o) => o.termAmount === null)).toBe(true);
      expect(result.options.every((o) => o.termAmountSource === null)).toBe(
        true,
      );
    });

    it('offers nothing when a tier has no price at all', async () => {
      // Distinct from the case above: here the tier itself is unpriced, so the
      // existing all-three-or-none rule still applies.
      pricingResolver.resolve.mockImplementation(() => {
        throw new Error('NO_PRICE');
      });

      const result = await service.findForProgram({ ...input, termMonths: 3 });

      expect(result.isTiered).toBe(false);
      expect(result.options).toEqual([]);
    });
  });

  it('shows the $60 a month a single tier step costs', async () => {
    // The reason the selector shows money rather than a tier number.
    const result = await service.findForProgram(input);
    const [tier1, tier2] = result.options;

    expect(
      Number(tier2.monthlyAmount) - Number(tier1.monthlyAmount),
    ).toBeCloseTo(60, 2);
  });

  /**
   * The screen has to be able to tell a permanent "never" from a gap somebody
   * can close. Arcadia hit the difference on 2026-09-02 with Instrument.
   */
  it('says an unclassified program is waiting on a pricing category', async () => {
    programPresentation.isTierable.mockReturnValue(false);
    programPresentation.hasInternalMarker.mockReturnValue(false);

    const result = await service.findForProgram({
      locationId: 15, programId: 98, durationMinutes: 30,
      effectiveDate: '2026-09-01',
    });

    expect(result.isTiered).toBe(false);
    expect(result.noTiersReason).toBe('unclassified-program');
    expect(result.programName).not.toBeNull();
  });

  it('says a retired program is retired', async () => {
    programPresentation.isTierable.mockReturnValue(false);
    programPresentation.hasInternalMarker.mockReturnValue(true);

    const result = await service.findForProgram({
      locationId: 15, programId: 64, durationMinutes: 30,
      effectiveDate: '2026-09-01',
    });

    expect(result.noTiersReason).toBe('retired-program');
  });

  it('gives no reason when tiers are offered', async () => {
    const result = await service.findForProgram({
      locationId: 15, programId: 64, durationMinutes: 30,
      effectiveDate: '2026-09-01',
    });

    expect(result.isTiered).toBe(true);
    expect(result.noTiersReason).toBeNull();
  });

  it('offers nothing for an unclassified program', async () => {
    programPresentation.isClassified.mockReturnValue(false);

    const result = await service.findForProgram(input);

    expect(result.isTiered).toBe(false);
    expect(result.options).toEqual([]);
    expect(pricingResolver.resolve).not.toHaveBeenCalled();
  });

  // xPiano Core is classified and holds the 2018 sheet at $57.50 an hour.
  // Showing a tier selector on it would invite staff to quote the September
  // price from the program that exists to preserve the old one.
  it('offers nothing for a program that holds an older price sheet', async () => {
    programPresentation.isTierable.mockReturnValue(false);

    const result = await service.findForProgram(input);

    expect(result.isTiered).toBe(false);
    expect(result.options).toEqual([]);
    expect(pricingResolver.resolve).not.toHaveBeenCalled();
  });

  it('offers nothing even when that program is classified', async () => {
    programPresentation.isClassified.mockReturnValue(true);
    programPresentation.isTierable.mockReturnValue(false);

    const result = await service.findForProgram(input);

    expect(result.isTiered).toBe(false);
  });

  it('offers nothing when the program does not exist', async () => {
    programRepository.findOne.mockResolvedValue(null);

    const result = await service.findForProgram(input);

    expect(result.isTiered).toBe(false);
    expect(result.options).toEqual([]);
  });

  it('offers nothing rather than a partial set when a tier has no price', async () => {
    // Two of three would let one member of staff pick a price a colleague
    // cannot see, which is worse than falling back to the manual rate field.
    pricingResolver.resolve.mockImplementation(
      ({ pricingTier }: { pricingTier: number }) => {
        if (pricingTier === 3) {
          throw new Error('NO_MATCHING_PRICE');
        }
        return {
          hourlyRate: STANDARD_60[pricingTier].hourly,
          monthlyAmount: STANDARD_60[pricingTier].monthly,
        };
      },
    );

    const result = await service.findForProgram(input);

    expect(result.isTiered).toBe(false);
    expect(result.options).toEqual([]);
  });

  it('offers nothing for a date before the new structure begins', async () => {
    pricingResolver.resolve.mockRejectedValue(new Error('NO_MATCHING_PRICE'));

    const result = await service.findForProgram({
      ...input,
      effectiveDate: '2026-08-15',
    });

    expect(result.isTiered).toBe(false);
  });

  it('asks the catalogue for monthly billing, at the date it was given', async () => {
    await service.findForProgram(input);

    const calls = pricingResolver.resolve.mock.calls as Array<
      [ResolvePriceInput]
    >;

    for (const [args] of calls) {
      expect(args.termMonths).toBe(1);
      expect(args.effectiveDate).toBe('2026-09-01');
      expect(args.durationMinutes).toBe(60);
      expect(args.locationId).toBe(3);
    }
  });

  it('offers no tiers at a location outside the rollout', async () => {
    rollout.isEnabledForLocation.mockResolvedValue(false);

    const result = await service.findForProgram(input);

    expect(result.isTiered).toBe(false);
    expect(result.options).toEqual([]);
  });

  it('does not price anything at a location outside the rollout', async () => {
    rollout.isEnabledForLocation.mockResolvedValue(false);

    await service.findForProgram(input);

    // The point of the gate. A price that is never resolved cannot be shown,
    // chosen, or written to `course_program_rate`.
    expect(pricingResolver.resolve).not.toHaveBeenCalled();
  });

  it('checks the rollout for the location it was asked about', async () => {
    await service.findForProgram(input);

    expect(rollout.isEnabledForLocation).toHaveBeenCalledWith(3);
  });
});
