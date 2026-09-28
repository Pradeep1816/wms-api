import { RoundingUtils } from '../../utils/rounding.utils';

/**
 * How much a prepaid cycle amount actually takes off a lesson.
 *
 * A prepaid row says "this cycle costs the published total", expressed as the
 * dollars to come off each lesson's gross. It is the last discount applied, and
 * it can only ever reduce a price - never take it below nothing.
 *
 * ## The case this exists for
 *
 * Arcadia has 484 courses on a **100% customer discount** - comped students,
 * staff children, scholarship places. On one of those the running total reaches
 * exactly $0.00 before prepaid is considered, and the old guard was
 * `lessonPrice < 0 ? 0 : value`: at exactly zero that is false, so the full
 * prepaid amount came off anyway and the lesson billed **-$1.25**.
 *
 * Found on 2026-08-26 while testing the estate-wide rollout: a Tier 2 quarterly
 * enrolment at Woodbridge billed -$15.00 for the cycle. It was unreachable
 * before only because prepaid needs a tier and tiers were limited to the two
 * pilot schools - which is exactly what that rollout removes.
 *
 * ## Why a shared helper rather than five edits
 *
 * Five calculators apply this rule and have to agree, or a lesson costs one
 * thing when it is created and another when it is billed: the `Lesson` entity,
 * the recurring-payment cron, lesson confirmation, the permanent schedule
 * change, and the schedule transformation. They already agreed on the rule and
 * on the bug. One function means the next correction lands in one place.
 *
 * @param prepaidValue the `lesson_discount` row's dollar value
 * @param remainingPrice gross less every discount applied before prepaid
 * @returns the amount to add to the running discount - never more than what is
 *          left to discount, and never negative
 */
export function prepaidReduction(
  prepaidValue: number,
  remainingPrice: number,
): number {
  return RoundingUtils.prepaidReduction(prepaidValue, remainingPrice).toNumber();
}
