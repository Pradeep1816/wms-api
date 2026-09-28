import { describe, expect, it } from 'vitest';
import { September2026FortyFiveMinuteTermPrices1787700000000 } from '../1787700000000-September2026FortyFiveMinuteTermPrices';
import { SEPTEMBER_2026_TUITION } from '../../pricing/constants/september-2026-tuition';

/**
 * Does the migration still describe a real change?
 *
 * Same reasoning as the 2026-08-27 one: it carries its own copy of the figures
 * it replaces, because `down` has to restore values the constant no longer
 * holds. Duplicated state rots, so this checks the two halves against each
 * other.
 */
const previous = (
  September2026FortyFiveMinuteTermPrices1787700000000 as unknown as {
    PREVIOUS: Record<string, Record<number, string>>;
  }
).PREVIOUS;

const fixture = (key: string) => {
  const [category, duration, tier] = key.split('-');
  const found = SEPTEMBER_2026_TUITION.find(
    (p) =>
      p.category === category &&
      p.durationMinutes === Number(duration) &&
      p.tier === Number(tier),
  );
  expect(found, `${key} is not a row in the matrix`).toBeDefined();
  return found!;
};

describe('September2026FortyFiveMinuteTermPrices', () => {
  it('touches only the three Standard 45-minute rows', () => {
    expect(Object.keys(previous).sort()).toEqual([
      'standard-45-1',
      'standard-45-2',
      'standard-45-3',
    ]);
  });

  it('moves every term of those rows, and only the terms', () => {
    for (const key of Object.keys(previous)) {
      expect(Object.keys(previous[key]).map(Number).sort((a, b) => a - b)).toEqual([
        3, 6, 12,
      ]);
    }
  });

  it.each(Object.keys(previous))('%s moves every term upward', (key) => {
    const now = fixture(key);
    for (const term of [3, 6, 12]) {
      const was = previous[key][term];

      // A rollback target equal to the current value is not a rollback.
      expect(now.prepaid[term]).not.toBe(was);

      // Re-deriving from a higher month can only raise a term, never lower it.
      expect(Number(now.prepaid[term])).toBeGreaterThan(Number(was));
    }
  });

  it('leaves the monthly amounts and hourly rates alone', () => {
    // This migration writes to tuition_prepaid_price only. The months and rates
    // were settled by ReviseSeptember2026RateSheet and must not move again.
    expect(fixture('standard-45-1').monthlyAmount).toBe('218.00');
    expect(fixture('standard-45-2').monthlyAmount).toBe('263.00');
    expect(fixture('standard-45-3').monthlyAmount).toBe('308.00');
    expect(fixture('standard-45-1').hourlyRate).toBe('72.67');
  });

  it('leaves every other row in the matrix untouched', () => {
    const changed = new Set(Object.keys(previous));
    expect(changed.size).toBe(3);
    expect(SEPTEMBER_2026_TUITION).toHaveLength(18);
    // 15 rows unchanged, and the three that move are all Standard 45-minute.
    for (const key of changed) {
      expect(key.startsWith('standard-45-')).toBe(true);
    }
  });
});
