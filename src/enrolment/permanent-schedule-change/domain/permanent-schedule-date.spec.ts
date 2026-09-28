import { describe, expect, it } from 'vitest';
import {
  endOfPermanentScheduleDay,
  formatPermanentScheduleDate,
  parsePermanentScheduleDate,
  parsePermanentScheduleMonth,
  startOfPermanentScheduleMonth,
} from './permanent-schedule-date';

describe('permanent schedule date parsing', () => {
  it.each([
    '1-2-2026',
    '01-02-2026',
    'Feb 1, 2026',
    'Feb 01, 2026',
    '2026-02-01',
  ])('parses supported date format %s in UTC', (value) => {
    expect(parsePermanentScheduleDate(value).toISOString()).toBe(
      '2026-02-01T00:00:00.000Z',
    );
  });

  it('rejects invalid calendar dates', () => {
    expect(() => parsePermanentScheduleDate('31-02-2026')).toThrow(
      'Invalid date format',
    );
  });

  it.each(['2026-02', '2026-2'])('parses month key %s in UTC', (value) => {
    expect(parsePermanentScheduleMonth(value).toISOString()).toBe(
      '2026-02-01T00:00:00.000Z',
    );
  });

  it('returns the UTC month boundary', () => {
    expect(
      startOfPermanentScheduleMonth(
        new Date('2026-02-18T19:30:00.000Z'),
      ).toISOString(),
    ).toBe('2026-02-01T00:00:00.000Z');
  });

  it('returns the UTC end-of-day boundary', () => {
    expect(
      endOfPermanentScheduleDay(
        new Date('2026-02-18T10:30:00.000Z'),
      ).toISOString(),
    ).toBe('2026-02-18T23:59:59.999Z');
  });

  it('formats a UTC date using the legacy PSC response format', () => {
    expect(
      formatPermanentScheduleDate(new Date('2026-02-18T19:30:00.000Z')),
    ).toBe('Feb 18, 2026');
  });
});
