import { beforeEach, describe, expect, it } from 'vitest';
import {
  TierResolverService,
  ACTIVE_TIER_ANCHOR,
} from './tier-resolver.service';
import { PricingResolutionErrorCode } from '../errors/pricing-resolution.error';

describe('TierResolverService', () => {
  let service: TierResolverService;

  beforeEach(() => {
    service = new TierResolverService();
  });

  it('is currently anchored on the enrolment', () => {
    // Guards the decision recorded on 2026-08-10. If the client answers the
    // anchor question, this constant and the branch it selects are the change.
    expect(ACTIVE_TIER_ANCHOR).toBe('enrolment');
  });

  it('reads the tier from the anchored source', () => {
    expect(service.resolveTier({ enrolment: { pricingTier: 2 } })).toBe(2);
  });

  it('ignores tiers on sources that are not the active anchor', () => {
    // A teacher or program tier must not leak into pricing while the anchor is
    // the enrolment, otherwise switching anchors later would silently change
    // prices for enrolments that carry both.
    expect(() =>
      service.resolveTier({
        enrolment: { pricingTier: null },
        teacher: { pricingTier: 3 },
        program: { pricingTier: 3 },
      }),
    ).toThrowError(
      expect.objectContaining({
        code: PricingResolutionErrorCode.UNRESOLVED_TIER,
      }),
    );
  });

  describe('fails closed rather than defaulting', () => {
    // Tier 1 is the cheapest price in each category, so a silent default here
    // would under-charge and nothing would surface it. Defaulting belongs in
    // the migration, where it is recorded and reportable.
    it.each([
      ['a missing enrolment', {}],
      ['a null enrolment', { enrolment: null }],
      ['a null tier', { enrolment: { pricingTier: null } }],
      ['an undefined tier', { enrolment: {} }],
    ])('refuses %s', (_label, sources) => {
      expect(() => service.resolveTier(sources)).toThrowError(
        expect.objectContaining({
          code: PricingResolutionErrorCode.UNRESOLVED_TIER,
        }),
      );
    });

    it.each([0, 4, -1, 1.5])('refuses tier %s as out of range', (tier) => {
      expect(() =>
        service.resolveTier({ enrolment: { pricingTier: tier } }),
      ).toThrowError(
        expect.objectContaining({
          code: PricingResolutionErrorCode.UNRESOLVED_TIER,
        }),
      );
    });
  });

  it.each([1, 2, 3])('accepts tier %i', (tier) => {
    expect(service.resolveTier({ enrolment: { pricingTier: tier } })).toBe(
      tier,
    );
  });
});
