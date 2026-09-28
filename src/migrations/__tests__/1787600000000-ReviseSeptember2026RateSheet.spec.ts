import { describe, expect, it } from 'vitest';
import { ReviseSeptember2026RateSheet1787600000000 } from '../1787600000000-ReviseSeptember2026RateSheet';
import { SEPTEMBER_2026_TUITION } from '../../pricing/constants/september-2026-tuition';

/**
 * Does the migration still describe a real change?
 *
 * It carries its own copy of the four values it replaces, because `down` has to
 * restore figures the constant no longer holds. That copy is duplicated state,
 * and duplicated state rots: someone edits the constant, the migration keeps
 * rolling back to a number nobody uses, and nothing fails.
 *
 * So this checks the two halves against each other. It cannot tell you the old
 * figures were right - the production dump did that, on 2026-08-27 - but it
 * fails the moment they stop describing an actual difference.
 */
const previous = (
  ReviseSeptember2026RateSheet1787600000000 as unknown as {
    PREVIOUS: {
      monthly: Record<string, { monthlyAmount: string; hourlyRate: string }>;
      prepaid: Record<string, Record<number, string>>;
    };
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

describe('ReviseSeptember2026RateSheet', () => {
  it('revises exactly the four values Arcadia changed', () => {
    expect(Object.keys(previous.monthly)).toEqual([
      'standard-45-1',
      'standard-45-2',
      'standard-45-3',
    ]);
    expect(Object.keys(previous.prepaid)).toEqual(['standard-30-3']);
    expect(Object.keys(previous.prepaid['standard-30-3'])).toEqual(['12']);
  });

  it.each(Object.keys(previous.monthly))(
    '%s moves to a whole-dollar month on a rate that reproduces it',
    (key) => {
      const now = fixture(key);
      const was = previous.monthly[key];

      // A rollback target that equals the current value is not a rollback.
      expect(now.monthlyAmount).not.toBe(was.monthlyAmount);
      expect(now.hourlyRate).not.toBe(was.hourlyRate);

      // The point of the change: whole dollars, up from a half-dollar month.
      expect(now.monthlyAmount).toMatch(/\.00$/);
      expect(was.monthlyAmount).toMatch(/\.50$/);

      // And the rate has to follow the month, or a 45-minute lesson bills
      // below monthlyAmount / 4 and prepaid refuses to apply to the cycle.
      expect(Number(now.hourlyRate)).toBeGreaterThan(Number(was.hourlyRate));
    },
  );

  it('corrects the one stale prepaid cell upward by a dollar', () => {
    const now = fixture('standard-30-3');
    const was = previous.prepaid['standard-30-3'][12];

    expect(was).toBe('2263.00');
    expect(now.prepaid[12]).toBe('2264.00');
    expect(Number(now.prepaid[12]) - Number(was)).toBe(1);
  });

  it('leaves every other value in the matrix alone', () => {
    // 18 rows, of which 3 change a month and 1 changes a prepaid amount.
    const changed = new Set([
      ...Object.keys(previous.monthly),
      ...Object.keys(previous.prepaid),
    ]);
    expect(changed.size).toBe(4);
    expect(SEPTEMBER_2026_TUITION).toHaveLength(18);
  });
});
