import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PricingAdoptionService } from './pricing-adoption.service';

/**
 * A query builder that records what was asked and returns what it was told to.
 *
 * Every method returns `this`, so the chain can be built in any order without
 * the mock caring - the same way TypeORM behaves.
 */
function createQueryBuilderMock(raw: unknown[], count = raw.length) {
  const builder: Record<string, unknown> = {};
  const conditions: string[] = [];

  const chain =
    (record?: (arg: string) => void) =>
    (...args: unknown[]) => {
      if (record && typeof args[0] === 'string') {
        record(args[0]);
      }
      return builder;
    };

  Object.assign(builder, {
    select: vi.fn(chain()),
    addSelect: vi.fn(chain()),
    innerJoin: vi.fn(chain()),
    leftJoin: vi.fn(chain()),
    where: vi.fn(chain((c) => conditions.push(c))),
    andWhere: vi.fn(chain((c) => conditions.push(c))),
    groupBy: vi.fn(chain()),
    addGroupBy: vi.fn(chain()),
    orderBy: vi.fn(chain()),
    offset: vi.fn(chain()),
    limit: vi.fn(chain()),
    getRawMany: vi.fn(async () => raw),
    getCount: vi.fn(async () => count),
    conditions,
  });

  return builder as typeof builder & {
    conditions: string[];
    offset: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    getCount: ReturnType<typeof vi.fn>;
  };
}

describe('PricingAdoptionService', () => {
  let rollout: { isEnabledForLocation: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    rollout = { isEnabledForLocation: vi.fn().mockResolvedValue(true) };
  });

  function serviceFor(raw: unknown[], count?: number) {
    const builder = createQueryBuilderMock(raw, count);
    const enrolmentRepository = {
      createQueryBuilder: vi.fn(() => builder),
    };
    const service = new PricingAdoptionService(
      enrolmentRepository as never,
      rollout as never,
    );
    return { service, builder };
  }

  describe('summaryForLocation', () => {
    it('splits active enrolments into new and old pricing', async () => {
      const { service } = serviceFor([
        { pricingTier: null, isDefaulted: 0, pricingCategory: 'standard', total: 40 },
        { pricingTier: 1, isDefaulted: 0, pricingCategory: 'standard', total: 3 },
        { pricingTier: 2, isDefaulted: 0, pricingCategory: 'standard', total: 5 },
      ]);

      const summary = await service.summaryForLocation(15, '2026-09-15');

      expect(summary.activeEnrolments).toBe(48);
      expect(summary.onNewPricing).toBe(8);
      expect(summary.onOldPricing).toBe(40);
      expect(summary.byTier).toEqual({ 1: 3, 2: 5, 3: 0 });
    });

    // COUNT(*) comes back from the driver as a string. Adding those would
    // concatenate - "40" + "3" is "403", a plausible-looking number that is
    // wrong by an order of magnitude.
    it('adds counts as numbers even though the driver returns strings', async () => {
      const { service } = serviceFor([
        { pricingTier: null, isDefaulted: '0', pricingCategory: 'standard', total: '40' },
        { pricingTier: 1, isDefaulted: '0', pricingCategory: 'standard', total: '3' },
      ]);

      const summary = await service.summaryForLocation(15, '2026-09-15');

      expect(summary.activeEnrolments).toBe(43);
      expect(summary.onNewPricing).toBe(3);
    });

    // tinyint(1) arrives as 1/0, but a driver that hands back the string "0"
    // makes a truthiness test count every row as defaulted.
    it('does not read the string "0" as a defaulted tier', async () => {
      const { service } = serviceFor([
        { pricingTier: 1, isDefaulted: '0', pricingCategory: 'standard', total: 6 },
      ]);

      const summary = await service.summaryForLocation(15, '2026-09-15');

      expect(summary.defaultedTier).toBe(0);
    });

    it('counts a defaulted tier so somebody has to look at it', async () => {
      const { service } = serviceFor([
        { pricingTier: 1, isDefaulted: 1, pricingCategory: 'vocal', total: 2 },
        { pricingTier: 1, isDefaulted: 0, pricingCategory: 'vocal', total: 4 },
      ]);

      const summary = await service.summaryForLocation(15, '2026-09-15');

      expect(summary.defaultedTier).toBe(2);
      expect(summary.onNewPricing).toBe(6);
    });

    // These cannot be tiered at all, so counting them as outstanding work would
    // make the report permanently unfinishable.
    it('separates enrolments on unclassified programs from the backlog', async () => {
      const { service } = serviceFor([
        { pricingTier: null, isDefaulted: 0, pricingCategory: null, total: 12 },
        { pricingTier: null, isDefaulted: 0, pricingCategory: 'standard', total: 30 },
      ]);

      const summary = await service.summaryForLocation(15, '2026-09-15');

      expect(summary.onUnclassifiedPrograms).toBe(12);
      expect(summary.onOldPricing).toBe(42);
    });

    // Arcadia approved grandfathering on 2026-08-18. These are a decision
    // somebody made, not accounts waiting to be converted - counting them as
    // outstanding would make the backlog permanently unfinishable and would
    // invite a location to "fix" a rate a customer was promised.
    it('counts enrolments deliberately held on the previous rate', async () => {
      const { service } = serviceFor([
        {
          pricingTier: null,
          isDefaulted: 0,
          keepsPreviousRate: 1,
          pricingCategory: 'standard',
          programName: 'Piano Core',
          total: 4,
        },
        {
          pricingTier: null,
          isDefaulted: 0,
          keepsPreviousRate: 0,
          pricingCategory: 'standard',
          programName: 'Piano Core',
          total: 30,
        },
      ]);

      const summary = await service.summaryForLocation(15, '2026-09-15');

      expect(summary.onPreviousRateByAgreement).toBe(4);
      // Still part of the old-pricing total; the flag names a subset of it.
      expect(summary.onOldPricing).toBe(34);
    });

    // The same tinyint(1) trap as the defaulted flag: the string "0" is
    // truthy, so a truthiness test would report every enrolment as
    // grandfathered and hide the handful that really are.
    it('does not read the string "0" as a held rate', async () => {
      const { service } = serviceFor([
        {
          pricingTier: null,
          isDefaulted: 0,
          keepsPreviousRate: '0',
          pricingCategory: 'standard',
          programName: 'Piano Core',
          total: 9,
        },
      ]);

      const summary = await service.summaryForLocation(15, '2026-09-15');

      expect(summary.onPreviousRateByAgreement).toBe(0);
    });

    // xPiano Core holds the 2018 sheet and is never offered a tier, so these
    // are part of the floor under onOldPricing rather than work outstanding.
    it('counts enrolments on a program holding an older sheet', async () => {
      const { service } = serviceFor([
        {
          pricingTier: null,
          isDefaulted: 0,
          keepsPreviousRate: 0,
          pricingCategory: 'standard',
          programName: 'xPiano Core',
          total: 351,
        },
        {
          pricingTier: null,
          isDefaulted: 0,
          keepsPreviousRate: 0,
          pricingCategory: 'standard',
          programName: 'Piano Core',
          total: 100,
        },
      ]);

      const summary = await service.summaryForLocation(15, '2026-09-15');

      expect(summary.onLegacyPrograms).toBe(351);
    });

    // An unclassified program is missing a decision; a marker program has
    // already had one. Counting a row in both would overstate the floor.
    it('never counts one enrolment as both unclassified and legacy', async () => {
      const { service } = serviceFor([
        {
          pricingTier: null,
          isDefaulted: 0,
          keepsPreviousRate: 0,
          pricingCategory: null,
          programName: 'xBand',
          total: 12,
        },
      ]);

      const summary = await service.summaryForLocation(15, '2026-09-15');

      expect(summary.onUnclassifiedPrograms).toBe(12);
      expect(summary.onLegacyPrograms).toBe(0);
    });

    // Xylophone is an instrument, not a marker. Getting this wrong would file
    // a perfectly ordinary program under "frozen older sheet" for good.
    it('does not call an instrument beginning with x a legacy program', async () => {
      const { service } = serviceFor([
        {
          pricingTier: null,
          isDefaulted: 0,
          keepsPreviousRate: 0,
          pricingCategory: 'standard',
          programName: 'Xylophone',
          total: 5,
        },
      ]);

      const summary = await service.summaryForLocation(15, '2026-09-15');

      expect(summary.onLegacyPrograms).toBe(0);
    });

    it('reports an empty location as zero rather than failing', async () => {
      const { service } = serviceFor([]);

      const summary = await service.summaryForLocation(15, '2026-09-15');

      expect(summary.activeEnrolments).toBe(0);
      expect(summary.onOldPricing).toBe(0);
      expect(summary.byTier).toEqual({ 1: 0, 2: 0, 3: 0 });
    });

    it('says whether the location can use the new pricing at all', async () => {
      rollout.isEnabledForLocation.mockResolvedValue(false);
      const { service } = serviceFor([]);

      const summary = await service.summaryForLocation(9, '2026-09-15');

      expect(summary.isRolloutEnabled).toBe(false);
      expect(rollout.isEnabledForLocation).toHaveBeenCalledWith(9);
    });

    it('measures active against the date it was given', async () => {
      const { service, builder } = serviceFor([]);

      await service.summaryForLocation(15, '2026-09-15');

      expect(
        builder.conditions.some((c) => c.includes('endDateTime')),
      ).toBe(true);
      expect(builder.conditions.some((c) => c.includes('isDeleted'))).toBe(true);
    });
  });

  describe('listForLocation', () => {
    const row = {
      enrolmentId: 4821,
      studentId: 991,
      firstName: 'Amara',
      lastName: 'Okafor',
      programName: 'xBass Guitar',
      programPublicName: 'Bass Guitar',
      pricingCategory: 'standard',
      pricingTier: 2,
      pricingTierIsDefaulted: 0,
      startDate: '2026-09-01',
      endDate: '2027-06-30',
    };

    it('never shows the internal program name', async () => {
      const { service } = serviceFor([row]);

      const { rows } = await service.listForLocation({
        locationId: 15,
        asOf: '2026-09-15',
        page: 1,
        limit: 50,
      });

      expect(rows[0].programName).toBe('Bass Guitar');
      expect(rows[0].studentName).toBe('Amara Okafor');
      expect(rows[0].pricingTier).toBe(2);
      expect(rows[0].pricingTierIsDefaulted).toBe(false);
    });

    it('falls back to the internal name rather than showing nothing', async () => {
      const { service } = serviceFor([
        { ...row, programPublicName: null, programName: 'Piano Core' },
      ]);

      const { rows } = await service.listForLocation({
        locationId: 15,
        asOf: '2026-09-15',
        page: 1,
        limit: 50,
      });

      expect(rows[0].programName).toBe('Piano Core');
    });

    // A real enrolment in this database has id 0, and `if (id)` skips it.
    it('keeps an enrolment whose id is 0', async () => {
      const { service } = serviceFor([{ ...row, enrolmentId: 0 }]);

      const { rows } = await service.listForLocation({
        locationId: 15,
        asOf: '2026-09-15',
        page: 1,
        limit: 50,
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].enrolmentId).toBe(0);
    });

    it('reads a tier of null as not on the new pricing', async () => {
      const { service } = serviceFor([
        { ...row, pricingTier: null, pricingCategory: null },
      ]);

      const { rows } = await service.listForLocation({
        locationId: 15,
        asOf: '2026-09-15',
        page: 1,
        limit: 50,
      });

      expect(rows[0].pricingTier).toBeNull();
      expect(rows[0].pricingCategory).toBeNull();
    });

    it.each([
      [true, 'enrolment.pricingTier IS NOT NULL'],
      [false, 'enrolment.pricingTier IS NULL'],
    ])('filters to one side when onNewPricing is %s', async (flag, expected) => {
      const { service, builder } = serviceFor([]);

      await service.listForLocation({
        locationId: 15,
        asOf: '2026-09-15',
        onNewPricing: flag as boolean,
        page: 1,
        limit: 50,
      });

      expect(builder.conditions).toContain(expected);
    });

    it('returns both sides when onNewPricing is omitted', async () => {
      const { service, builder } = serviceFor([]);

      await service.listForLocation({
        locationId: 15,
        asOf: '2026-09-15',
        page: 1,
        limit: 50,
      });

      expect(
        builder.conditions.some((c) => c.includes('pricingTier IS')),
      ).toBe(false);
    });

    it('can narrow to the tiers nobody chose', async () => {
      const { service, builder } = serviceFor([]);

      await service.listForLocation({
        locationId: 15,
        asOf: '2026-09-15',
        defaultedOnly: true,
        page: 1,
        limit: 50,
      });

      expect(builder.conditions).toContain(
        'enrolment.pricingTierIsDefaulted = 1',
      );
    });

    it('pages from one, not from zero', async () => {
      const { service, builder } = serviceFor([]);

      await service.listForLocation({
        locationId: 15,
        asOf: '2026-09-15',
        page: 3,
        limit: 25,
      });

      expect(builder.offset).toHaveBeenCalledWith(50);
      expect(builder.limit).toHaveBeenCalledWith(25);
    });

    it('reports a total that describes the same filters as the rows', async () => {
      const { service, builder } = serviceFor([row], 137);

      const result = await service.listForLocation({
        locationId: 15,
        asOf: '2026-09-15',
        onNewPricing: true,
        page: 1,
        limit: 1,
      });

      expect(result.total).toBe(137);
      // Counted after the filter was applied, not before.
      expect(builder.getCount).toHaveBeenCalled();
      expect(builder.conditions).toContain('enrolment.pricingTier IS NOT NULL');
    });

    // toISOString on a local-midnight Date reports the previous day anywhere
    // ahead of UTC, which is where this was written.
    it('does not shift a date column by a day', async () => {
      const { service } = serviceFor([
        { ...row, startDate: new Date(2026, 8, 1), endDate: null },
      ]);

      const { rows } = await service.listForLocation({
        locationId: 15,
        asOf: '2026-09-15',
        page: 1,
        limit: 50,
      });

      expect(rows[0].startDate).toBe('2026-09-01');
      expect(rows[0].endDate).toBeNull();
    });

    it('shows that a rate was held, and why', async () => {
      const { service } = serviceFor([
        {
          ...row,
          pricingTier: null,
          keepsPreviousRate: 1,
          previousRateReason: 'Locked in before September',
        },
      ]);

      const { rows } = await service.listForLocation({
        locationId: 15,
        asOf: '2026-09-15',
        page: 1,
        limit: 50,
      });

      expect(rows[0].keepsPreviousRate).toBe(true);
      expect(rows[0].previousRateReason).toBe('Locked in before September');
    });

    it('does not read the string "0" as a held rate', async () => {
      const { service } = serviceFor([{ ...row, keepsPreviousRate: '0' }]);

      const { rows } = await service.listForLocation({
        locationId: 15,
        asOf: '2026-09-15',
        page: 1,
        limit: 50,
      });

      expect(rows[0].keepsPreviousRate).toBe(false);
    });

    // Distinct from onNewPricing: false, which also returns every enrolment
    // that simply predates the rollout - hundreds, where a location reviewing
    // the concessions it granted wants the handful.
    it('can narrow to the rates that were deliberately held', async () => {
      const { service, builder } = serviceFor([]);

      await service.listForLocation({
        locationId: 15,
        asOf: '2026-09-15',
        previousRateOnly: true,
        page: 1,
        limit: 50,
      });

      expect(builder.conditions).toContain('enrolment.keepsPreviousRate = 1');
    });

    it('returns both sides when previousRateOnly is omitted', async () => {
      const { service, builder } = serviceFor([]);

      await service.listForLocation({
        locationId: 15,
        asOf: '2026-09-15',
        page: 1,
        limit: 50,
      });

      expect(
        builder.conditions.some((c) => c.includes('keepsPreviousRate')),
      ).toBe(false);
    });

    it('names an unknown student rather than rendering a blank row', async () => {
      const { service } = serviceFor([
        { ...row, firstName: null, lastName: null },
      ]);

      const { rows } = await service.listForLocation({
        locationId: 15,
        asOf: '2026-09-15',
        page: 1,
        limit: 50,
      });

      expect(rows[0].studentName).toBe('Unknown');
    });
  });
});
