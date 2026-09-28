import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EnrolmentTierService,
  DEFAULT_PRICING_TIER,
} from './enrolment-tier.service';
import { PricingResolutionErrorCode } from '../errors/pricing-resolution.error';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { EnrolmentTierChange } from '../entities/enrolment-tier-change.entity';
import { DataSource, Repository } from 'typeorm';

describe('EnrolmentTierService', () => {
  let service: EnrolmentTierService;
  let findOne: ReturnType<typeof vi.fn>;
  let update: ReturnType<typeof vi.fn>;
  let save: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    findOne = vi.fn().mockResolvedValue({
      id: 42,
      pricingTier: null,
      pricingTierIsDefaulted: false,
    });
    update = vi.fn().mockResolvedValue(undefined);
    save = vi.fn().mockImplementation((row: unknown) => Promise.resolve(row));

    const manager = {
      getRepository: vi.fn(() => ({
        update,
        save,
        create: (row: unknown) => row,
      })),
    };

    service = new EnrolmentTierService(
      {
        findOne,
        createQueryBuilder: vi.fn(),
      } as unknown as Repository<Enrolment>,
      { find: vi.fn() } as unknown as Repository<EnrolmentTierChange>,
      {
        transaction: vi.fn((cb: (m: unknown) => unknown) => cb(manager)),
      } as unknown as DataSource,
    );
  });

  it('defaults to tier 1, the cheapest in each category', () => {
    expect(DEFAULT_PRICING_TIER).toBe(1);
  });

  describe('assign', () => {
    it('sets the tier and records the change', async () => {
      const change = await service.assign({
        enrolmentId: 42,
        tier: 2,
        isDefaulted: false,
        effectiveFrom: '2026-09-01',
        changedByUserId: 7,
      });

      expect(update).toHaveBeenCalledWith(
        { id: 42 },
        { pricingTier: 2, pricingTierIsDefaulted: false },
      );
      expect(change).toMatchObject({
        enrolmentId: 42,
        previousTier: null,
        newTier: 2,
        wasDefaulted: false,
        changedByUserId: 7,
      });
    });

    it('marks a migration default so it lands on the review report', async () => {
      const change = await service.assign({
        enrolmentId: 42,
        tier: DEFAULT_PRICING_TIER,
        isDefaulted: true,
        effectiveFrom: '2026-09-01',
        reason: 'September 2026 migration default',
        changedByUserId: 1,
      });

      expect(change).toMatchObject({ newTier: 1, wasDefaulted: true });
      expect(update).toHaveBeenCalledWith(
        { id: 42 },
        { pricingTier: 1, pricingTierIsDefaulted: true },
      );
    });

    it('records the tier it moved from', async () => {
      findOne.mockResolvedValue({
        id: 42,
        pricingTier: 1,
        pricingTierIsDefaulted: true,
      });

      const change = await service.assign({
        enrolmentId: 42,
        tier: 3,
        isDefaulted: false,
        effectiveFrom: '2026-10-01',
        changedByUserId: 7,
      });

      expect(change).toMatchObject({ previousTier: 1, newTier: 3 });
    });

    it.each([0, 4, -1, 1.5])('refuses tier %s', async (tier) => {
      await expect(
        service.assign({
          enrolmentId: 42,
          tier,
          isDefaulted: false,
          effectiveFrom: '2026-09-01',
          changedByUserId: 7,
        }),
      ).rejects.toMatchObject({
        code: PricingResolutionErrorCode.INVALID_INPUT,
      });
      expect(update).not.toHaveBeenCalled();
    });

    it('refuses an enrolment that does not exist', async () => {
      findOne.mockResolvedValue(null);

      await expect(
        service.assign({
          enrolmentId: 999,
          tier: 1,
          isDefaulted: false,
          effectiveFrom: '2026-09-01',
          changedByUserId: 7,
        }),
      ).rejects.toMatchObject({
        code: PricingResolutionErrorCode.INVALID_INPUT,
      });
    });
  });

  describe('change', () => {
    it('clears the defaulted flag when a person picks the same tier', async () => {
      // Confirming a defaulted tier 1 as deliberate is a real action: it takes
      // the enrolment off the location's review report.
      findOne.mockResolvedValue({
        id: 42,
        pricingTier: 1,
        pricingTierIsDefaulted: true,
      });

      await service.change({
        enrolmentId: 42,
        tier: 1,
        effectiveFrom: '2026-09-01',
        changedByUserId: 7,
      });

      expect(update).toHaveBeenCalledWith(
        { id: 42 },
        { pricingTier: 1, pricingTierIsDefaulted: false },
      );
    });

    it('refuses a genuine no-op so the audit trail stays meaningful', async () => {
      findOne.mockResolvedValue({
        id: 42,
        pricingTier: 2,
        pricingTierIsDefaulted: false,
      });

      await expect(
        service.change({
          enrolmentId: 42,
          tier: 2,
          effectiveFrom: '2026-09-01',
          changedByUserId: 7,
        }),
      ).rejects.toMatchObject({
        code: PricingResolutionErrorCode.INVALID_INPUT,
      });
    });

    it('always records a staff change as not defaulted', async () => {
      findOne.mockResolvedValue({
        id: 42,
        pricingTier: 1,
        pricingTierIsDefaulted: true,
      });

      const change = await service.change({
        enrolmentId: 42,
        tier: 3,
        effectiveFrom: '2026-10-01',
        reason: 'moved to a senior teacher',
        changedByUserId: 7,
      });

      expect(change).toMatchObject({
        newTier: 3,
        wasDefaulted: false,
        reason: 'moved to a senior teacher',
      });
    });
  });
});

/**
 * The "why" note, read back for a person.
 *
 * The query is exercised against a real database elsewhere; what is worth
 * pinning here is the reading of a NULL tier, which is ambiguous in the table
 * and decides what staff see.
 */
describe('EnrolmentTierService.findHistoryForDisplay', () => {
  const LOCATION_ID = 1;

  const rawRow = (over: Record<string, unknown> = {}) => ({
    id: 1,
    previousTier: 1,
    newTier: 2,
    wasDefaulted: 0,
    effectiveFrom: '2026-09-01',
    reason: 'Moved to tier 2: parent upgraded to a 45-minute lesson',
    changedOn: '2026-08-27T09:15:00',
    changedByUserId: 7,
    firstName: 'Carmine',
    lastName: 'Di Rauso',
    username: 'carmine',
    ...over,
  });

  const serviceReturning = (rows: Record<string, unknown>[]) => {
    const qb: Record<string, unknown> = {};
    for (const method of [
      'select',
      'addSelect',
      'leftJoin',
      'innerJoin',
      'where',
      'orderBy',
      'addOrderBy',
    ]) {
      qb[method] = vi.fn(() => qb);
    }
    qb.getRawMany = vi.fn().mockResolvedValue(rows);

    return new EnrolmentTierService(
      {} as unknown as Repository<Enrolment>,
      {
        createQueryBuilder: vi.fn(() => qb),
      } as unknown as Repository<EnrolmentTierChange>,
      {} as unknown as DataSource,
    );
  };

  it('carries the note, the dates and the tiers through', async () => {
    const [entry] = await serviceReturning([rawRow()]).findHistoryForDisplay(42, LOCATION_ID);

    expect(entry).toMatchObject({
      previousBasis: 'Tier 1',
      basis: 'Tier 2',
      effectiveFrom: '2026-09-01',
      changedOn: '2026-08-27T09:15:00',
      reason: 'Moved to tier 2: parent upgraded to a 45-minute lesson',
      changedBy: 'Carmine Di Rauso',
      wasDefaulted: false,
    });
  });

  it('calls a NULL newTier the previous rate, not "no tier"', async () => {
    // Moving off tiered pricing is a choice staff make deliberately, and it is
    // the case the column cannot express on its own.
    const [entry] = await serviceReturning([
      rawRow({ newTier: null }),
    ]).findHistoryForDisplay(42, LOCATION_ID);

    expect(entry.basis).toBe('Previous rate');
    expect(entry.newTier).toBeNull();
  });

  it('reads a NULL previousTier by position in the history', async () => {
    // Newest first. On the OLDEST entry a null previous tier means the
    // enrolment had none yet; on any later one it means it was sitting on the
    // previous rate, because that is what the entry before it did to it.
    const entries = await serviceReturning([
      rawRow({ id: 2, previousTier: null, newTier: 3 }),
      rawRow({ id: 1, previousTier: null, newTier: null }),
    ]).findHistoryForDisplay(42, LOCATION_ID);

    expect(entries.map((e) => e.previousBasis)).toEqual([
      'Previous rate',
      'Not set',
    ]);
  });

  it('still names a change whose user profile has gone', async () => {
    // LEFT joins, so the entry survives; it just gets a weaker name. Losing
    // the row entirely would be the worse failure for an audit trail.
    const [byUsername] = await serviceReturning([
      rawRow({ firstName: null, lastName: null }),
    ]).findHistoryForDisplay(42, LOCATION_ID);
    expect(byUsername.changedBy).toBe('carmine');

    const [byId] = await serviceReturning([
      rawRow({ firstName: null, lastName: null, username: null }),
    ]).findHistoryForDisplay(42, LOCATION_ID);
    expect(byId.changedBy).toBe('User 7');
  });

  it('flags an entry nobody chose', async () => {
    const [entry] = await serviceReturning([
      rawRow({ wasDefaulted: 1, reason: null }),
    ]).findHistoryForDisplay(42, LOCATION_ID);

    expect(entry.wasDefaulted).toBe(true);
    expect(entry.reason).toBeNull();
  });
});

describe('EnrolmentTierService.findHistoryForDisplay, location scoping', () => {
  it('constrains the query to the location through the course', async () => {
    // enrolment_tier_change has no location of its own. Without this join any
    // signed-in staff member could read another school's pricing history by
    // putting its enrolment id in the URL.
    const qb: Record<string, unknown> = {};
    const innerJoin = vi.fn(() => qb);
    for (const method of [
      'select',
      'addSelect',
      'leftJoin',
      'where',
      'orderBy',
      'addOrderBy',
    ]) {
      qb[method] = vi.fn(() => qb);
    }
    qb.innerJoin = innerJoin;
    qb.getRawMany = vi.fn().mockResolvedValue([]);

    const service = new EnrolmentTierService(
      {} as unknown as Repository<Enrolment>,
      { createQueryBuilder: vi.fn(() => qb) } as unknown as Repository<EnrolmentTierChange>,
      {} as unknown as DataSource,
    );

    await service.findHistoryForDisplay(42, 9);

    const courseJoin = innerJoin.mock.calls.find((call) => call[0] === 'course');
    expect(courseJoin, 'the course join is what carries the location').toBeDefined();
    expect(courseJoin![2]).toContain('course.locationId = :locationId');
    expect(courseJoin![3]).toEqual({ locationId: 9 });
  });
});
