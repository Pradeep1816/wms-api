import { describe, expect, it, vi } from 'vitest';
import { EnrolmentPaymentFrequencyService } from './enrolment-payment-frequency.service';

/**
 * What rate an extension is priced at.
 *
 * Switching payment frequency extends the enrolment when the new cycle runs
 * past the course end, and the extension writes a fresh `course_program_rate`
 * row. Which rate lands in that row is the whole question here.
 *
 * Arcadia reported the fault on 2026-09-01 against a Burlington enrolment held
 * on the legacy $130 rate: switching it to monthly moved it to $145, with
 * nobody having touched its pricing. `hourlyRateFor()` answers a missing tier
 * with `DEFAULT_PRICING_TIER` - Tier 1 - so every unclassified enrolment was
 * moved onto September pricing the first time it was extended.
 *
 * It was harmless while the rollout was two pilot schools, because the rollout
 * gate inside `hourlyRateFor()` returned null everywhere else. Opening the
 * structure to every location removed that gate and made the tier fallback
 * reachable estate-wide - 4,336 enrolments carry no tier and no held-rate flag.
 *
 * Arcadia's rule, in their own words: no price change unless the school makes
 * one through Change Pricing.
 *
 * These drive the real `renewEnrolment`, so they fail if the decision moves.
 */
describe('EnrolmentPaymentFrequencyService - the rate an extension is priced at', () => {
  const build = (options: {
    pricingTier: number | null;
    keepsPreviousRate?: boolean;
    heldRate?: number | null;
    catalogueRate?: number | null;
    programRate?: number;
  }) => {
    const createdRates: Array<{ programRate: number }> = [];

    const repository = {
      getCourseWithProgram: vi.fn(async () => ({
        id: 900,
        locationId: 15,
        teacherId: 11,
        endDate: '2026-11-30',
        program: { id: 74, rate: options.programRate ?? 65 },
      })),
      getLastPaymentCycle: vi.fn(async () => ({
        startDate: '2026-11-01',
        endDate: '2026-11-30',
      })),
      getFirstLessonForCourse: vi.fn(async () => ({
        id: 1,
        date: '2026-11-02',
        duration: '00:30:00',
      })),
      getTeacherQualificationRate: vi.fn(async () => 0),
      getRecentCourseSchedule: vi.fn(async () => ({
        id: 5,
        teacherId: 11,
        duration: '00:30:00',
        day: 1,
        fromTime: '16:30:00',
      })),
      findRateInEffectBefore: vi.fn(async () => options.heldRate ?? null),
      createCourseProgramRate: vi.fn(
        async (_courseId: number, _s: Date, _e: Date, programRate: number) => {
          createdRates.push({ programRate });
          return { id: 1 };
        },
      ),
      createAutoRenewal: vi.fn(async () => ({ id: 2 })),
      createPaymentCycle: vi.fn(async () => ({ id: 3 })),
      createCourseSchedule: vi.fn(async () => ({ id: 4 })),
      createLessonForAutoRenewal: vi.fn(async () => ({ id: 6 })),
      createAutoRenewalLesson: vi.fn(async () => undefined),
      createPrivateLessonsForAutoRenewal: vi.fn(async () => undefined),
      updateCourseScheduleEndDate: vi.fn(async () => undefined),
      updateCourseScheduleIsRecent: vi.fn(async () => undefined),
      updatePaymentCycleEndDate: vi.fn(async () => undefined),
      createPaymentCycleLesson: vi.fn(async () => undefined),
      updateCourseEndDate: vi.fn(async () => undefined),
      updateEnrolmentEndDate: vi.fn(async () => undefined),
    };

    const catalogue = {
      hourlyRateFor: vi.fn(async () => options.catalogueRate ?? null),
    };

    const service = new EnrolmentPaymentFrequencyService(
      repository as never,
      { transaction: vi.fn() } as never,
      catalogue as never,
      { apply: vi.fn(), recordForEnrolment: vi.fn() } as never,
      { recalculateAndPersist: vi.fn() } as never,
    );

    const enrolment = {
      id: 500,
      courseId: 900,
      endDateTime: new Date('2026-11-30'),
      pricingTier: options.pricingTier,
      keepsPreviousRate: options.keepsPreviousRate ?? false,
    };

    const renew = async () => {
      // `renewEnrolment` is private; the decision under test lives inside it,
      // so it is driven directly rather than re-implemented here.
      await (
        service as unknown as {
          renewEnrolment: (
            e: unknown,
            f: unknown,
            u: number,
            m?: unknown,
          ) => Promise<void>;
        }
      ).renewEnrolment(enrolment, { id: 1, name: 'Monthly' }, 694);
    };

    return { renew, repository, catalogue, createdRates };
  };

  const rateWritten = (createdRates: Array<{ programRate: number }>) => {
    expect(createdRates.length).toBeGreaterThan(0);
    return createdRates[0].programRate;
  };

  it('does not ask the catalogue when the enrolment has no tier', async () => {
    const { renew, catalogue, createdRates } = build({
      pricingTier: null,
      heldRate: 65,
    });

    await renew();

    // The defect: this used to reach the catalogue and come back with Tier 1's
    // 72.50, moving an enrolment nobody had classified onto September pricing.
    expect(catalogue.hourlyRateFor).not.toHaveBeenCalled();
    expect(rateWritten(createdRates)).toBe(65);
  });

  it('follows the catalogue when a tier was actually chosen', async () => {
    const { renew, catalogue, createdRates } = build({
      pricingTier: 2,
      heldRate: 65,
      catalogueRate: 87.5,
    });

    await renew();

    expect(catalogue.hourlyRateFor).toHaveBeenCalled();
    expect(rateWritten(createdRates)).toBe(87.5);
  });

  it('carries a held rate forward rather than the program list price', async () => {
    // `hourlyRateFor` declines to price a held enrolment. That used to fall
    // through to the program's list price and lose a negotiated rate.
    const { renew, createdRates } = build({
      pricingTier: null,
      keepsPreviousRate: true,
      heldRate: 58,
      programRate: 65,
    });

    await renew();

    expect(rateWritten(createdRates)).toBe(58);
  });

  it('falls back to the program list price when the course has no rate row', async () => {
    const { renew, createdRates } = build({
      pricingTier: null,
      heldRate: null,
      programRate: 65,
    });

    await renew();

    expect(rateWritten(createdRates)).toBe(65);
  });

  it('prefers the catalogue over the held rate when a tier is set', async () => {
    const { renew, createdRates } = build({
      pricingTier: 3,
      heldRate: 65,
      catalogueRate: 102.5,
    });

    await renew();

    expect(rateWritten(createdRates)).toBe(102.5);
  });
});
