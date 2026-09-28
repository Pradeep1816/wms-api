import { describe, expect, it, vi } from 'vitest';
import { LessonDiscount } from '../entities/lesson-discount.entity';
import { ExtraLessonRateService } from './extra-lesson-rate.service';

/**
 * What rate a lesson on an EXTRA course is priced at.
 *
 * An extra lesson - added on its own, or converted from a group lesson - does
 * not join the student's regular course. It gets a course of its own, and a
 * brand-new one has no rate row. The price used to fall straight through to
 * `program.rate`, the program's list price from before tiers existed, and that
 * was then written onto the extra course, freezing every later extra lesson for
 * that student at it.
 *
 * Arcadia reported it on 2026-09-01 from Training Centre: a trial customer
 * quoted $32.50 where the September 30-minute price is $36.25. On the
 * 2026-09-01 snapshot every extra lesson dated on or after 1 September was
 * priced this way - 222 of 222.
 *
 * These tests sit on the service rather than on either caller, because there
 * are two doors into an extra course and the first fix only went through one.
 */
describe('ExtraLessonRateService', () => {
  const build = (options: {
    extraCourseRate?: number;
    regular?: { courseId: number; pricingTier: number | null; keepsPreviousRate: boolean } | null;
    regularCourseRate?: number;
    catalogueByTier?: Record<string, number | null>;
    programListRate?: number;
  }) => {
    const created: Array<{ courseId: number; rate: number }> = [];
    const catalogueCalls: Array<number | null> = [];

    const lessonRepository = {
      getProgramRateForDate: vi.fn(async (courseId: number) =>
        courseId === 777 ? (options.extraCourseRate ?? 0) : (options.regularCourseRate ?? 0),
      ),
      getProgramRate: vi.fn(async () => options.extraCourseRate ?? 0),
      findRegularEnrolmentForPricing: vi.fn(async () => options.regular ?? null),
      getProgramRateFromProgram: vi.fn(async () => options.programListRate ?? 65),
      createCourseProgramRate: vi.fn(async (courseId: number, _d: Date, rate: number) => {
        created.push({ courseId, rate });
      }),
    };

    const catalogue = {
      hourlyRateFor: vi.fn(async (input: { pricingTier: number | null }) => {
        catalogueCalls.push(input.pricingTier);
        const key = input.pricingTier === null ? 'default' : String(input.pricingTier);
        return options.catalogueByTier?.[key] ?? null;
      }),
    };

    const service = new ExtraLessonRateService(
      lessonRepository as never,
      catalogue as never,
    );

    const resolve = () =>
      service.resolveAndRecord({
        courseId: 777,
        studentId: 20891,
        programId: 64,
        locationId: 1,
        duration: '00:30:00',
        lessonDate: new Date('2026-09-21T07:30:00.000Z'),
      });

    return { resolve, lessonRepository, catalogue, catalogueCalls, created };
  };

  it('prices a brand-new trial customer from the catalogue, not the old list price', async () => {
    // The reported case: new customer, new student, one trial lesson.
    const { resolve, created, catalogueCalls } = build({
      regular: null,
      catalogueByTier: { default: 72.5 },
      programListRate: 65,
    });

    // Was 65, so $32.50 for thirty minutes rather than $36.25.
    expect(await resolve()).toBe(72.5);
    expect(created).toEqual([{ courseId: 777, rate: 72.5 }]);
    expect(catalogueCalls).toContain(null);
  });

  it("follows the tier on the student's regular enrolment", async () => {
    const { resolve, catalogueCalls } = build({
      regular: { courseId: 555, pricingTier: 3, keepsPreviousRate: false },
      catalogueByTier: { '3': 102.5, default: 72.5 },
    });

    expect(await resolve()).toBe(102.5);
    expect(catalogueCalls[0]).toBe(3);
  });

  it(
    'uses the regular enrolment tier instead of a legacy rate on an existing extra course',
    async () => {
      // SMW-1650: Angelina Tornea already had a Piano extra course carrying the
      // pre-tier $65 rate. Adding a lesson returned that rate before the service
      // looked at her regular enrolment, even after it moved to Tier 1.
      const { resolve, catalogueCalls } = build({
        extraCourseRate: 65,
        regular: { courseId: 555, pricingTier: 1, keepsPreviousRate: false },
        catalogueByTier: { '1': 72.67, default: 72.67 },
      });

      expect(await resolve()).toBe(72.67);
      expect(catalogueCalls).toEqual([1]);
    },
  );

  it('uses the Vocal tier rate instead of the Standard rate already on the extra course', async () => {
    // SMW-1650 follow-up: Chiara Abate had overlapping Vocal Core enrolments.
    // Once the repository selects her tiered enrolment, the catalogue's Vocal
    // rate must override the $72.50 rate already stored on the extra course.
    const { resolve, catalogueCalls } = build({
      extraCourseRate: 72.5,
      regular: { courseId: 29988, pricingTier: 1, keepsPreviousRate: false },
      catalogueByTier: { '1': 80, default: 72.5 },
    });

    expect(await resolve()).toBe(80);
    expect(catalogueCalls).toEqual([1]);
  });

  it('keeps an unclassified student on the rate their own course charges', async () => {
    // Must not quietly move them onto September pricing - the same rule the
    // payment-frequency extension follows.
    const { resolve } = build({
      regular: { courseId: 555, pricingTier: null, keepsPreviousRate: false },
      regularCourseRate: 65,
      catalogueByTier: { default: 72.5 },
    });

    expect(await resolve()).toBe(65);
  });

  it('keeps a held student on their held rate', async () => {
    const { resolve } = build({
      regular: { courseId: 555, pricingTier: null, keepsPreviousRate: true },
      regularCourseRate: 58,
      catalogueByTier: { default: 72.5 },
      programListRate: 65,
    });

    expect(await resolve()).toBe(58);
  });

  it('falls back to the program list price when nothing else has an opinion', async () => {
    const { resolve } = build({ regular: null, catalogueByTier: {}, programListRate: 65 });

    expect(await resolve()).toBe(65);
  });

  it(
    'reuses a rate the extra course already carries when the student has no tier',
    async () => {
      const { resolve, catalogue, lessonRepository, created } = build({
        extraCourseRate: 72.5,
      });

      expect(await resolve()).toBe(72.5);
      expect(catalogue.hourlyRateFor).not.toHaveBeenCalled();
      expect(
        lessonRepository.findRegularEnrolmentForPricing,
      ).toHaveBeenCalledOnce();
      expect(created).toEqual([]);
    },
  );

  describe('enrolment discounts', () => {
    const buildDiscount = (options: {
      frequencyLength: number;
      pricingTier?: number | null;
      keepsPreviousRate?: boolean;
      sourceDuration?: string;
      sourceRate?: number;
      sourceDiscounts: Array<{
        type: number;
        value: number;
        valueType: number;
      }>;
    }) => {
      const lessonRepository = {
        findRegularEnrolmentForPricing: vi.fn(async () => ({
          id: 15568,
          courseId: 15378,
          pricingTier:
            options.pricingTier === undefined ? 1 : options.pricingTier,
          keepsPreviousRate: options.keepsPreviousRate ?? false,
          paymentFrequency: {
            frequencyLength: options.frequencyLength,
          },
        })),
        findRegularLessonWithEnrolmentDiscounts: vi.fn(async () => ({
          id: 4573622,
          duration: options.sourceDuration ?? '00:30:00',
          programRate: options.sourceRate ?? 72.5,
          discounts: options.sourceDiscounts,
        })),
        createExtraLessonDiscount: vi.fn(async () => undefined),
      };

      const service = new ExtraLessonRateService(
        lessonRepository as never,
        {} as never,
      );

      const apply = (duration = '00:30:00', programRate = 72.5) =>
        service.applyEnrolmentDiscounts({
          lessonId: 9001,
          studentId: 20891,
          programId: 81,
          locationId: 8,
          duration,
          lessonDate: new Date('2026-09-21T17:15:00.000Z'),
          programRate,
        });

      return { apply, lessonRepository };
    };

    it.each([
      [3, 1.09],
      [6, 1.8],
      [12, 2.9],
    ])(
      'copies the published %i-month reduction from a regular lesson',
      async (frequencyLength, sourceValue) => {
        const { apply, lessonRepository } = buildDiscount({
          frequencyLength,
          sourceDiscounts: [
            {
              type: LessonDiscount.TYPE_PREPAID_CYCLE,
              value: sourceValue,
              valueType: 0,
            },
          ],
        });

        expect(await apply()).toBe(sourceValue);
        expect(lessonRepository.createExtraLessonDiscount).toHaveBeenCalledWith(
          {
            lessonId: 9001,
            enrolmentId: 15568,
            type: LessonDiscount.TYPE_PREPAID_CYCLE,
            valueType: 0,
            value: sourceValue,
          },
        );
      },
    );

    it('scales the existing reduction when the extra lesson has a different duration', async () => {
      const { apply, lessonRepository } = buildDiscount({
        frequencyLength: 3,
        sourceDuration: '00:30:00',
        sourceRate: 72.5,
        sourceDiscounts: [
          {
            type: LessonDiscount.TYPE_PREPAID_CYCLE,
            value: 1.09,
            valueType: 0,
          },
        ],
      });

      expect(await apply('00:45:00', 72.67)).toBe(1.635);
      expect(lessonRepository.createExtraLessonDiscount).toHaveBeenCalledWith(
        expect.objectContaining({ value: 1.635 }),
      );
    });

    it('uses the legacy percentage row when no published prepaid row exists', async () => {
      const { apply, lessonRepository } = buildDiscount({
        frequencyLength: 3,
        sourceDiscounts: [
          {
            type: LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
            value: 3,
            valueType: 1,
          },
        ],
      });

      expect(await apply()).toBe(1.0875);
      expect(lessonRepository.createExtraLessonDiscount).toHaveBeenCalledWith({
        lessonId: 9001,
        enrolmentId: 15568,
        type: LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
        valueType: 1,
        value: 3,
      });
    });

    it('copies the multiple-enrolment reduction for monthly billing', async () => {
      const { apply, lessonRepository } = buildDiscount({
        frequencyLength: 1,
        sourceDuration: '00:45:00',
        sourceDiscounts: [
          {
            type: LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
            value: 1.75,
            valueType: 1,
          },
        ],
      });

      expect(await apply('00:45:00', 72.67)).toBe(1.75);
      expect(lessonRepository.createExtraLessonDiscount).toHaveBeenCalledWith({
        lessonId: 9001,
        enrolmentId: 15568,
        type: LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
        valueType: 1,
        value: 1.75,
      });
      expect(
        lessonRepository.findRegularLessonWithEnrolmentDiscounts,
      ).toHaveBeenCalledWith(
        15568,
        15378,
        new Date('2026-09-21T17:15:00.000Z'),
        '00:45:00',
        1,
      );
    });

    it('prices a 30-minute Vocal Tier 1 extra lesson at $38.75 after the sibling discount', async () => {
      const { apply, lessonRepository } = buildDiscount({
        frequencyLength: 1,
        sourceDuration: '00:30:00',
        sourceRate: 80,
        sourceDiscounts: [
          {
            type: LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
            value: 1.25,
            valueType: 1,
          },
        ],
      });

      const gross = 80 * 0.5;
      const reduction = await apply('00:30:00', 80);

      expect(gross - reduction).toBe(38.75);
      expect(lessonRepository.createExtraLessonDiscount).toHaveBeenCalledWith(
        expect.objectContaining({
          type: LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
          value: 1.25,
        }),
      );
    });

    it('scales the multiple-enrolment reduction for another duration', async () => {
      const { apply, lessonRepository } = buildDiscount({
        frequencyLength: 1,
        sourceDuration: '00:30:00',
        sourceDiscounts: [
          {
            type: LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
            value: 1.25,
            valueType: 1,
          },
        ],
      });

      expect(await apply('00:45:00', 72.67)).toBe(1.875);
      expect(lessonRepository.createExtraLessonDiscount).toHaveBeenCalledWith(
        expect.objectContaining({
          type: LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
          value: 1.875,
        }),
      );
    });

    it('stacks multiple-enrolment and prepaid fixed reductions', async () => {
      const { apply, lessonRepository } = buildDiscount({
        frequencyLength: 3,
        sourceDiscounts: [
          {
            type: LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
            value: 1.25,
            valueType: 1,
          },
          {
            type: LessonDiscount.TYPE_PREPAID_CYCLE,
            value: 1.09,
            valueType: 0,
          },
        ],
      });

      expect(await apply()).toBe(2.34);
      expect(lessonRepository.createExtraLessonDiscount).toHaveBeenCalledTimes(
        2,
      );
    });

    it('applies a legacy percentage after the multiple-enrolment reduction', async () => {
      const { apply } = buildDiscount({
        frequencyLength: 3,
        sourceDiscounts: [
          {
            type: LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
            value: 1.25,
            valueType: 1,
          },
          {
            type: LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
            value: 3,
            valueType: 1,
          },
        ],
      });

      // $36.25 - $1.25 = $35.00, then 3% = $1.05.
      expect(await apply()).toBe(2.3);
    });

    it('does not copy a prepaid reduction for monthly billing', async () => {
      const { apply, lessonRepository } = buildDiscount({
        frequencyLength: 1,
        sourceDiscounts: [
          {
            type: LessonDiscount.TYPE_PREPAID_CYCLE,
            value: 1.09,
            valueType: 0,
          },
        ],
      });

      expect(await apply()).toBe(0);
      expect(lessonRepository.createExtraLessonDiscount).not.toHaveBeenCalled();
    });

    it.each([
      ['an untiered enrolment', null, false],
      ['an enrolment kept on its previous rate', 1, true],
    ])(
      'does not change discounts for %s',
      async (_label, pricingTier, keepsPreviousRate) => {
        const { apply, lessonRepository } = buildDiscount({
          frequencyLength: 3,
          pricingTier,
          keepsPreviousRate,
          sourceDiscounts: [
            {
              type: LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
              value: 1.75,
              valueType: 1,
            },
            {
              type: LessonDiscount.TYPE_PREPAID_CYCLE,
              value: 1.09,
              valueType: 0,
            },
          ],
        });

        expect(await apply()).toBe(0);
        expect(
          lessonRepository.findRegularLessonWithEnrolmentDiscounts,
        ).not.toHaveBeenCalled();
        expect(
          lessonRepository.createExtraLessonDiscount,
        ).not.toHaveBeenCalled();
      },
    );
  });
});
