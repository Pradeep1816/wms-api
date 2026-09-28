import { describe, expect, it } from 'vitest';
import { roundHalfUp } from './helper';

describe('helper roundHalfUp', () => {
  it('uses the shared exact decimal rounding behavior', () => {
    expect(roundHalfUp(0.145, 2)).toBe(0.15);
    expect(roundHalfUp(1.725, 2)).toBe(1.73);
    expect(roundHalfUp(-1.725, 2)).toBe(-1.73);
  });
});
