/**
 * Internal pricing tier.
 *
 * IMPORTANT: the tier is internal to Arcadia. It must never reach a customer,
 * a student, or an instructor - not in an API response, a rendered page, an
 * email, a PDF, an invoice, a receipt, a schedule, a Time Voucher, or an
 * Invoiced Lessons document. Front desk and owners only.
 *
 * Rationale recorded on the 2026-08-04 client call: tiers exist so a school can
 * charge more for a more expensive teacher without advertising it. Instructors
 * who could see tiers would negotiate on them; parents who could see them would
 * question the pricing.
 */
export enum PricingTierEnum {
  TIER_1 = 1,
  TIER_2 = 2,
  TIER_3 = 3,
}

/**
 * Prepaid term lengths, in months. Term 1 is ordinary monthly billing.
 *
 * The 3/6/12 amounts are exact approved dollar figures, NOT percentage
 * calculations. The 3%, 5% and 8% figures in the client's correspondence are
 * internal reference only and must never drive a billing calculation or appear
 * on customer-facing output.
 */
export enum PrepaidTermEnum {
  THREE_MONTHS = 3,
  SIX_MONTHS = 6,
  TWELVE_MONTHS = 12,
}
