/**
 * Reasons the pricing resolver refuses to return a price.
 *
 * The resolver fails closed. It never guesses, never picks the first of several
 * candidate rows, and never falls back to a legacy rate column. A caller that
 * cannot get a price must surface that to a human rather than bill something
 * plausible.
 */
export enum PricingResolutionErrorCode {
  /** No catalogue row covers this combination on this date. */
  NO_MATCHING_PRICE = 'NO_MATCHING_PRICE',

  /** More than one row matched at the same scope - the catalogue is ambiguous. */
  AMBIGUOUS_PRICE = 'AMBIGUOUS_PRICE',

  /** A 3, 6 or 12 month term was requested but no approved total exists. */
  MISSING_PREPAID_PRICE = 'MISSING_PREPAID_PRICE',

  /** Group programs are outside the September 2026 structure. */
  UNSUPPORTED_PROGRAM_TYPE = 'UNSUPPORTED_PROGRAM_TYPE',

  /** The tier could not be established for this enrolment. */
  UNRESOLVED_TIER = 'UNRESOLVED_TIER',

  /** Input failed validation before any lookup was attempted. */
  INVALID_INPUT = 'INVALID_INPUT',
}

export class PricingResolutionError extends Error {
  constructor(
    readonly code: PricingResolutionErrorCode,
    message: string,
    readonly context: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'PricingResolutionError';
  }
}
