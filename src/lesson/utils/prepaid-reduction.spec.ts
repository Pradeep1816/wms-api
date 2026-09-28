import { describe, expect, it } from 'vitest';
import { prepaidReduction } from './prepaid-reduction';

/**
 * The rule five calculators share: a prepaid amount reduces a lesson, and can
 * never take it below nothing.
 */
describe('prepaidReduction', () => {
  it('takes the full amount off an ordinary lesson', () => {
    // $43.75 gross, nothing else applied, $1.25 prepaid reduction.
    expect(prepaidReduction(1.25, 43.75)).toBe(1.25);
  });

  it('takes nothing off a lesson already discounted to zero', () => {
    // Arcadia, found 2026-08-26. A 100% customer discount leaves exactly
    // $0.00, and the old guard - `remaining < 0 ? 0 : value` - is false at
    // exactly zero, so it deducted anyway and the lesson billed -$1.25.
    expect(prepaidReduction(1.25, 0)).toBe(0);
  });

  it('takes nothing off a lesson already below zero', () => {
    expect(prepaidReduction(1.25, -5)).toBe(0);
  });

  it('reduces to exactly zero rather than past it', () => {
    // A prepaid amount larger than what is left to discount.
    expect(prepaidReduction(10, 4)).toBe(4);
  });

  it('handles the amounts as numbers however they arrive', () => {
    // `lesson_discount.value` comes back from MySQL as a string.
    expect(prepaidReduction('1.25' as unknown as number, 43.75)).toBe(1.25);
    expect(prepaidReduction(1.25, '0' as unknown as number)).toBe(0);
  });

  it('treats a missing amount as nothing rather than NaN', () => {
    expect(prepaidReduction(undefined as unknown as number, 43.75)).toBe(0);
    expect(prepaidReduction(1.25, undefined as unknown as number)).toBe(0);
  });
});
