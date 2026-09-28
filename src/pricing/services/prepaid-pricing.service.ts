import { Injectable } from '@nestjs/common';
import {
  APPROVED_PREPAID_TERMS,
  PricingResolverService,
} from './pricing-resolver.service';
import { PricingCategoryEnum } from '../enums/pricing-category.enum';
import { multiplyAmount, subtractAmounts } from '../utils/decimal-money';

// APPROVED_PREPAID_TERMS is imported rather than restated. The resolver already
// owns it - it is what decides whether to read a published total or multiply the
// monthly figure - and a second copy here could drift out of step with the very
// branch it is meant to describe.

export interface PrepaidPricingInput {
  locationId: number | null;
  pricingCategory: PricingCategoryEnum;
  pricingTier: number;
  durationMinutes: number;
  /** Months in the billing cycle - `payment_frequency.frequencyLength`. */
  frequencyLength: number;
  /** `YYYY-MM-DD`. */
  effectiveDate: string;
  programType?: number;
  priceBook?: string;
}

export interface PrepaidPricing {
  termMonths: number;
  /** Monthly amount times the term, before any prepaid reduction. */
  standardTermAmount: string;
  /** What the customer actually pays for the cycle. */
  payableTermAmount: string;
  /**
   * The reduction for the whole cycle, as a **dollar** amount.
   *
   * Dollars rather than a percentage because the published totals are not
   * percentages of anything - see the class note.
   */
  cycleDiscountAmount: string;
  /** True when the amount came from a term Arcadia priced explicitly. */
  isApprovedTerm: boolean;
  monthlyAmount: string;
}

/**
 * What a prepaid billing cycle costs, and the reduction that produces it.
 *
 * ## Why this cannot be a percentage
 *
 * The system currently bills prepaid through an `enrolment_discount` of
 * `TYPE_PAYMENT_FREQUENCY` holding a **percentage**, which the cascade turns
 * into per-lesson discounts. That cannot produce Arcadia's published totals,
 * because they are not percentages of anything - they were rounded to whole
 * dollars. Eight of the nine standard 30-minute values disagree:
 *
 * ```
 *   tier 2, 3 months   published 510.00   3% of 525.00 gives 509.25
 *   tier 1, 12 months  published 1601.00  8% of 1740.00 gives 1600.80
 * ```
 *
 * Seventy-five cents on one cycle is not the problem; being wrong on every
 * prepaid enrolment forever is. So the reduction is computed **backwards from
 * the published total** - standard minus payable - and expressed in dollars,
 * which can represent any total exactly.
 *
 * This is the third time Arcadia's rate card has turned out to be a set of
 * published figures rather than a formula. The legacy sheet was the first and
 * grandfathering the second. Anything that computes a tuition amount from a
 * rule rather than reading it should be treated as suspect.
 *
 * ## Terms nobody priced
 *
 * Arcadia priced 3, 6 and 12 months. A customer on a 5-month cycle pays
 * monthly times five with **no** reduction, which the client confirmed as C10.
 * `isApprovedTerm` says which happened, so a report can tell a priced term from
 * a multiplied one.
 */
@Injectable()
export class PrepaidPricingService {
  constructor(private readonly pricingResolver: PricingResolverService) {}

  /**
   * **This one throws.** Every other pricing path on this branch falls back to
   * existing behaviour when the catalogue cannot answer - an unclassified
   * program, an unpriced duration - because each of those sits directly in
   * front of a user action that must not be blocked.
   *
   * This is a pure calculation with no user in front of it, so the decision of
   * what to do when there is no price belongs to whoever wires it, not here.
   * Swallowing it would mean returning a cycle amount that is quietly wrong,
   * which is the failure this whole service exists to prevent.
   *
   * Whoever wires this: gate on the tier and the classification first, the way
   * `resolveCatalogueRate` does in `student-enrolment.service`, and treat a
   * throw as "keep today's behaviour".
   */
  async resolve(input: PrepaidPricingInput): Promise<PrepaidPricing> {
    const termMonths = Math.max(1, Math.round(input.frequencyLength));

    const resolved = await this.pricingResolver.resolve({
      locationId: input.locationId,
      pricingCategory: input.pricingCategory,
      pricingTier: input.pricingTier,
      durationMinutes: input.durationMinutes,
      termMonths,
      effectiveDate: input.effectiveDate,
      programType: input.programType,
      priceBook: input.priceBook,
    });

    const standardTermAmount = multiplyAmount(
      resolved.monthlyAmount,
      termMonths,
    );

    return {
      termMonths,
      standardTermAmount,
      payableTermAmount: resolved.termAmount,
      // Backwards from the published total, never a percentage of it.
      cycleDiscountAmount: subtractAmounts(
        standardTermAmount,
        resolved.termAmount,
      ),
      isApprovedTerm: APPROVED_PREPAID_TERMS.includes(termMonths),
      monthlyAmount: resolved.monthlyAmount,
    };
  }
}
