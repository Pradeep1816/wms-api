import { describe, expect, it } from 'vitest';
import {
  toCents,
  fromCents,
  multiplyAmount,
  normaliseAmount,
  MoneyFormatError,
} from './decimal-money';

describe('decimal money', () => {
  it('round-trips every approved amount without loss', () => {
    const approved = [
      '145.00',
      '217.50',
      '262.50',
      '307.50',
      '4858.00',
      '0.01',
    ];
    for (const amount of approved) {
      expect(fromCents(toCents(amount))).toBe(amount);
    }
  });

  it('rejects anything not normalised to two decimal places', () => {
    for (const bad of ['145', '145.0', '145.000', '', 'abc', '1,45.00']) {
      expect(() => toCents(bad)).toThrow(MoneyFormatError);
    }
  });

  describe('multiplication stays exact where floats do not', () => {
    it('multiplies a half-dollar monthly amount without drift', () => {
      // 217.50 * 3 is 652.5 in float arithmetic and prints as 652.50 by luck,
      // but the integer path is exact by construction rather than by luck.
      expect(multiplyAmount('217.50', 3)).toBe('652.50');
      expect(multiplyAmount('217.50', 6)).toBe('1305.00');
      expect(multiplyAmount('217.50', 12)).toBe('2610.00');
    });

    it('handles the amounts that actually break naive float maths', () => {
      // 0.07 * 3 is 0.21000000000000002 as a float.
      expect(multiplyAmount('0.07', 3)).toBe('0.21');
      // 1.10 * 3 is 3.3000000000000003 as a float.
      expect(multiplyAmount('1.10', 3)).toBe('3.30');
      // 262.50 * 5 - the five-month frequency that exists in live data.
      expect(multiplyAmount('262.50', 5)).toBe('1312.50');
    });

    it('multiplies by zero and one', () => {
      expect(multiplyAmount('145.00', 0)).toBe('0.00');
      expect(multiplyAmount('145.00', 1)).toBe('145.00');
    });

    it('rejects a fractional or negative multiplier', () => {
      expect(() => multiplyAmount('145.00', 1.5)).toThrow(MoneyFormatError);
      expect(() => multiplyAmount('145.00', -1)).toThrow(MoneyFormatError);
    });
  });

  it('normalises values arriving from the driver as numbers or strings', () => {
    expect(normaliseAmount('510.00')).toBe('510.00');
    expect(normaliseAmount(510)).toBe('510.00');
    expect(normaliseAmount(217.5)).toBe('217.50');
    expect(normaliseAmount('217.5000')).toBe('217.50');
  });
});
