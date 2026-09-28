import { describe, expect, it } from 'vitest';
import { PermanentScheduleChangeConfirmationValidator } from './permanent-schedule-change-confirmation.validator';

describe('PermanentScheduleChangeConfirmationValidator', () => {
  const validator = new PermanentScheduleChangeConfirmationValidator();

  it('parses each confirmation date format supported by PSC', () => {
    expect(validator.parseRescheduleDate('01-02-2026')).toEqual(
      new Date('2026-02-01T00:00:00.000Z'),
    );
    expect(validator.parseRescheduleDate('Feb 1, 2026')).toEqual(
      new Date('2026-02-01T00:00:00.000Z'),
    );
  });

  it('preserves the confirmation date error contract', () => {
    expect(() => validator.parseRescheduleDate('invalid')).toThrow(
      'Invalid date format: invalid. Expected "d-m-Y" (e.g., "01-02-2026") or "MMM D, Y" (e.g., "Feb 1, 2026")',
    );
  });

  it('requires a replacement for every selected old lesson', () => {
    expect(() =>
      validator.validateReplacementLessonCount(44, 2, 2),
    ).not.toThrow();
    expect(() => validator.validateReplacementLessonCount(44, 2, 1)).toThrow(
      'PSC reschedule lesson count mismatch for course 44: expected 2 old lessons but found 1 replacement lessons.',
    );
  });
});
