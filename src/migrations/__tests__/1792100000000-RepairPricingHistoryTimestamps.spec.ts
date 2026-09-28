import { describe, expect, it } from 'vitest';
import { planHistoryTimestampRepair } from '../../pricing/repairs/pricing-history-timestamp-repair';

const row = (changedOn: string, createdOn: string | null, id = 1) => ({
  id,
  enrolmentId: 42,
  changedOn,
  createdOn,
  effectiveFrom: '2026-09-01',
  reason: 'Keep this reason',
});

describe('SMW-1653 historical timestamp repair planner (UTC session values)', () => {
  it.each([1, 3, 5])(
    'allows the application clock to precede insertion by %s seconds',
    (seconds) => {
      expect(
        planHistoryTimestampRepair([
          row('2026-09-17 20:00:00', `2026-09-17 16:00:0${seconds}`),
        ]).repairs,
      ).toHaveLength(1);
    },
  );
  it('repairs the old summer UTC-as-Eastern write, preserving seconds and source rows', () => {
    const input = row('2026-09-16 01:25:41', '2026-09-15 21:25:40');
    const before = JSON.stringify(input);
    expect(planHistoryTimestampRepair([input]).repairs[0]).toMatchObject({
      id: 1,
      before: input.changedOn,
      after: '2026-09-15 21:25:41',
    });
    expect(JSON.stringify(input)).toBe(before);
  });
  it('uses five hours in winter rather than a hard-coded four hours', () => {
    expect(
      planHistoryTimestampRepair([
        row('2026-01-17 22:02:00', '2026-01-17 17:02:00'),
      ]).repairs[0].after,
    ).toBe('2026-01-17 17:02:00');
  });
  it('handles a UTC date crossing and February leap day', () => {
    expect(
      planHistoryTimestampRepair([
        row('2028-03-01 03:00:00', '2028-02-29 22:00:00'),
      ]).repairs[0].after,
    ).toBe('2028-02-29 22:00:00');
  });
  it('leaves newer correct entries alone and is idempotent after correction', () => {
    const input = row('2026-09-16 01:25:41', '2026-09-15 21:25:40');
    const repaired = planHistoryTimestampRepair([input]).repairs[0];
    const result = planHistoryTimestampRepair([
      { ...input, changedOn: repaired.after },
    ]);
    expect(result).toEqual({ repairs: [], unchanged: 1, ambiguous: [] });
  });
  it('does not depend on production IDs, counts or deployment date', () => {
    const result = planHistoryTimestampRepair([
      row('2026-09-25 20:00:01', '2026-09-25 16:00:00', 99001),
      row('2026-09-25 16:00:01', '2026-09-25 16:00:00', 99002),
    ]);
    expect(result.repairs.map((r) => r.id)).toEqual([99001]);
    expect(result.unchanged).toBe(1);
  });
  it.each([
    ['missing creation timestamp', '2026-09-17 20:00:00', null],
    [
      'unrelated one-hour difference',
      '2026-09-17 20:00:00',
      '2026-09-17 19:00:00',
    ],
    ['wrong seasonal offset', '2026-09-17 20:00:00', '2026-09-17 15:00:00'],
    [
      'correction predates creation beyond tolerance',
      '2026-09-17 20:00:00',
      '2026-09-17 16:00:06',
    ],
    [
      'outside five-second tolerance',
      '2026-09-17 20:00:06',
      '2026-09-17 16:00:00',
    ],
    ['invalid timestamp', 'invalid', '2026-09-17 16:00:00'],
  ])('reports %s without guessing', (_name, changedOn, createdOn) => {
    expect(planHistoryTimestampRepair([row(changedOn, createdOn)])).toEqual({
      repairs: [],
      unchanged: 0,
      ambiguous: [1],
    });
  });
  it('accepts empty environments', () => {
    expect(planHistoryTimestampRepair([])).toEqual({
      repairs: [],
      unchanged: 0,
      ambiguous: [],
    });
  });
});
