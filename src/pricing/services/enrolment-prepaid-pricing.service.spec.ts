import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnrolmentPrepaidPricingService } from './enrolment-prepaid-pricing.service';
import { PricingCategoryEnum } from '../enums/pricing-category.enum';
import { Lesson } from '../../lesson/entities/lesson.entity';

/**
 * The gating decisions, not the arithmetic.
 *
 * The money is pinned in `prepaid-cycle-application.service.spec.ts`, including
 * the cross-calculator agreement test. What is worth pinning here is the set of
 * enrolments that must be left completely alone - because every one of those
 * cases, if it slipped through, would silently change what a real customer pays.
 */
describe('EnrolmentPrepaidPricingService', () => {
  let cycleApplication: {
    plan: ReturnType<typeof vi.fn>;
    apply: ReturnType<typeof vi.fn>;
  };
  let programPresentation: {
    isTierable: ReturnType<typeof vi.fn>;
    pricingCategoryFor: ReturnType<typeof vi.fn>;
  };
  let enrolmentRow: Record<string, unknown> | null;
  let deletePrepaidRows: ReturnType<typeof vi.fn>;
  let prepaidRowsOnLessons: Array<{ lessonId: number }>;
  let lessonEntities: unknown[];
  let managerQuery: ReturnType<typeof vi.fn>;
  /** Lessons the fake manager should report as already invoiced. */
  let invoicedLessonIds: number[];
  let cycleRows: Array<{ id: number; startDate: string }>;
  let lessonRows: Array<{ id: number; duration: string }>;

  const TIERED_ENROLMENT = {
    id: 500,
    courseId: 900,
    pricingTier: 2,
    keepsPreviousRate: false,
    course: {
      locationId: 15,
      program: {
        id: 64,
        name: 'Bass Guitar',
        pricingCategory: 'standard',
        type: 1,
      },
    },
  };

  function build(): EnrolmentPrepaidPricingService {
    const queryBuilder = {
      innerJoin: () => queryBuilder,
      where: () => queryBuilder,
      andWhere: () => queryBuilder,
      orderBy: () => queryBuilder,
      getMany: () => Promise.resolve(lessonRows),
    };

    const manager = {
      getRepository: (entity: { name: string }) => {
        if (entity.name === 'Enrolment') {
          return { findOne: () => Promise.resolve(enrolmentRow) };
        }
        if (entity.name === 'PaymentCycle') {
          return { find: () => Promise.resolve(cycleRows) };
        }
        if (entity.name === 'LessonDiscount') {
          return {
            delete: deletePrepaidRows,
            // Which lessons the rows sat on, read before they are deleted so
            // the billed totals can be put back.
            find: () => Promise.resolve(prepaidRowsOnLessons),
          };
        }
        if (entity.name === 'Lesson') {
          return {
            find: () => Promise.resolve(lessonEntities),
            createQueryBuilder: () => queryBuilder,
          };
        }
        return { createQueryBuilder: () => queryBuilder };
      },
      query: managerQuery,
    };

    return new EnrolmentPrepaidPricingService(
      { manager } as never,
      cycleApplication as never,
      programPresentation as never,
    );
  }

  beforeEach(() => {
    cycleApplication = {
      plan: vi.fn().mockResolvedValue({ enrolmentId: 500, lessons: [] }),
      apply: vi.fn().mockResolvedValue(1),
    };
    programPresentation = {
      isTierable: vi.fn().mockReturnValue(true),
      pricingCategoryFor: vi.fn().mockReturnValue(PricingCategoryEnum.STANDARD),
    };
    deletePrepaidRows = vi.fn().mockResolvedValue({ affected: 0 });
    prepaidRowsOnLessons = [];
    lessonEntities = [];
    // Nothing invoiced and nothing paid unless a test says otherwise.
    invoicedLessonIds = [];
    managerQuery = vi.fn((sql: string) =>
      Promise.resolve(
        /invoice_item_lesson/.test(String(sql))
          ? invoicedLessonIds.map((lessonId) => ({ lessonId }))
          : [],
      ),
    );
    enrolmentRow = { ...TIERED_ENROLMENT };
    cycleRows = [
      { id: 1, startDate: '2026-09-01' },
      { id: 2, startDate: '2026-12-01' },
    ];
    lessonRows = [
      { id: 11, duration: '00:30:00' },
      { id: 12, duration: '00:30:00' },
    ];
  });

  it('prices every cycle of a prepaid, tiered enrolment', async () => {
    const result = await build().applyForEnrolment({
      enrolmentId: 500,
      frequencyLength: 3,
    });

    expect(result.skipped).toBeNull();
    expect(result.cyclesPriced).toBe(2);
    expect(cycleApplication.apply).toHaveBeenCalledTimes(2);
    // `apply` deletes and rewrites per cycle, so a blanket clear here would be
    // redundant at best and would wipe a cycle it then failed to re-price.
    expect(deletePrepaidRows).not.toHaveBeenCalled();
  });

  it('passes the cycle its own start date, not the enrolment start', async () => {
    // Prices are effective-dated, so a cycle beginning in December must be
    // quoted for December. Quoting every cycle from the enrolment's start would
    // apply a superseded price to later cycles.
    await build().applyForEnrolment({ enrolmentId: 500, frequencyLength: 3 });

    const dates = cycleApplication.plan.mock.calls.map(
      (call) => (call[0] as { effectiveDate: string }).effectiveDate,
    );
    expect(dates).toEqual(['2026-09-01', '2026-12-01']);
  });

  it('reads the lesson duration rather than the current course schedule', async () => {
    lessonRows = [{ id: 11, duration: '01:00:00' }];

    await build().applyForEnrolment({ enrolmentId: 500, frequencyLength: 6 });

    // The manager is the second argument and must be passed: `plan` reads the
    // cycle's lessons, and on the default connection inside an open transaction
    // that read comes back empty.
    expect(cycleApplication.plan).toHaveBeenCalledWith(
      expect.objectContaining({ durationMinutes: 60, frequencyLength: 6 }),
      expect.anything(),
    );
  });

  describe('leaves alone', () => {
    it('monthly billing - there is no prepaid total to apply', async () => {
      const result = await build().applyForEnrolment({
        enrolmentId: 500,
        frequencyLength: 1,
      });

      expect(result.skipped).toBe('monthly-billing');
      expect(cycleApplication.apply).not.toHaveBeenCalled();
      // Any prepaid row from a previous basis must go, or every calculator
      // would keep honouring a cycle price this enrolment is no longer on.
      expect(deletePrepaidRows).toHaveBeenCalledWith(
        expect.objectContaining({ enrolmentId: 500, type: 7 }),
      );
    });

    it('a grandfathered enrolment - the September totals are not its prices', async () => {
      enrolmentRow = { ...TIERED_ENROLMENT, keepsPreviousRate: true };

      const result = await build().applyForEnrolment({
        enrolmentId: 500,
        frequencyLength: 3,
      });

      expect(result.skipped).toBe('keeps-previous-rate');
      expect(cycleApplication.apply).not.toHaveBeenCalled();
      // Any prepaid row from a previous basis must go, or every calculator
      // would keep honouring a cycle price this enrolment is no longer on.
      expect(deletePrepaidRows).toHaveBeenCalledWith(
        expect.objectContaining({ enrolmentId: 500, type: 7 }),
      );
    });

    it('an enrolment with no tier', async () => {
      enrolmentRow = { ...TIERED_ENROLMENT, pricingTier: null };

      const result = await build().applyForEnrolment({
        enrolmentId: 500,
        frequencyLength: 3,
      });

      expect(result.skipped).toBe('no-tier');
      expect(cycleApplication.apply).not.toHaveBeenCalled();
      // Any prepaid row from a previous basis must go, or every calculator
      // would keep honouring a cycle price this enrolment is no longer on.
      expect(deletePrepaidRows).toHaveBeenCalledWith(
        expect.objectContaining({ enrolmentId: 500, type: 7 }),
      );
    });

    it('a program holding an older price sheet', async () => {
      programPresentation.isTierable.mockReturnValue(false);

      const result = await build().applyForEnrolment({
        enrolmentId: 500,
        frequencyLength: 3,
      });

      expect(result.skipped).toBe('program-not-tierable');
      expect(cycleApplication.apply).not.toHaveBeenCalled();
      // Any prepaid row from a previous basis must go, or every calculator
      // would keep honouring a cycle price this enrolment is no longer on.
      expect(deletePrepaidRows).toHaveBeenCalledWith(
        expect.objectContaining({ enrolmentId: 500, type: 7 }),
      );
    });

    it('a cycle that starts before the September cutover', async () => {
      // Same rule the rate itself follows: an August cycle is billed the way it
      // always was, even on an enrolment that has a tier.
      cycleRows = [
        { id: 1, startDate: '2026-08-01' },
        { id: 2, startDate: '2026-09-01' },
      ];

      const result = await build().applyForEnrolment({
        enrolmentId: 500,
        frequencyLength: 3,
      });

      expect(result.cyclesPriced).toBe(1);
      expect(result.cyclesSkipped).toBe(1);
      expect(cycleApplication.plan).toHaveBeenCalledWith(
        expect.objectContaining({ effectiveDate: '2026-09-01' }),
        expect.anything(),
      );
    });

    it('a cycle with no lessons linked to it', async () => {
      lessonRows = [];

      const result = await build().applyForEnrolment({
        enrolmentId: 500,
        frequencyLength: 3,
      });

      expect(result.cyclesPriced).toBe(0);
      expect(result.cyclesSkipped).toBe(2);
    });
  });

  describe('never blocks the enrolment', () => {
    it('prices the other cycles when one of them throws', async () => {
      // An unpriced duration on one cycle must not cost the customer the
      // published price on the rest.
      cycleApplication.plan
        .mockRejectedValueOnce(new Error('no catalogue row'))
        .mockResolvedValueOnce({ enrolmentId: 500, lessons: [] });

      const result = await build().applyForEnrolment({
        enrolmentId: 500,
        frequencyLength: 3,
      });

      expect(result.cyclesPriced).toBe(1);
      expect(result.cyclesSkipped).toBe(1);
    });

    it('reports rather than throws when a cycle refuses to apply', async () => {
      // `apply` throws when lessons are still on a pre-migration rate. That is
      // a refusal to overcharge, not a failure to confirm the enrolment.
      cycleApplication.apply.mockRejectedValue(
        new Error('lessons are still on a pre-migration rate'),
      );

      const result = await build().applyForEnrolment({
        enrolmentId: 500,
        frequencyLength: 3,
      });

      expect(result.cyclesPriced).toBe(0);
      expect(result.cyclesSkipped).toBe(2);
    });

    it('an enrolment that cannot be found', async () => {
      enrolmentRow = null;

      const result = await build().applyForEnrolment({
        enrolmentId: 500,
        frequencyLength: 3,
      });

      expect(result.skipped).toBe('enrolment-not-found');
    });
  });

  describe('what the customer is actually billed', () => {
    /**
     * `lesson_discount` is what the calculators read, but
     * `private_lesson.total` is what the enrolment page, the balance card and
     * the Receive Payment screen show. Adding or removing a prepaid row does
     * not move it on its own, so the service has to.
     */
    const billedWrites = (
      managerQueryMock: ReturnType<typeof vi.fn>,
    ): unknown[] =>
      (managerQueryMock.mock.calls as unknown[][])
        .filter((call) => /UPDATE private_lesson/i.test(String(call[0])))
        .map((call) => call[1]);

    it('restores the monthly price when prepaid is cleared', async () => {
      // Arcadia, 2026-08-26: a quarterly enrolment moved to Monthly kept
      // billing $35.16 a lesson with every twelfth at $35.24 - the published
      // $422.00 split twelve ways - because clearing the prepaid rows left
      // `private_lesson.total` untouched. Tier 1 monthly is $36.25.
      prepaidRowsOnLessons = [{ lessonId: 11 }];
      lessonEntities = [
        Object.assign(new Lesson(), {
          id: 11,
          duration: '00:30:00',
          programRate: 72.5,
          tax: 0,
          discounts: [],
        }),
      ];

      const result = await build().applyForEnrolment({
        enrolmentId: 500,
        frequencyLength: 1,
      });

      expect(result.skipped).toBe('monthly-billing');
      expect(billedWrites(managerQuery)).toEqual([[36.25, 36.25, 11]]);
    });

    it('leaves an invoiced lesson alone', async () => {
      // Its balance reflects money already collected. Rewriting it from the
      // price would discard that.
      prepaidRowsOnLessons = [{ lessonId: 11 }];
      lessonEntities = [
        Object.assign(new Lesson(), {
          id: 11,
          duration: '00:30:00',
          programRate: 72.5,
          tax: 0,
          discounts: [],
        }),
      ];
      invoicedLessonIds = [11];

      await build().applyForEnrolment({
        enrolmentId: 500,
        frequencyLength: 1,
      });

      expect(billedWrites(managerQuery)).toEqual([]);
    });

    it('writes nothing when the enrolment had no prepaid rows', async () => {
      prepaidRowsOnLessons = [];

      await build().applyForEnrolment({
        enrolmentId: 500,
        frequencyLength: 1,
      });

      expect(billedWrites(managerQuery)).toEqual([]);
    });
  });
});
