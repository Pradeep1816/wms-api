import { describe, expect, it } from 'vitest';
import { parsePermanentScheduleSlot } from './permanent-schedule-slot';

describe('parsePermanentScheduleSlot', () => {
  it.each([
    ['Monday 04:00 PM', { day: 1, fromTime: '16:00:00' }],
    ['Sunday 12:15 AM', { day: 7, fromTime: '00:15:00' }],
    ['Saturday 12:30 PM', { day: 6, fromTime: '12:30:00' }],
    ['Tuesday 9:05 am', { day: 2, fromTime: '09:05:00' }],
  ])('parses %s', (value, expected) => {
    expect(parsePermanentScheduleSlot(value)).toEqual(expected);
  });

  it.each([
    'Funday 04:00 PM',
    'Monday 00:00 AM',
    'Monday 13:00 PM',
    'Monday 04:60 PM',
    'Monday 04:00 PM trailing',
  ])('rejects %s', (value) => {
    expect(() => parsePermanentScheduleSlot(value)).toThrow(
      'Invalid dayTime format',
    );
  });
});
