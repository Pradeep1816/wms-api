import { RoundingUtils } from '../../utils/rounding.utils';

/**
 * Integer-cent money helpers for the pricing path.
 *
 * Authoritative tuition amounts must never pass through a JavaScript float.
 * `0.1 + 0.2` is the familiar example, but the case that matters here is
 * multiplication: a monthly amount multiplied by a term length must land on an
 * exact cent every time, because the result is billed.
 *
 * The repository has no decimal library and no shared money utility - other
 * code uses `toFixed(2)` on floats. Rather than add a dependency, this module
 * keeps every intermediate value as an integer number of cents. Amounts in this
 * domain are small (the largest approved figure is $4,858.00), so cent counts
 * stay far inside the safe-integer range.
 */

/** Matches a plain decimal amount with exactly two fractional digits. */
const AMOUNT_PATTERN = /^-?\d+\.\d{2}$/;

export class MoneyFormatError extends Error {
  constructor(value: string) {
    super(
      `Amount "${value}" is not a decimal string with exactly two decimal places`,
    );
    this.name = 'MoneyFormatError';
  }
}

/**
 * Parse a decimal string such as `'510.00'` into an integer number of cents.
 *
 * Deliberately strict: it rejects anything that is not already normalised to
 * two decimal places, so a malformed catalogue value fails loudly here rather
 * than silently becoming a wrong price further downstream.
 */
export function toCents(amount: string): number {
  if (typeof amount !== 'string' || !AMOUNT_PATTERN.test(amount)) {
    throw new MoneyFormatError(String(amount));
  }

  const negative = amount.startsWith('-');
  const unsigned = negative ? amount.slice(1) : amount;
  const [whole, fraction] = unsigned.split('.');
  const cents = Number(whole) * 100 + Number(fraction);

  if (!Number.isSafeInteger(cents)) {
    throw new MoneyFormatError(amount);
  }

  return negative ? -cents : cents;
}

/** Format an integer number of cents back into a two-decimal string. */
export function fromCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new MoneyFormatError(String(cents));
  }

  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / 100);
  const fraction = absolute % 100;

  return `${negative ? '-' : ''}${whole}.${String(fraction).padStart(2, '0')}`;
}

/**
 * Multiply an amount by a whole number of periods.
 *
 * Used for payment frequencies the approved schedule does not price - see the
 * bi-monthly, four-month and five-month cases. Those are charged as the monthly
 * amount times the term with no prepaid reduction, because the client defined
 * reductions for the three, six and twelve month terms only.
 */
export function multiplyAmount(amount: string, multiplier: number): string {
  if (!Number.isSafeInteger(multiplier) || multiplier < 0) {
    throw new MoneyFormatError(
      `multiplier ${String(multiplier)} must be a non-negative integer`,
    );
  }

  return fromCents(toCents(amount) * multiplier);
}

/** Normalise a value that may arrive from the driver as a string or number. */
export function normaliseAmount(value: string | number): string {
  if (typeof value === 'string') {
    return AMOUNT_PATTERN.test(value)
      ? value
      : fromCents(Math.round(RoundingUtils.roundDecimal(Number(value), 2) * 100));
  }

  return fromCents(Math.round(RoundingUtils.roundDecimal(value, 2) * 100));
}

/**
 * `a - b`, exact.
 *
 * Both sides go through cents, so subtracting two published amounts cannot
 * produce 14.999999999999998 - which matters because the result is a figure
 * that gets billed, not merely displayed.
 */
export function subtractAmounts(a: string, b: string): string {
  return fromCents(toCents(normaliseAmount(a)) - toCents(normaliseAmount(b)));
}
