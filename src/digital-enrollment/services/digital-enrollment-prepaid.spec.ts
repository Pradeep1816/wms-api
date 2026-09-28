import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DigitalEnrollmentSubmissionService } from './digital-enrollment-submission.service';
import { SEPTEMBER_2026_TUITION } from '../../pricing/constants/september-2026-tuition';

/**
 * A digital enrolment keeps the payment preference the parent submitted.
 *
 * It did not always. Until prepaid cycle pricing landed, a prepaid preference on
 * a tierable program was forced to **Monthly**, because the 3/6/10 per cent
 * reductions this service applies cannot reproduce the September sheet and
 * always under-charge. The published total is now billed at confirmation and
 * supersedes the percentage wherever it applies, so discarding the preference
 * would throw away something the parent actually asked for and gain nothing.
 *
 * The percentages stay as the fallback for what prepaid does not cover. The last
 * block below is why they can never be the whole answer, asserted against the
 * real fixture rather than described in a comment.
 */
describe('digital enrolment, prepaid preferences', () => {
  let service: DigitalEnrollmentSubmissionService;

  /**
   * Only what this path touches.
   *
   * Built through `Object.create` rather than the constructor: the service takes
   * seventeen parameters and positional nulls would break the moment one is
   * added or reordered, which is a spec failing for a reason that has nothing to
   * do with what it tests.
   */
  beforeEach(() => {
    service = Object.assign(
      Object.create(
        DigitalEnrollmentSubmissionService.prototype,
      ) as DigitalEnrollmentSubmissionService,
      { logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() } },
    );
  });

  const resolve = (preference: string) =>
    (
      service as unknown as {
        resolvePaymentPlan: (pref: string) => {
          frequency: string;
          discount: number;
        };
      }
    ).resolvePaymentPlan(preference);

  describe('the preference is honoured as submitted', () => {
    it.each([
      ['monthly', 'Monthly', 0],
      ['three-month', 'Quarterly', 3],
      ['six-month', 'Semi-Annually', 6],
      ['twelve-month', 'Annually', 10],
    ])('%s becomes %s', (preference, frequency, discount) => {
      expect(resolve(preference)).toEqual({ frequency, discount });
    });

    it('falls back to Monthly for a preference it does not recognise', () => {
      expect(resolve('every-other-tuesday')).toEqual({
        frequency: 'Monthly',
        discount: 0,
      });
    });
  });

  /**
   * `createEnrolment` resolves the frequency by NAME against `payment_frequency`
   * and throws on anything it cannot find, so a typo here is not a cosmetic bug
   * - it fails the whole submission.
   */
  describe('every frequency name is a real payment_frequency row', () => {
    // The twelve rows of the table, by name. `id`, `frequencyLength` and the
    // number of months are the same number in every one of them.
    const REAL_NAMES = [
      'Monthly',
      'Bi-Monthly',
      'Quarterly',
      'Every 4 Months',
      'Every 5 Months',
      'Semi-Annually',
      'Every 7 Months',
      'Every 8 Months',
      'Every 9 Months',
      'Every 10 Months',
      'Every 11 Months',
      'Annually',
    ];

    it.each([['monthly'], ['three-month'], ['six-month'], ['twelve-month']])(
      '%s resolves to a name the database has',
      (preference) => {
        expect(REAL_NAMES).toContain(resolve(preference).frequency);
      },
    );

    // The specific one that was wrong. Six months was `Every 6 Months`, which
    // is not a row, and the guard that used to sit in front of this masked it
    // on the common path.
    it('six months is Semi-Annually, not "Every 6 Months"', () => {
      expect(resolve('six-month').frequency).toBe('Semi-Annually');
    });
  });

  /**
   * Why the percentages can only ever be a fallback.
   *
   * If Arcadia ever supplies totals that ARE the old percentages, this fails and
   * the fallback could become the answer again.
   */
  describe('the old percentages cannot reproduce the September sheet', () => {
    const OLD: Record<number, number> = { 3: 3, 6: 6, 12: 10 };

    it('reproduces none of the 54, and under-charges on 53 of them', () => {
      let worst = 0;
      let agreed = 0;
      const overCharged: string[] = [];

      for (const t of SEPTEMBER_2026_TUITION) {
        for (const term of [3, 6, 12] as const) {
          const gross = Number(t.monthlyAmount) * term;
          const applied = gross * (1 - OLD[term] / 100);
          const approved = Number(t.prepaid[term]);

          if (Math.abs(approved - applied) < 0.005) agreed += 1;

          if (applied > approved) {
            overCharged.push(
              `${t.category}-${t.durationMinutes}-${t.tier}/${term}`,
            );
          } else {
            worst = Math.max(worst, approved - applied);
          }
        }
      }

      // The load-bearing claim: the fallback percentages reproduce nothing on
      // the sheet, so they can never quietly become the answer.
      expect(agreed).toBe(0);
      expect(worst).toBeCloseTo(106, 0);

      // One exception, and it is worth naming rather than loosening the test
      // around. Arcadia's 2026-08-31 sheet re-derived the 45-minute Standard
      // terms from the whole-dollar month, which put the other two back below
      // the fallback. This one stayed above it because 634.00 is the cell they
      // rounded DOWN - their own rule gives 635 - so 3% of 218 x 3 lands
      // fractionally over it.
      expect(overCharged).toEqual(['standard-45-1/3']);
    });

    it('and a corrected 3/5/8 would still not reproduce them', () => {
      const BETTER: Record<number, number> = { 3: 3, 6: 5, 12: 8 };
      let exact = 0;
      for (const t of SEPTEMBER_2026_TUITION) {
        for (const term of [3, 6, 12] as const) {
          const applied =
            Number(t.monthlyAmount) * term * (1 - BETTER[term] / 100);
          if (Math.abs(Number(t.prepaid[term]) - applied) < 0.005) exact += 1;
        }
      }
      // A handful land exactly; the rest do not, which is why the totals are
      // stored verbatim rather than computed.
      expect(exact).toBeLessThan(54);
    });
  });
});
