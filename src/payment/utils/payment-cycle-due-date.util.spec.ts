import { describe, expect, it } from 'vitest';
import { calculatePaymentCycleDueDate } from './payment-cycle-due-date.util';

const asUtcDateKey = (date: Date): string => date.toISOString().slice(0, 10);

describe('calculatePaymentCycleDueDate', () => {
  it.each([
    ['2026-09-01', '2026-08-15'],
    ['2026-10-01', '2026-09-15'],
    ['2026-11-01', '2026-10-15'],
    ['2027-01-01', '2026-12-15'],
  ])('makes cycle %s due on %s', (cycleStartDate, expectedDueDate) => {
    expect(asUtcDateKey(calculatePaymentCycleDueDate(cycleStartDate))).toBe(
      expectedDueDate,
    );
  });

  it('ignores the time component of a Date value', () => {
    const cycleStartDate = new Date('2026-11-01T23:45:00.000Z');

    expect(asUtcDateKey(calculatePaymentCycleDueDate(cycleStartDate))).toBe(
      '2026-10-15',
    );
  });

  it('does not let an earlier moved occurrence pull a later cycle due date forward', () => {
    expect(
      asUtcDateKey(
        calculatePaymentCycleDueDate('2026-11-01', [
          '2026-09-03T19:00:00.000Z',
          '2026-11-12T19:00:00.000Z',
        ]),
      ),
    ).toBe('2026-10-15');
  });

  it('delays the due date when the earliest billing occurrence starts after the cycle', () => {
    expect(
      asUtcDateKey(
        calculatePaymentCycleDueDate('2026-08-01', [
          '2026-09-03T19:00:00.000Z',
          '2026-09-10T19:00:00.000Z',
        ]),
      ),
    ).toBe('2026-08-15');
  });

  it('uses the earliest linked occurrence rather than the latest occurrence', () => {
    expect(
      asUtcDateKey(
        calculatePaymentCycleDueDate('2026-08-01', [
          '2026-09-03T19:00:00.000Z',
          '2026-10-01T19:00:00.000Z',
        ]),
      ),
    ).toBe('2026-08-15');
  });

  it('rejects an invalid cycle start date', () => {
    expect(() => calculatePaymentCycleDueDate('not-a-date')).toThrow(
      'Invalid payment-cycle start date: not-a-date',
    );
  });
});
