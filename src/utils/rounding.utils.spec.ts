import { describe, expect, it } from 'vitest';
import { RoundingUtils } from './rounding.utils';

describe('RoundingUtils', () => {
  it('converts lesson durations to exact decimal hours', () => {
    expect(RoundingUtils.durationToHours('00:15:00').toNumber()).toBe(0.25);
    expect(RoundingUtils.durationToHours('01:30:00').toNumber()).toBe(1.5);
  });

  it('rounds decimal values with exact half-up behavior', () => {
    expect(RoundingUtils.roundDecimal('0.145', 2)).toBe(0.15);
    expect(RoundingUtils.roundDecimal('1.725', 2)).toBe(1.73);
    expect(RoundingUtils.roundDecimal('28.75', 2)).toBe(28.75);
  });

  it.each([
    ['mixed allocations', 312.83, '139.4400', '173.3800', 0.01],
    ['binary floating-point boundary', 0.3, '0.1000', '0.2000', 0],
    ['four-decimal payment credit', 1, '0.3333', '0.3333', 0.3334],
  ])(
    'calculates payment balances exactly for %s',
    (_label, amount, invoiceUsed, lessonUsed, expectedBalance) => {
      expect(
        RoundingUtils.calculatePaymentBalance(amount, invoiceUsed, lessonUsed),
      ).toBe(expectedBalance);
    },
  );

  it.each([
    ['lesson balance', '31.2500', '31.2400', 2, 0.01],
    ['invoice balance', '139.4400', '139.4300', 2, 0.01],
    ['four-decimal balance', '1.0000', '0.6666', 4, 0.3334],
  ])(
    'calculates %s without native subtraction',
    (_label, total, applied, precision, expectedBalance) => {
      expect(
        RoundingUtils.calculateBalance(total, applied, precision),
      ).toBe(expectedBalance);
    },
  );

  it('keeps the legacy rounder aliases on the shared decimal implementation', () => {
    expect(RoundingUtils.roundHalfUp(0.145, 2)).toBe(0.15);
    expect(RoundingUtils.roundHalfUp(1.725, 2)).toBe(1.73);
    expect(RoundingUtils.roundHalfUpForLesson(28.75 * 0.06, 2)).toBe(1.73);
    expect(RoundingUtils.roundHalfUpForLesson(0.145, 2)).toBe(0.15);
  });

  it('clamps prepaid reduction to the remaining lesson amount', () => {
    expect(RoundingUtils.prepaidReduction(1.25, 43.75).toNumber()).toBe(1.25);
    expect(RoundingUtils.prepaidReduction(10, 4).toNumber()).toBe(4);
    expect(RoundingUtils.prepaidReduction(1.25, 0).toNumber()).toBe(0);
  });

  it('splits amounts while preserving the original total on the final share', () => {
    expect(RoundingUtils.splitAmountPreservingTotal(30.31, 2)).toEqual([
      15.16, 15.15,
    ]);
    expect(RoundingUtils.splitAmountPreservingTotal(28.75, 4)).toEqual([
      7.19, 7.19, 7.19, 7.18,
    ]);
  });
});
