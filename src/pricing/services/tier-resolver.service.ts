import { Injectable } from '@nestjs/common';
import {
  PricingResolutionError,
  PricingResolutionErrorCode,
} from '../errors/pricing-resolution.error';

/**
 * Where a pricing tier is anchored.
 *
 * The client has not confirmed this. Implementation proceeds on `enrolment`
 * because it is the superset of the three options: storing the tier on the
 * enrolment does not prevent deriving it from the teacher or the program, it
 * only materialises the value where the price is computed. Teacher-anchored and
 * program-anchored are the same model with a default rule attached.
 */
export type TierAnchor = 'enrolment' | 'teacher' | 'program';

/**
 * The active anchor. Changing this constant, and the branch it selects in
 * `resolveTier`, is the entire cost of switching anchors on the read path.
 */
export const ACTIVE_TIER_ANCHOR: TierAnchor = 'enrolment';

/**
 * Everything that could carry a tier. Callers pass whichever they have; the
 * resolver decides which one is authoritative.
 */
export interface TierAnchorSources {
  enrolment?: { pricingTier?: number | null } | null;
  teacher?: { pricingTier?: number | null } | null;
  program?: { pricingTier?: number | null } | null;
}

const VALID_TIERS = [1, 2, 3];

/**
 * The single point that knows where a tier comes from.
 *
 * Nothing in the pricing path may read a `pricingTier` field directly. Every
 * read goes through here, so that when the client answers the anchor question
 * the change is one branch in one method rather than a sweep across the
 * enrolment, lesson, invoice and migration code.
 */
@Injectable()
export class TierResolverService {
  /**
   * Resolve the tier for a price lookup.
   *
   * Fails closed. An enrolment with no tier is a migration or data problem and
   * must surface as one - it must never quietly default to tier 1 here, because
   * tier 1 is the cheapest and a silent default would under-charge. The
   * defaulting rule belongs in the migration, where it is recorded and
   * reportable, not in the read path.
   */
  resolveTier(sources: TierAnchorSources): number {
    const tier = this.readAnchoredTier(sources);

    if (tier === null || tier === undefined) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.UNRESOLVED_TIER,
        `No pricing tier found on the ${ACTIVE_TIER_ANCHOR} for this price lookup`,
        { anchor: ACTIVE_TIER_ANCHOR },
      );
    }

    if (!VALID_TIERS.includes(tier)) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.UNRESOLVED_TIER,
        `Pricing tier ${tier} is not one of 1, 2 or 3`,
        { anchor: ACTIVE_TIER_ANCHOR, tier },
      );
    }

    return tier;
  }

  /** The one branch that changes if the client anchors tiers elsewhere. */
  private readAnchoredTier(
    sources: TierAnchorSources,
  ): number | null | undefined {
    switch (ACTIVE_TIER_ANCHOR) {
      case 'enrolment':
        return sources.enrolment?.pricingTier;
      case 'teacher':
        return sources.teacher?.pricingTier;
      case 'program':
        return sources.program?.pricingTier;
    }
  }
}
