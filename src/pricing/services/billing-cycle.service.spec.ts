import { describe, expect, it, vi } from 'vitest';
import {
  BillingCycleService,
  effectiveDateForCycle,
} from './billing-cycle.service';

const CUTOVER = '2026-09-01';

describe('effectiveDateForCycle', () => {
  it('defers to the day after a cycle that straddles the cutover', () => {
    // C6 and C15: the cycle keeps its current rate to the end.
    expect(
      effectiveDateForCycle(
        { startDate: '2026-08-01', endDate: '2026-10-31' },
        CUTOVER,
      ),
    ).toBe('2026-11-01');
  });

  it('starts on the cutover when the cycle begins on it', () => {
    // 2,120 monthly enrolments have exactly this shape, so the overwhelming
    // majority are not deferred at all.
    expect(
      effectiveDateForCycle(
        { startDate: '2026-09-01', endDate: '2026-09-30' },
        CUTOVER,
      ),
    ).toBe(CUTOVER);
  });

  it('starts on the cutover when the cycle begins after it', () => {
    expect(
      effectiveDateForCycle(
        { startDate: '2026-10-01', endDate: '2026-10-31' },
        CUTOVER,
      ),
    ).toBe(CUTOVER);
  });

  it('starts on the cutover when a cycle has already finished', () => {
    expect(
      effectiveDateForCycle(
        { startDate: '2026-06-01', endDate: '2026-08-31' },
        CUTOVER,
      ),
    ).toBe(CUTOVER);
  });

  it('starts on the cutover when there is no cycle at all', () => {
    // 233 live enrolments, mostly monthly plans whose next cycle does not exist.
    expect(effectiveDateForCycle(null, CUTOVER)).toBe(CUTOVER);
  });

  it('handles a cycle ending on the cutover itself', () => {
    // Ends 1 September, so 1 September is still the old cycle's last day.
    expect(
      effectiveDateForCycle(
        { startDate: '2026-08-01', endDate: '2026-09-01' },
        CUTOVER,
      ),
    ).toBe('2026-09-02');
  });

  it('crosses a month end, a year end and a leap-year February correctly', () => {
    expect(
      effectiveDateForCycle(
        { startDate: '2026-08-01', endDate: '2026-12-31' },
        CUTOVER,
      ),
    ).toBe('2027-01-01');
    expect(
      effectiveDateForCycle(
        { startDate: '2026-08-01', endDate: '2027-02-28' },
        CUTOVER,
      ),
    ).toBe('2027-03-01');
    expect(
      effectiveDateForCycle(
        { startDate: '2023-12-01', endDate: '2024-02-29' },
        '2024-01-01',
      ),
    ).toBe('2024-03-01');
  });

  it('defers an annual cycle by the full eleven months', () => {
    // Three real enrolments look like this. Correct, and worth Arcadia knowing.
    expect(
      effectiveDateForCycle(
        { startDate: '2026-08-01', endDate: '2027-07-31' },
        CUTOVER,
      ),
    ).toBe('2027-08-01');
  });
});

describe('BillingCycleService', () => {
  function serviceWith(
    rows: Array<{ enrolmentId: number; startDate: string; endDate: string }>,
  ) {
    const query = vi.fn().mockResolvedValue(rows);
    return {
      service: new BillingCycleService({ query } as never),
      query,
    };
  }

  it('defaults every enrolment to the cutover, then defers the ones that straddle', async () => {
    const { service } = serviceWith([
      { enrolmentId: 2, startDate: '2026-06-01', endDate: '2026-11-30' },
    ]);

    const dates = await service.resolveEffectiveDates([1, 2, 3]);

    expect(dates.get(1)).toBe(CUTOVER);
    expect(dates.get(2)).toBe('2026-12-01');
    expect(dates.get(3)).toBe(CUTOVER);
  });

  it('asks the database nothing when given no enrolments', async () => {
    const { service, query } = serviceWith([]);

    expect((await service.resolveEffectiveDates([])).size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('coerces the enrolment id, which the driver returns as a string', async () => {
    // The same coercion trap that held all 3,417 enrolments in the dry run.
    const { service } = serviceWith([
      {
        enrolmentId: '2' as unknown as number,
        startDate: '2026-06-01',
        endDate: '2026-11-30',
      },
    ]);

    const dates = await service.resolveEffectiveDates([2]);

    expect(dates.get(2)).toBe('2026-12-01');
  });
});
