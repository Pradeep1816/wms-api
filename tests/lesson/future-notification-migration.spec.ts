import { futureNotificationCutoff } from '../../src/shared/helpers/future-notification-cutoff';
import { describe, expect, it, vi } from 'vitest';
import {
  BackfillFutureLessonNotificationStatuses1788800000000,
} from '../../src/migrations/1788800000000-BackfillFutureLessonNotificationStatuses';

describe('SMW-1642 migration cutoff and transaction safeguards', () => {
  it.each([
    ['2026-09-08T16:00:00Z', '2026-09-09 12:00:00'],
    ['2026-01-08T16:00:00Z', '2026-01-09 11:00:00'],
    ['2026-12-31T23:30:00Z', '2027-01-01 18:30:00'],
    // Sender adds a calendar day to Eastern wall time across DST boundaries.
    ['2026-03-07T17:00:00Z', '2026-03-08 12:00:00'],
    ['2026-10-31T16:00:00Z', '2026-11-01 12:00:00'],
  ])('matches the sender lookahead from %s', (now, expected) => {
    expect(futureNotificationCutoff(new Date(now))).toBe(expected);
  });

  it('refuses writes without a transaction', async () => {
    const runner = { isTransactionActive: false, query: vi.fn() };
    await expect(
      new BackfillFutureLessonNotificationStatuses1788800000000().up(
        runner as any,
      ),
    ).rejects.toThrow('requires a migration transaction');
    expect(runner.query).not.toHaveBeenCalled();
  });

  it('preflight issues reads only and returns an explicit exclusive cutoff', async () => {
    const runner = { query: vi.fn(async () => []) };
    const preview =
      await new BackfillFutureLessonNotificationStatuses1788800000000().preview(
        runner as any,
        new Date('2026-09-08T16:00:00Z'),
      );
    expect(preview).toEqual({
      cutoffEasternExclusive: '2026-09-09 12:00:00',
      missingRecords: 0,
      customers: [],
    });
    expect(
      runner.query.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql)),
    ).toBe(true);
  });
});
