import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnrolmentPricingBasisService } from './enrolment-pricing-basis.service';
import { CourseRateResolverService } from './course-rate-resolver.service';
import { PricingResolutionError } from '../errors/pricing-resolution.error';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonDiscount } from '../../lesson/entities/lesson-discount.entity';
import { DataSource } from 'typeorm';

/**
 * A transaction manager that records what was written.
 *
 * Deliberately records rather than asserts, so each test can ask a different
 * question of the same run - "what rate rows were planned" and "which lessons
 * moved" are separate concerns and reading them from one recording keeps the
 * arrangement honest.
 */
/**
 * Rows whose only invoice or payment link has been DELETED.
 *
 * The fake answers these the way MySQL would: a query that filters the deleted
 * rows out sees nothing, and a query that forgets to filter sees the stale row.
 * That is what makes these tests fail against the unguarded version.
 */
function createManager(
  lessons: any[],
  settled: number[] = [],
  settledOnlyByDeletedRows: number[] = [],
  explodedLineage: any[] = [],
) {
  const written = {
    rates: [] as any[],
    lessonUpdates: [] as Array<{ id: number; changes: any }>,
    enrolmentUpdates: [] as any[],
    tierChanges: [] as any[],
    ratesDeleted: 0,
  };

  const repo = (entityName: string) => ({
    delete: vi.fn(async () => {
      if (entityName === 'CourseProgramRate') written.ratesDeleted += 1;
      return { affected: 1 };
    }),
    create: vi.fn((payload: any) => payload),
    save: vi.fn(async (payload: any) => {
      if (entityName === 'CourseProgramRate') written.rates.push(payload);
      if (entityName === 'EnrolmentTierChange')
        written.tierChanges.push(payload);
      return payload;
    }),
    find: vi.fn(async () => lessons),
    update: vi.fn(async (where: any, changes: any) => {
      if (entityName === 'Lesson') {
        written.lessonUpdates.push({ id: where.id, changes });
      }
      if (entityName === 'Enrolment') written.enrolmentUpdates.push(changes);
      return { affected: 1 };
    }),
  });

  const sqlSeen: string[] = [];

  const manager = {
    getRepository: vi.fn((entity: any) => repo(entity.name)),
    query: vi.fn(async (sql: string, _params?: unknown[]) => {
      sqlSeen.push(sql);

      if (/invoice_item_lesson/.test(sql)) {
        const live = settled.map((id) => ({ lessonId: id }));
        // A deleted line item or a deleted/canceled/void invoice only reaches
        // the caller when the query fails to exclude it.
        const guarded =
          /ili\.isDeleted\s*=\s*0/.test(sql) &&
          /inv\.isDeleted\s*=\s*0/.test(sql);
        return guarded
          ? live
          : [
              ...live,
              ...settledOnlyByDeletedRows.map((id) => ({ lessonId: id })),
            ];
      }

      if (/lesson_payment/.test(sql)) {
        const guarded = /lp\.isDeleted\s*=\s*0/.test(sql);
        return guarded
          ? []
          : settledOnlyByDeletedRows.map((id) => ({ lessonId: id }));
      }

      if (/lesson_hierarchy/.test(sql)) {
        return explodedLineage;
      }

      return [];
    }),
  };

  return { manager, written, sqlSeen };
}

function build(options: {
  lessons?: any[];
  settled?: number[];
  settledOnlyByDeletedRows?: number[];
  enrolment?: any;
  course?: any;
  program?: any;
  rates?: any[];
  tierable?: boolean;
  rolloutOn?: boolean;
  hourlyRate?: string;
  courseRateResolver?: CourseRateResolverService;
  explodedLineage?: any[];
}) {
  const lessons = options.lessons ?? [];
  const { manager, written, sqlSeen } = createManager(
    lessons,
    options.settled ?? [],
    options.settledOnlyByDeletedRows ?? [],
    options.explodedLineage ?? [],
  );

  const enrolmentRepository = {
    findOne: vi.fn(async () =>
      options.enrolment === undefined
        ? { id: 500, courseId: 900, isDeleted: false, pricingTier: 2 }
        : options.enrolment,
    ),
  };
  const courseRepository = {
    findOne: vi.fn(async () =>
      options.course === undefined
        ? {
            id: 900,
            locationId: 15,
            programId: 64,
            startDate: '2026-08-24',
            endDate: '2026-12-31',
          }
        : options.course,
    ),
    query: vi.fn(async () => [{ duration: '01:00' }]),
  };
  const courseProgramRateRepository = {
    find: vi.fn(
      async () =>
        options.rates ?? [
          {
            id: 1,
            courseId: 900,
            startDate: '2026-08-24',
            endDate: '2026-08-31',
            programRate: 65,
          },
          {
            id: 2,
            courseId: 900,
            startDate: '2026-09-01',
            endDate: '2026-12-31',
            programRate: 87.5,
          },
        ],
    ),
  };
  const lessonRepository = { find: vi.fn(async () => lessons) };
  const programRepository = {
    findOne: vi.fn(async () =>
      options.program === undefined
        ? {
            id: 64,
            name: options.programName ?? 'Bass Guitar',
            pricingCategory: 'standard',
            type: 1,
            rate: 65,
          }
        : options.program,
    ),
  };

  const dataSource = {
    transaction: vi.fn(async (cb: any) => cb(manager)),
  };
  const rollout = {
    isEnabledForLocation: vi.fn().mockResolvedValue(options.rolloutOn ?? true),
  };
  const programPresentation = {
    isTierable: vi.fn().mockReturnValue(options.tierable ?? true),
    // The refusal message differs for a retired program and an unclassified
    // one, so the mock has to answer this too.
    hasInternalMarker: vi.fn().mockReturnValue(options.retired ?? false),
    pricingCategoryFor: vi.fn().mockReturnValue('standard'),
  };
  const pricingResolver = {
    resolve: vi.fn().mockResolvedValue({
      hourlyRate: options.hourlyRate ?? '87.50',
      monthlyAmount: '350.00',
    }),
  };

  const enrolmentPrepaidPricing = {
    applyForEnrolment: vi
      .fn()
      .mockResolvedValue({ cyclesPriced: 0, cyclesSkipped: 0, skipped: null }),
  };

  const service = new EnrolmentPricingBasisService(
    enrolmentRepository as never,
    courseRepository as never,
    courseProgramRateRepository as never,
    lessonRepository as never,
    programRepository as never,
    dataSource as never,
    rollout as never,
    programPresentation as never,
    pricingResolver as never,
    options.courseRateResolver ?? new CourseRateResolverService(),
    // Prepaid re-pricing has its own spec. Here it only has to be called
    // without throwing, so these cases keep testing the rate behaviour they are
    // actually about.
    enrolmentPrepaidPricing as never,
  );

  return {
    service,
    written,
    manager,
    sqlSeen,
    rollout,
    pricingResolver,
    programPresentation,
    enrolmentPrepaidPricing,
  };
}

/**
 * A real `Lesson`, not a plain object.
 *
 * The service recomputes what the customer is billed with
 * `Lesson.getNetPrice()` - the calculator confirmation, rescheduling and the
 * recurring-payment cron also use - so a stub would test the fixture rather
 * than the arithmetic that actually reaches a customer.
 */
const lesson = (over: Partial<any> = {}) =>
  Object.assign(new Lesson(), {
    id: 1,
    date: '2027-01-11',
    status: 2, // SCHEDULED
    isDeleted: false,
    duration: '00:30:00',
    programRate: 87.5,
    total: 43.75,
    tax: 0,
    discounts: [],
    ...over,
  });

/** A `lesson_discount` row, as the entity carries it. */
const discount = (type: number, value: number, valueType = 0) =>
  Object.assign(new LessonDiscount(), { type, value, valueType });

describe('EnrolmentPricingBasisService', () => {
  describe('A6: refuse invalid pricing plans without writes', () => {
    const input = {
      locationId: 15,
      enrolmentId: 500,
      pricingTier: 1,
      effectiveFrom: '2026-09-01',
      reason: 'Move to the new rate',
      changedByUserId: 7,
    };
    const course = {
      id: 900,
      locationId: 15,
      programId: 64,
      startDate: '2022-01-24',
      endDate: '2028-01-22',
    };

    function expectNoWrites(
      written: ReturnType<typeof createManager>['written'],
    ) {
      expect(written).toEqual({
        rates: [],
        lessonUpdates: [],
        enrolmentUpdates: [],
        tierChanges: [],
        ratesDeleted: 0,
      });
    }

    it.each([
      ['zero SQL start', '0000-00-00 00:00:00', course.endDate],
      ['invalid hydrated start', new Date(NaN), course.endDate],
      ['null start', null, course.endDate],
      ['partial zero start', '2022-00-24', course.endDate],
      ['impossible start', '2022-02-30', course.endDate],
      ['invalid end', course.startDate, new Date(NaN)],
      ['null end', course.startDate, null],
      ['inverted bounds', '2028-02-01', course.endDate],
    ])(
      'rejects %s for both tier and previous-rate changes',
      async (_name, startDate, endDate) => {
        for (const basis of [
          { pricingTier: 1 },
          { pricingTier: undefined, keepsPreviousRate: true },
        ]) {
          const { service, written, enrolmentPrepaidPricing } = build({
            course: { ...course, startDate, endDate },
          });
          await expect(service.change({ ...input, ...basis })).rejects.toThrow(
            /invalid start or end dates/,
          );
          expectNoWrites(written);
          expect(
            enrolmentPrepaidPricing.applyForEnrolment,
          ).not.toHaveBeenCalled();
        }
      },
    );

    it('rejects the actual MySQL driver zero-date representation even with the default effective date', async () => {
      const driver = new DataSource({ type: 'mysql' }).driver;
      const startDate = driver.prepareHydratedValue('0000-00-00 00:00:00', {
        type: Date,
      } as never);
      expect(Number.isNaN(startDate.getTime())).toBe(true);
      const { service, written } = build({ course: { ...course, startDate } });
      await expect(
        service.change({ ...input, effectiveFrom: undefined }),
      ).rejects.toThrow(PricingResolutionError);
      expectNoWrites(written);
    });

    it.each(['NaN-NaN-NaN', '2026-09-31', '2026-13-01', '2026-09-01junk'])(
      'rejects invalid effective date %s before writes',
      async (effectiveFrom) => {
        const { service, written } = build({});
        await expect(
          service.change({ ...input, effectiveFrom }),
        ).rejects.toThrow(/valid calendar date/);
        expectNoWrites(written);
      },
    );

    it.each([
      [],
      [{ startDate: '2022-01-24', endDate: '2028-01-22', programRate: NaN }],
      [{ startDate: '2022-01-24', endDate: '2026-08-31', programRate: 65 }],
      [
        { startDate: '2022-01-24', endDate: '2026-08-31', programRate: 65 },
        { startDate: '2026-09-02', endDate: '2028-01-22', programRate: 72.5 },
      ],
    ])(
      'rejects an empty, invalid or incomplete replacement plan',
      async (...planned) => {
        const resolver = new CourseRateResolverService();
        vi.spyOn(resolver, 'planNewCourseRateRows').mockReturnValue(
          planned as never,
        );
        const { service, written } = build({
          course,
          courseRateResolver: resolver,
        });
        await expect(service.change(input)).rejects.toThrow(
          /complete valid course rate schedule/,
        );
        expectNoWrites(written);
      },
    );

    it('replaces the rate schedule and reprices an eligible lesson when course dates are valid', async () => {
      const { service, written } = build({
        course,
        hourlyRate: '72.50',
        rates: [
          {
            id: 1,
            courseId: 900,
            startDate: '2022-01-24',
            endDate: '2028-01-22',
            programRate: 65,
          },
        ],
        lessons: [lesson({ date: '2026-10-03', programRate: 65, total: 32.5 })],
      });
      const result = await service.change(input);
      expect(result.rates).toEqual([
        { startDate: '2022-01-24', endDate: '2026-08-31', programRate: 65 },
        { startDate: '2026-09-01', endDate: '2028-01-22', programRate: 72.5 },
      ]);
      expect(result.lessonsRepriced).toBe(1);
      expect(written.lessonUpdates[0].changes.total).toBe(36.25);
      expect(written.tierChanges).toHaveLength(1);
    });
  });
  describe('what it refuses', () => {
    it('refuses a tier and the previous rate together', async () => {
      const { service } = build({});
      await expect(
        service.change({
          locationId: 15,
          enrolmentId: 500,
          pricingTier: 2,
          keepsPreviousRate: true,
          reason: 'x',
          changedByUserId: 7,
        }),
      ).rejects.toThrow(PricingResolutionError);
    });

    it('refuses neither', async () => {
      const { service } = build({});
      await expect(
        service.change({
          locationId: 15,
          enrolmentId: 500,
          reason: 'x',
          changedByUserId: 7,
        }),
      ).rejects.toThrow(PricingResolutionError);
    });

    it('refuses a blank reason, because this moves money', async () => {
      const { service } = build({});
      await expect(
        service.change({
          locationId: 15,
          enrolmentId: 500,
          pricingTier: 3,
          reason: '   ',
          changedByUserId: 7,
        }),
      ).rejects.toThrow(PricingResolutionError);
    });

    it('refuses at a location outside the rollout', async () => {
      const { service } = build({ rolloutOn: false });
      await expect(
        service.change({
          locationId: 22,
          enrolmentId: 500,
          pricingTier: 3,
          reason: 'why',
          changedByUserId: 7,
        }),
      ).rejects.toThrow(PricingResolutionError);
    });

    // A marker program holds a frozen older sheet, so it has no tier to move
    // between - the same rule that stops one being quoted a tier at creation.
    /**
     * Brampton West met the old shared message on 2026-09-02 and reported only
     * that "Instrument is not on the list", which reads as a fault rather than
     * as missing setup. The two refusals want opposite responses, so they are
     * worded differently.
     */
    it('names an unclassified program and says what has to happen to it', async () => {
      const { service } = build({
        tierable: false,
        retired: false,
        programName: 'Instrument',
      });

      await expect(
        service.change({
          locationId: 15,
          enrolmentId: 500,
          pricingTier: 2,
          reason: 'why',
          changedByUserId: 7,
        }),
      ).rejects.toThrow(/Instrument has not been given a pricing category/);
    });

    it('tells a retired program it keeps the rate it has', async () => {
      const { service } = build({
        tierable: false,
        retired: true,
        programName: 'xPiano Core',
      });

      await expect(
        service.change({
          locationId: 15,
          enrolmentId: 500,
          pricingTier: 2,
          reason: 'why',
          changedByUserId: 7,
        }),
      ).rejects.toThrow(/xPiano Core is a retired program/);
    });

    it('refuses a program that holds an older price sheet', async () => {
      const { service } = build({ tierable: false });
      await expect(
        service.change({
          locationId: 15,
          enrolmentId: 500,
          pricingTier: 3,
          reason: 'why',
          changedByUserId: 7,
        }),
      ).rejects.toThrow(PricingResolutionError);
    });

    it('refuses an enrolment belonging to another location', async () => {
      const { service } = build({ course: null });
      await expect(
        service.change({
          locationId: 15,
          enrolmentId: 500,
          pricingTier: 3,
          reason: 'why',
          changedByUserId: 7,
        }),
      ).rejects.toThrow(PricingResolutionError);
    });
  });

  describe('moving to the previous rate', () => {
    it('reports real pre-September history as authoritative', async () => {
      const { service } = build({});

      await expect(service.previousRateOption(15, 500)).resolves.toEqual({
        hourlyRate: 65,
        source: 'course_history',
        requiresConfirmation: false,
      });
    });

    it('collapses the cutover split into one period at the old rate', async () => {
      const { service, written } = build({ lessons: [lesson()] });

      const result = await service.change({
        locationId: 15,
        enrolmentId: 500,
        keepsPreviousRate: true,
        reason: 'Agreed with the parent',
        changedByUserId: 7,
      });

      expect(written.ratesDeleted).toBe(1);
      expect(written.rates).toHaveLength(1);
      expect(Number(written.rates[0].programRate)).toBe(65);
      expect(result.basis).toBe('Previous rate');
    });

    it.each([1, 2, 3])(
      'restores the historical rate after an old-rate enrolment moved to tier %i',
      async (pricingTier) => {
        const { service, written } = build({
          enrolment: {
            id: 500,
            courseId: 900,
            isDeleted: false,
            pricingTier,
          },
          lessons: [lesson({ programRate: 87.5, total: 43.75 })],
        });

        await service.change({
          locationId: 15,
          enrolmentId: 500,
          keepsPreviousRate: true,
          reason: 'Return to the agreed previous rate',
          changedByUserId: 7,
        });

        expect(written.rates[0].programRate).toBe(65);
        expect(written.lessonUpdates[0].changes.programRate).toBe(65);
      },
    );

    describe('when a newly created tier enrolment has no pre-September row', () => {
      const postCutoverCourse = {
        id: 900,
        locationId: 15,
        programId: 64,
        startDate: '2026-09-05',
        endDate: '2027-09-04',
      };
      const tierOnlyRates = [
        {
          id: 2,
          courseId: 900,
          startDate: '2026-09-05',
          endDate: '2027-09-04',
          programRate: 87.5,
        },
      ];

      it('offers program.rate as an editable suggestion', async () => {
        const { service } = build({
          course: postCutoverCourse,
          rates: tierOnlyRates,
          program: {
            id: 64,
            name: 'Piano Core',
            pricingCategory: 'standard',
            type: 1,
            rate: 65,
          },
        });

        await expect(service.previousRateOption(15, 500)).resolves.toEqual({
          hourlyRate: 65,
          source: 'program_default',
          requiresConfirmation: true,
        });
      });

      it('refuses to move money until the suggested rate is confirmed', async () => {
        const { service, written } = build({
          course: postCutoverCourse,
          rates: tierOnlyRates,
          lessons: [lesson({ date: '2026-09-12' })],
        });

        await expect(
          service.change({
            locationId: 15,
            enrolmentId: 500,
            keepsPreviousRate: true,
            reason: 'Use the previous price',
            changedByUserId: 7,
          }),
        ).rejects.toThrow(/Confirm the previous hourly rate/);

        expect(written.rates).toHaveLength(0);
        expect(written.lessonUpdates).toHaveLength(0);
        expect(written.enrolmentUpdates).toHaveLength(0);
      });

      it('applies an edited confirmed rate and remembers it', async () => {
        const { service, written } = build({
          course: postCutoverCourse,
          rates: tierOnlyRates,
          lessons: [
            lesson({
              date: '2026-09-12',
              duration: '00:45:00',
              programRate: 87.5,
              total: 65.625,
            }),
          ],
        });

        await service.change({
          locationId: 15,
          enrolmentId: 500,
          keepsPreviousRate: true,
          confirmedPreviousRate: 63.25,
          reason: 'Confirmed with the parent',
          changedByUserId: 7,
        });

        expect(written.rates[0].programRate).toBe(63.25);
        expect(written.lessonUpdates[0].changes.programRate).toBe(63.25);
        expect(written.lessonUpdates[0].changes.total).toBeCloseTo(47.44, 2);
        expect(written.enrolmentUpdates[0].confirmedPreviousRate).toBe(63.25);
        expect(written.tierChanges[0].reason).toContain(
          '$63.25/hour (confirmed)',
        );
      });

      it('lets an already affected Previous rate enrolment reapply the confirmed amount', async () => {
        const { service, written } = build({
          enrolment: {
            id: 500,
            courseId: 900,
            isDeleted: false,
            pricingTier: null,
            keepsPreviousRate: true,
            confirmedPreviousRate: null,
          },
          course: postCutoverCourse,
          rates: tierOnlyRates,
          lessons: [
            lesson({
              date: '2026-09-12',
              programRate: 87.5,
              total: 43.75,
            }),
          ],
        });

        await service.change({
          locationId: 15,
          enrolmentId: 500,
          keepsPreviousRate: true,
          confirmedPreviousRate: 65,
          reason: 'Repair the earlier fallback',
          changedByUserId: 7,
        });

        expect(written.rates[0].programRate).toBe(65);
        expect(written.lessonUpdates[0].changes.programRate).toBe(65);
      });

      it('offers the last confirmed amount instead of replacing it with program.rate', async () => {
        const { service } = build({
          enrolment: {
            id: 500,
            courseId: 900,
            isDeleted: false,
            pricingTier: 2,
            keepsPreviousRate: false,
            confirmedPreviousRate: 63.25,
          },
          course: postCutoverCourse,
          rates: tierOnlyRates,
        });

        await expect(service.previousRateOption(15, 500)).resolves.toEqual({
          hourlyRate: 63.25,
          source: 'confirmed_previous_rate',
          requiresConfirmation: true,
        });
      });
    });

    it('does not let a supplied fallback override real course history', async () => {
      const { service, written } = build({ lessons: [lesson()] });

      await expect(
        service.change({
          locationId: 15,
          enrolmentId: 500,
          keepsPreviousRate: true,
          confirmedPreviousRate: 50,
          reason: 'Attempted override',
          changedByUserId: 7,
        }),
      ).rejects.toThrow(/historical previous rate/);

      expect(written.rates).toHaveLength(0);
      expect(written.lessonUpdates).toHaveLength(0);
    });

    it('re-prices a future lesson down to the held rate', async () => {
      const { service, written } = build({ lessons: [lesson()] });

      await service.change({
        locationId: 15,
        enrolmentId: 500,
        keepsPreviousRate: true,
        reason: 'Agreed',
        changedByUserId: 7,
      });

      expect(written.lessonUpdates).toHaveLength(1);
      expect(written.lessonUpdates[0].changes.programRate).toBe(65);
    });

    it('records who held it and why', async () => {
      const { service, written } = build({ lessons: [] });

      await service.change({
        locationId: 15,
        enrolmentId: 500,
        keepsPreviousRate: true,
        reason: 'Committed before September',
        changedByUserId: 7,
      });

      const update = written.enrolmentUpdates[0];
      expect(update.pricingTier).toBeNull();
      expect(update.keepsPreviousRate).toBe(true);
      expect(update.previousRateReason).toBe('Committed before September');
      expect(update.previousRateApprovedByUserId).toBe(7);
    });

    // NULL, not 0. This codebase already has a real enrolment with id 0 and an
    // EXISTS() that returns the truthy string "0"; a third zero-means-absent
    // convention in a money audit table is how the next person loses a day.
    it('audits the move with no tier rather than tier zero', async () => {
      const { service, written } = build({ lessons: [] });

      await service.change({
        locationId: 15,
        enrolmentId: 500,
        keepsPreviousRate: true,
        reason: 'Agreed',
        changedByUserId: 7,
      });

      expect(written.tierChanges).toHaveLength(1);
      expect(written.tierChanges[0].newTier).toBeNull();
      expect(written.tierChanges[0].previousTier).toBe(2);
      expect(written.tierChanges[0].reason).toContain('Agreed');
    });
  });

  describe('moving to a tier', () => {
    it('re-prices the prepaid cycles, after the lessons and not before', async () => {
      // The prepaid reduction is `gross - payable`, read off each lesson's own
      // rate. Run before `repriceLessons` it would be computed against the old
      // gross, come out undersized, and the customer would end up paying more
      // than the published cycle total - the one thing the published-figure
      // rule exists to prevent.
      const { service, enrolmentPrepaidPricing } = build({
        lessons: [],
        rates: [
          {
            id: 1,
            courseId: 900,
            startDate: '2026-08-24',
            endDate: '2026-12-31',
            programRate: 65,
          },
        ],
      });

      await service.change({
        enrolmentId: 500,
        locationId: 15,
        pricingTier: 2,
        reason: 'Parent agreed the new rate',
        changedByUserId: 7,
      });

      expect(enrolmentPrepaidPricing.applyForEnrolment).toHaveBeenCalledWith(
        expect.objectContaining({ enrolmentId: 500 }),
        expect.anything(),
      );
    });

    it('splits at the cutover and prices the far side from the catalogue', async () => {
      const { service, written } = build({
        lessons: [],
        rates: [
          {
            id: 1,
            courseId: 900,
            startDate: '2026-08-24',
            endDate: '2026-12-31',
            programRate: 65,
          },
        ],
      });

      await service.change({
        locationId: 15,
        enrolmentId: 500,
        pricingTier: 2,
        reason: 'Corrected after review',
        changedByUserId: 7,
      });

      expect(written.rates).toHaveLength(2);
      expect(Number(written.rates[0].programRate)).toBe(65);
      expect(Number(written.rates[1].programRate)).toBe(87.5);
    });

    it('clears the held flag and its audit fields', async () => {
      const { service, written } = build({ lessons: [] });

      await service.change({
        locationId: 15,
        enrolmentId: 500,
        pricingTier: 3,
        reason: 'Corrected',
        changedByUserId: 7,
      });

      const update = written.enrolmentUpdates[0];
      expect(update.keepsPreviousRate).toBe(false);
      expect(update.previousRateReason).toBeNull();
      expect(update.previousRateApprovedByUserId).toBeNull();
      expect(update.pricingTier).toBe(3);
      // A staff correction is never a default, whatever it was before.
      expect(update.pricingTierIsDefaulted).toBe(false);
    });
  });

  /**
   * Choosing the day a new price starts.
   *
   * Arcadia asked for this on 2026-09-02: *"it would be beneficial to have the
   * ability to select a specific effective date when changing pricing, for
   * example new pricing effective December 1 or August 1, 2027."*
   *
   * Omitting it keeps the September cutover, so nothing changes for a caller
   * that does not send one.
   */
  describe('choosing when the new price starts', () => {
    it('splits the rate at the day given, not at the September cutover', async () => {
      const { service, written } = build({
        lessons: [],
        rates: [
          {
            id: 1,
            courseId: 900,
            startDate: '2026-08-24',
            endDate: '2027-12-31',
            programRate: 65,
          },
        ],
        course: {
          id: 900,
          locationId: 15,
          programId: 64,
          startDate: '2026-08-24',
          endDate: '2027-12-31',
        },
      });

      await service.change({
        locationId: 15,
        enrolmentId: 500,
        pricingTier: 2,
        reason: 'From December',
        changedByUserId: 7,
        effectiveFrom: '2026-12-01',
      });

      expect(written.rates).toHaveLength(2);
      const day = (v: unknown) =>
        new Date(v as string).toISOString().slice(0, 10);
      expect(day(written.rates[0].endDate)).toBe('2026-11-30');
      expect(day(written.rates[1].startDate)).toBe('2026-12-01');
      expect(Number(written.rates[1].programRate)).toBe(87.5);
    });

    it('still uses the September cutover when no day is given', async () => {
      const { service, written } = build({
        lessons: [],
        rates: [
          {
            id: 1,
            courseId: 900,
            startDate: '2026-08-24',
            endDate: '2026-12-31',
            programRate: 65,
          },
        ],
      });

      await service.change({
        locationId: 15,
        enrolmentId: 500,
        pricingTier: 2,
        reason: 'No date given',
        changedByUserId: 7,
      });

      expect(written.rates).toHaveLength(2);
      expect(
        new Date(written.rates[1].startDate as string)
          .toISOString()
          .slice(0, 10),
      ).toBe('2026-09-01');
    });

    it('records the chosen day on the audit row', async () => {
      const { service, written } = build({ lessons: [] });

      await service.change({
        locationId: 15,
        enrolmentId: 500,
        pricingTier: 2,
        reason: 'From December',
        changedByUserId: 7,
        effectiveFrom: '2026-12-01',
      });

      expect(written.tierChanges).toHaveLength(1);
      expect(
        new Date(written.tierChanges[0].effectiveFrom as string)
          .toISOString()
          .slice(0, 10),
      ).toBe('2026-12-01');
    });

    it('refuses a day after the enrolment has ended', async () => {
      const { service } = build({
        lessons: [],
        course: {
          id: 900,
          locationId: 15,
          programId: 64,
          startDate: '2026-09-07',
          endDate: '2026-11-16',
        },
      });

      await expect(
        service.change({
          locationId: 15,
          enrolmentId: 500,
          pricingTier: 2,
          reason: 'Past the end',
          changedByUserId: 7,
          effectiveFrom: '2026-12-01',
        }),
      ).rejects.toThrow(/ends on 2026-11-16.*never apply/);
    });

    it('allows the last day of the enrolment', async () => {
      const { service, written } = build({
        lessons: [],
        rates: [
          {
            id: 1,
            courseId: 900,
            startDate: '2026-09-07',
            endDate: '2026-11-16',
            programRate: 65,
          },
        ],
        course: {
          id: 900,
          locationId: 15,
          programId: 64,
          startDate: '2026-09-07',
          endDate: '2026-11-16',
        },
      });

      await service.change({
        locationId: 15,
        enrolmentId: 500,
        pricingTier: 2,
        reason: 'On the last day',
        changedByUserId: 7,
        effectiveFrom: '2026-11-16',
      });

      expect(written.rates.length).toBeGreaterThan(0);
    });

    it('does not apply the end check when no date was given', async () => {
      const { service, written } = build({
        lessons: [],
        rates: [
          {
            id: 1,
            courseId: 900,
            startDate: '2026-08-24',
            endDate: '2026-08-31',
            programRate: 65,
          },
        ],
        course: {
          id: 900,
          locationId: 15,
          programId: 64,
          startDate: '2026-08-24',
          endDate: '2026-08-31',
        },
      });

      // Ends before the cutover, so the default would be "after the end" - but
      // an omitted date must keep behaving exactly as it did before.
      await service.change({
        locationId: 15,
        enrolmentId: 500,
        pricingTier: 2,
        reason: 'No date given',
        changedByUserId: 7,
      });

      expect(written.rates.length).toBeGreaterThan(0);
    });

    it('refuses a day before the tier structure existed', async () => {
      const { service } = build({ lessons: [] });

      await expect(
        service.change({
          locationId: 15,
          enrolmentId: 500,
          pricingTier: 2,
          reason: 'Too far back',
          changedByUserId: 7,
          effectiveFrom: '2026-08-01',
        }),
      ).rejects.toThrow(/cannot take effect before 2026-09-01/);
    });

    it('re-prices only the lessons on or after the chosen day', async () => {
      const { service, written } = build({
        lessons: [
          lesson({ id: 1, date: '2026-10-05', programRate: 65, total: 32.5 }),
          lesson({ id: 2, date: '2026-12-07', programRate: 65, total: 32.5 }),
        ],
        rates: [
          {
            id: 1,
            courseId: 900,
            startDate: '2026-08-24',
            endDate: '2027-12-31',
            programRate: 65,
          },
        ],
        course: {
          id: 900,
          locationId: 15,
          programId: 64,
          startDate: '2026-08-24',
          endDate: '2027-12-31',
        },
      });

      await service.change({
        locationId: 15,
        enrolmentId: 500,
        pricingTier: 2,
        reason: 'From December',
        changedByUserId: 7,
        effectiveFrom: '2026-12-01',
      });

      // October keeps $65; only December moves.
      expect(written.lessonUpdates.map((u) => u.id)).toEqual([2]);
    });
  });

  describe('what it leaves alone', () => {
    it('never re-prices an invoiced lesson', async () => {
      const { service, written } = build({
        lessons: [lesson({ id: 1 }), lesson({ id: 2 })],
        settled: [2],
      });

      const result = await service.change({
        locationId: 15,
        enrolmentId: 500,
        keepsPreviousRate: true,
        reason: 'Agreed',
        changedByUserId: 7,
      });

      expect(written.lessonUpdates.map((u) => u.id)).toEqual([1]);
      expect(result.skippedReasons.invoicedOrPaid).toBe(1);
    });

    /**
     * A deleted allocation must not freeze a lesson at its old rate.
     *
     * Arcadia hit this on 2026-09-01, the first working day on the September
     * structure. Change Price moved October onward to the new rate and left
     * September on the old one at Richmond Hill, Woodbridge and Burlington.
     * Every September lesson carried a `lesson_payment` row that had been
     * deleted; every October lesson carried none. Nothing had actually been
     * paid - `settledLessonIds` simply counted the dead row.
     *
     * Verified on the 2026-09-01 production snapshot against Edward Hao
     * (enrolment 23342, course 23062): lessons 5234628-31, all four September
     * dates, each with one `lesson_payment` row and none of them live.
     */
    it('re-prices a lesson whose only payment allocation was deleted', async () => {
      const { service, written } = build({
        lessons: [lesson({ id: 1 }), lesson({ id: 2 })],
        settledOnlyByDeletedRows: [2],
      });

      const result = await service.change({
        locationId: 15,
        enrolmentId: 500,
        keepsPreviousRate: true,
        reason: 'Agreed',
        changedByUserId: 7,
      });

      // Both move. Against the unguarded version lesson 2 was skipped.
      expect(written.lessonUpdates.map((u) => u.id)).toEqual([1, 2]);
      expect(result.skippedReasons.invoicedOrPaid).toBe(0);
    });

    it('re-prices a lesson whose invoice line or invoice was deleted', async () => {
      const { service, written } = build({
        lessons: [lesson({ id: 1 }), lesson({ id: 2 })],
        settledOnlyByDeletedRows: [2],
      });

      await service.change({
        locationId: 15,
        enrolmentId: 500,
        keepsPreviousRate: true,
        reason: 'Agreed',
        changedByUserId: 7,
      });

      expect(written.lessonUpdates.map((u) => u.id)).toContain(2);
    });

    it('still refuses a lesson with a live payment or a live invoice', async () => {
      const { service, written, sqlSeen } = build({
        lessons: [lesson({ id: 1 }), lesson({ id: 2 })],
        settled: [2],
      });

      const result = await service.change({
        locationId: 15,
        enrolmentId: 500,
        keepsPreviousRate: true,
        reason: 'Agreed',
        changedByUserId: 7,
      });

      expect(written.lessonUpdates.map((u) => u.id)).toEqual([1]);
      expect(result.skippedReasons.invoicedOrPaid).toBe(1);

      // The guards are the fix; assert they are actually in the SQL so they
      // cannot be dropped while the behavioural tests still pass on a fake.
      const invoiceSql =
        sqlSeen.find((q) => /invoice_item_lesson/.test(q)) ?? '';
      expect(invoiceSql).toMatch(/ili\.isDeleted\s*=\s*0/);
      expect(invoiceSql).toMatch(/inv\.isDeleted\s*=\s*0/);
      expect(invoiceSql).toMatch(/inv\.isCanceled\s*=\s*0/);
      expect(invoiceSql).toMatch(/inv\.isVoid\s*=\s*0/);

      const paymentSql = sqlSeen.find((q) => /lesson_payment/.test(q)) ?? '';
      expect(paymentSql).toMatch(/lp\.isDeleted\s*=\s*0/);
      expect(paymentSql).toMatch(/p\.isDeleted\s*=\s*0/);
    });

    /**
     * A lesson that has already happened IS re-priced.
     *
     * This test asserted the opposite - that a past lesson was skipped, with
     * `skippedReasons.inThePast` of 1. That made the outcome depend on the day
     * the change was made rather than the date it took effect, and the boundary
     * advanced daily.
     *
     * Arcadia set the rule out on 2026-09-02: *"the effective date of the
     * pricing change should determine the lesson price, not the date the
     * payment is processed."*
     *
     * Earlier lessons are protected by the rate periods, not by this guard -
     * see the cutover test below.
     */
    it('re-prices a lesson that has already happened', async () => {
      const { service, written } = build({
        lessons: [lesson({ id: 1, date: '2020-01-01' })],
      });

      const result = await service.change({
        locationId: 15,
        enrolmentId: 500,
        keepsPreviousRate: true,
        reason: 'Agreed',
        changedByUserId: 7,
      });

      expect(result.skippedReasons.inThePast).toBe(0);
      expect(result.lessonsRepriced).toBe(1);
    });

    /**
     * Ashif's worked examples, 2026-09-02. Today is not what decides it.
     *
     * Example 1: a student moved to a tier effective 1 September, with the
     * payment taken later in the month or in October. Every September lesson
     * takes the new rate, including the ones already behind us.
     *
     * The first lesson is dated 1 September deliberately - the cutover itself,
     * and a date already in the past. Under the old guard it was skipped, which
     * is what made "the first week of September" behave differently from the
     * rest. This test discriminates for as long as today is after 1 September
     * 2026; the three later dates alone would have passed either way.
     */
    it('re-prices every lesson on or after the cutover, whatever today is', async () => {
      const { service, written } = build({
        lessons: [
          lesson({ id: 1, date: '2026-09-01', programRate: 65, total: 32.5 }),
          lesson({ id: 2, date: '2026-09-10', programRate: 65, total: 32.5 }),
          lesson({ id: 3, date: '2026-09-17', programRate: 65, total: 32.5 }),
          lesson({ id: 4, date: '2026-09-24', programRate: 65, total: 32.5 }),
        ],
      });

      const result = await service.change({
        locationId: 15,
        enrolmentId: 500,
        pricingTier: 2,
        reason: 'New tier from September',
        changedByUserId: 7,
      });

      expect(written.lessonUpdates.map((u) => u.id)).toEqual([1, 2, 3, 4]);
      expect(result.skippedReasons.inThePast).toBe(0);
    });

    /**
     * ...and a lesson BEFORE the cutover still keeps its old price. That is the
     * rate periods doing the work, not a date guard: the August lesson resolves
     * to the August rate and falls out at `newRate === oldRate`.
     */
    it('leaves a lesson before the cutover on its old price', async () => {
      const { service, written } = build({
        lessons: [
          lesson({ id: 1, date: '2026-08-24', programRate: 65, total: 32.5 }),
          lesson({ id: 2, date: '2026-09-07', programRate: 65, total: 32.5 }),
        ],
      });

      await service.change({
        locationId: 15,
        enrolmentId: 500,
        pricingTier: 2,
        reason: 'New tier from September',
        changedByUserId: 7,
      });

      // Only the September lesson moves.
      expect(written.lessonUpdates.map((u) => u.id)).toEqual([2]);
    });

    // 4 = CANCELED. This used to assert on status 99, which is not a status the
    // system can produce, so it passed whatever the rule was.
    it('leaves a cancelled lesson alone', async () => {
      const { service, written } = build({
        lessons: [lesson({ id: 1, status: 4 })],
      });

      const result = await service.change({
        locationId: 15,
        enrolmentId: 500,
        keepsPreviousRate: true,
        reason: 'Agreed',
        changedByUserId: 7,
      });

      expect(written.lessonUpdates).toHaveLength(0);
      expect(result.skippedReasons.notScheduled).toBe(1);
    });

    /**
     * 5 = UNSCHEDULED. A credit the family still holds, so it has to be worth
     * what the enrolment now charges.
     *
     * Woodbridge reported this on 2026-09-03 for Cathy and Carly Li: two Vocal
     * Contemporary credits sat on $72.50/hr while every scheduled lesson moved
     * to $80.00.
     */
    it('re-prices an unscheduled lesson', async () => {
      const { service, written } = build({
        lessons: [lesson({ id: 1, status: 5, programRate: 65, total: 32.5 })],
      });

      const result = await service.change({
        locationId: 15,
        enrolmentId: 500,
        pricingTier: 2,
        reason: 'Family agreed to the new pricing',
        changedByUserId: 7,
      });

      expect(written.lessonUpdates.map((u) => u.id)).toEqual([1]);
      expect(result.skippedReasons.notScheduled).toBe(0);
    });

    /**
     * The case that actually occurs: on production an unscheduled lesson has
     * `date: NULL` - verified 2026-09-03 on Cathy Li's lesson 4751230, billed
     * $35.00 with no date at all.
     *
     * This pins the outcome rather than catching a break: the old code reached
     * the same rate, but only because `String(null)` sorts after every digit,
     * so every period looked ended and the last one was carried forward. The
     * test exists so that stays true when the resolver changes.
     */
    it('re-prices an unscheduled lesson that has no date', async () => {
      const { service, written } = build({
        lessons: [
          lesson({
            id: 1,
            status: 5,
            programRate: 65,
            total: 32.5,
            date: null,
          }),
        ],
      });

      const result = await service.change({
        locationId: 15,
        enrolmentId: 500,
        pricingTier: 2,
        reason: 'Family agreed to the new pricing',
        changedByUserId: 7,
      });

      expect(written.lessonUpdates.map((u) => u.id)).toEqual([1]);
      expect(result.skippedReasons.notScheduled).toBe(0);
    });

    it('still protects an unscheduled lesson that has been paid for', async () => {
      const { service, written } = build({
        lessons: [lesson({ id: 1, status: 5 })],
        settled: [1],
      });

      const result = await service.change({
        locationId: 15,
        enrolmentId: 500,
        pricingTier: 2,
        reason: 'Already paid',
        changedByUserId: 7,
      });

      expect(written.lessonUpdates).toHaveLength(0);
      expect(result.skippedReasons.invoicedOrPaid).toBe(1);
    });

    // The customer keeps the reduction they were given: a lesson discounted
    // from 87.50 to 80.00 moving to 65.00 lands at 59.43, not 65.00.
    it('scales the total so an existing discount survives', async () => {
      const { service, written } = build({
        lessons: [lesson({ id: 1, programRate: 87.5, total: 80 })],
      });

      await service.change({
        locationId: 15,
        enrolmentId: 500,
        keepsPreviousRate: true,
        reason: 'Agreed',
        changedByUserId: 7,
      });

      expect(written.lessonUpdates[0].changes.total).toBeCloseTo(59.43, 2);
    });

    it('reports both counts, because they are different questions', async () => {
      const { service } = build({
        lessons: [
          lesson({ id: 1 }),
          lesson({ id: 2, date: '2020-01-01' }),
          lesson({ id: 3 }),
        ],
        settled: [3],
      });

      const result = await service.change({
        locationId: 15,
        enrolmentId: 500,
        keepsPreviousRate: true,
        reason: 'Agreed',
        changedByUserId: 7,
      });

      // Was 1 re-priced / 2 skipped, the second skip being the 2020 lesson.
      // A past lesson is now re-priced like any other, so only the settled one
      // is left alone.
      expect(result.lessonsRepriced).toBe(2);
      expect(result.lessonsSkipped).toBe(1);
    });
  });

  describe('exploded lesson repricing', () => {
    it('preserves the parent total when rescheduled children move to a tier rate', async () => {
      const { service, written, manager } = build({
        lessons: [
          lesson({
            id: 100,
            date: '2026-09-23T10:00:00.000Z',
            duration: '00:30:00',
            status: 4,
            isExploded: 0,
            programRate: 65,
            total: 32.5,
          }),
          lesson({
            id: 101,
            date: '2026-09-23T10:00:00.000Z',
            duration: '00:15:00',
            status: 4,
            isExploded: 1,
            programRate: 65,
            total: 16.25,
          }),
          lesson({
            id: 102,
            date: '2026-09-23T10:15:00.000Z',
            duration: '00:15:00',
            status: 4,
            isExploded: 1,
            programRate: 65,
            total: 16.25,
          }),
          lesson({
            id: 201,
            date: '2026-10-10T12:30:00.000Z',
            duration: '00:15:00',
            status: 1,
            isExploded: 1,
            programRate: 65,
            total: 16.25,
          }),
          lesson({
            id: 202,
            date: '2026-10-17T14:30:00.000Z',
            duration: '00:15:00',
            status: 1,
            isExploded: 1,
            programRate: 65,
            total: 16.25,
          }),
        ],
        hourlyRate: '72.50',
        explodedLineage: [
          {
            lessonId: 201,
            explodedParentId: 101,
            explodedBranchId: 201,
            explodedBranchDate: '2026-10-10T12:30:00.000Z',
            descendantDepth: 0,
            splitCount: 1,
          },
          {
            lessonId: 201,
            explodedParentId: 100,
            explodedBranchId: 101,
            explodedBranchDate: '2026-09-23T10:00:00.000Z',
            descendantDepth: 1,
            splitCount: 2,
          },
          {
            lessonId: 202,
            explodedParentId: 102,
            explodedBranchId: 202,
            explodedBranchDate: '2026-10-17T14:30:00.000Z',
            descendantDepth: 0,
            splitCount: 1,
          },
          {
            lessonId: 202,
            explodedParentId: 100,
            explodedBranchId: 102,
            explodedBranchDate: '2026-09-23T10:15:00.000Z',
            descendantDepth: 1,
            splitCount: 2,
          },
        ],
      });

      await service.change({
        locationId: 15,
        enrolmentId: 500,
        pricingTier: 1,
        reason: 'moving onto tier 1',
        changedByUserId: 7,
      });

      const childUpdates = written.lessonUpdates.filter(({ id }) =>
        [201, 202].includes(id),
      );
      expect(childUpdates).toEqual([
        {
          id: 201,
          changes: expect.objectContaining({
            programRate: 72.52,
            total: 18.13,
          }),
        },
        {
          id: 202,
          changes: expect.objectContaining({
            programRate: 72.48,
            total: 18.12,
          }),
        },
      ]);

      const privateLessonParams = manager.query.mock.calls
        .filter((call: any[]) => /UPDATE private_lesson/i.test(String(call[0])))
        .map((call: any[]) => call[1]);
      expect(privateLessonParams).toEqual([
        [18.13, 18.13, 201],
        [18.12, 18.12, 202],
      ]);
    });

    it('preserves a 7% discounted total through reschedule lineage', async () => {
      const paymentFrequency = LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY;
      const pfDiscount = discount(paymentFrequency, 7, 1);
      const { service, written, manager } = build({
        lessons: [
          lesson({
            id: 100,
            duration: '00:30:00',
            status: 4,
            isExploded: 0,
            programRate: 87.5,
            total: 40.69,
            discounts: [pfDiscount],
          }),
          lesson({
            id: 201,
            date: '2026-09-25T13:15:00.000Z',
            duration: '00:15:00',
            status: 1,
            isExploded: 1,
            programRate: 87.52,
            total: 20.35,
            discounts: [discount(paymentFrequency, 7, 1)],
          }),
          lesson({
            id: 202,
            date: '2026-09-26T13:15:00.000Z',
            duration: '00:15:00',
            status: 1,
            isExploded: 1,
            programRate: 87.48,
            total: 20.34,
            discounts: [discount(paymentFrequency, 7, 1)],
          }),
        ],
        hourlyRate: '72.50',
        explodedLineage: [
          {
            lessonId: 201,
            explodedParentId: 101,
            explodedBranchId: 201,
            explodedBranchDate: '2026-09-25T13:15:00.000Z',
            descendantDepth: 0,
            splitCount: 1,
          },
          {
            lessonId: 201,
            explodedParentId: 100,
            explodedBranchId: 101,
            explodedBranchDate: '2026-09-24T14:30:00.000Z',
            descendantDepth: 1,
            splitCount: 2,
          },
          {
            lessonId: 202,
            explodedParentId: 102,
            explodedBranchId: 202,
            explodedBranchDate: '2026-09-26T13:15:00.000Z',
            descendantDepth: 0,
            splitCount: 1,
          },
          {
            lessonId: 202,
            explodedParentId: 100,
            explodedBranchId: 102,
            explodedBranchDate: '2026-09-24T14:45:00.000Z',
            descendantDepth: 1,
            splitCount: 2,
          },
        ],
      });

      await service.change({
        locationId: 15,
        enrolmentId: 500,
        pricingTier: 1,
        reason: 'move rescheduled discounted children onto tier 1',
        changedByUserId: 7,
      });

      const childUpdates = written.lessonUpdates.filter(({ id }) =>
        [201, 202].includes(id),
      );
      expect(childUpdates).toEqual([
        {
          id: 201,
          changes: expect.objectContaining({
            programRate: 72.52,
            total: 16.86,
          }),
        },
        {
          id: 202,
          changes: expect.objectContaining({
            programRate: 72.48,
            total: 16.85,
          }),
        },
      ]);

      const privateLessonParams = manager.query.mock.calls
        .filter((call: any[]) => /UPDATE private_lesson/i.test(String(call[0])))
        .map((call: any[]) => call[1]);
      expect(privateLessonParams).toEqual([
        [16.86, 16.86, 201],
        [16.85, 16.85, 202],
      ]);
    });

    it('preserves the aggregate billed total when exploded discounts are unchanged', async () => {
      const paymentFrequency = LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY;
      const multipleEnrolment = LessonDiscount.TYPE_MULTIPLE_ENROLMENT;
      const { service, written, manager } = build({
        lessons: [
          lesson({
            id: 100,
            duration: '00:30:00',
            status: 4,
            isExploded: 0,
            programRate: 65,
            total: 30.31,
            discounts: [
              discount(multipleEnrolment, 1.25),
              discount(paymentFrequency, 3, 1),
            ],
          }),
          lesson({
            id: 201,
            date: '2026-10-10T12:30:00.000Z',
            duration: '00:15:00',
            status: 1,
            isExploded: 1,
            programRate: 65,
            total: 15.15,
            discounts: [
              discount(multipleEnrolment, 0.63),
              discount(paymentFrequency, 3, 1),
            ],
          }),
          lesson({
            id: 202,
            date: '2026-10-17T14:30:00.000Z',
            duration: '00:15:00',
            status: 1,
            isExploded: 1,
            programRate: 65,
            total: 15.16,
            discounts: [
              discount(multipleEnrolment, 0.62),
              discount(paymentFrequency, 3, 1),
            ],
          }),
        ],
        hourlyRate: '72.50',
        explodedLineage: [
          {
            lessonId: 201,
            explodedParentId: 100,
            explodedBranchId: 101,
            explodedBranchDate: '2026-09-23T10:00:00.000Z',
            descendantDepth: 1,
            splitCount: 2,
          },
          {
            lessonId: 202,
            explodedParentId: 100,
            explodedBranchId: 102,
            explodedBranchDate: '2026-09-23T10:15:00.000Z',
            descendantDepth: 1,
            splitCount: 2,
          },
        ],
      });

      await service.change({
        locationId: 15,
        enrolmentId: 500,
        pricingTier: 1,
        reason: 'moving discounted children onto tier 1',
        changedByUserId: 7,
      });

      const childUpdates = written.lessonUpdates.filter(({ id }) =>
        [201, 202].includes(id),
      );
      expect(childUpdates).toEqual([
        {
          id: 201,
          changes: expect.objectContaining({
            programRate: 72.52,
            total: 16.98,
          }),
        },
        {
          id: 202,
          changes: expect.objectContaining({
            programRate: 72.48,
            total: 16.97,
          }),
        },
      ]);

      const privateLessonParams = manager.query.mock.calls
        .filter((call: any[]) => /UPDATE private_lesson/i.test(String(call[0])))
        .map((call: any[]) => call[1]);
      expect(privateLessonParams).toEqual([
        [16.98, 16.98, 201],
        [16.97, 16.97, 202],
      ]);
    });

    it('does not reconcile an exploded family when one child is settled', async () => {
      const { service, written, manager } = build({
        lessons: [
          lesson({
            id: 100,
            duration: '00:30:00',
            status: 4,
            isExploded: 0,
            programRate: 65,
            total: 32.5,
          }),
          lesson({
            id: 201,
            date: '2026-10-10T12:30:00.000Z',
            duration: '00:15:00',
            status: 1,
            isExploded: 1,
            programRate: 65,
            total: 16.25,
          }),
          lesson({
            id: 202,
            date: '2026-10-17T14:30:00.000Z',
            duration: '00:15:00',
            status: 1,
            isExploded: 1,
            programRate: 65,
            total: 16.25,
          }),
        ],
        settled: [202],
        hourlyRate: '72.50',
        explodedLineage: [
          {
            lessonId: 201,
            explodedParentId: 100,
            explodedBranchId: 101,
            explodedBranchDate: '2026-09-23T10:00:00.000Z',
            descendantDepth: 1,
            splitCount: 2,
          },
          {
            lessonId: 202,
            explodedParentId: 100,
            explodedBranchId: 102,
            explodedBranchDate: '2026-09-23T10:15:00.000Z',
            descendantDepth: 1,
            splitCount: 2,
          },
        ],
      });

      await service.change({
        locationId: 15,
        enrolmentId: 500,
        pricingTier: 1,
        reason: 'moving only unsettled lessons onto tier 1',
        changedByUserId: 7,
      });

      expect(
        written.lessonUpdates.filter(({ id }) => [201, 202].includes(id)),
      ).toEqual([
        {
          id: 201,
          changes: expect.objectContaining({ programRate: 72.5, total: 18.13 }),
        },
      ]);
      const privateLessonParams = manager.query.mock.calls
        .filter((call: any[]) => /UPDATE private_lesson/i.test(String(call[0])))
        .map((call: any[]) => call[1]);
      expect(privateLessonParams).toEqual([[18.13, 18.13, 201]]);
    });
  });

  /**
   * `private_lesson` carries its own copy of the money and is what the Receive
   * Payment screen reads. Updating only `lesson` bills the customer the old
   * amount while every pricing screen reports the new one.
   *
   * Found on dev 2026-08-19: enrolment 33560 moved back to its previous rate
   * had `lesson.total` $32.50 but `private_lesson.total` still $43.75, so a
   * grandfathered customer would have been charged the tier price.
   */
  describe('the private_lesson copy of the money', () => {
    it('mirrors the new lesson total', async () => {
      const { service, manager } = build({
        lessons: [lesson({ id: 91, programRate: '65.00', total: '32.50' })],
        hourlyRate: '87.50',
      });

      await service.change({
        locationId: 15,
        enrolmentId: 500,
        pricingTier: 2,
        reason: 'moving onto a tier',
        changedByUserId: 7,
      });

      const updates = manager.query.mock.calls
        .map((call: any[]) => String(call[0]))
        .filter((sql: string) => /UPDATE private_lesson/i.test(sql));

      expect(updates).toHaveLength(1);
      expect(updates[0]).toMatch(/SET total = \?, balance = \?/i);

      const params = manager.query.mock.calls.find((call: any[]) =>
        /UPDATE private_lesson/i.test(String(call[0])),
      )?.[1];

      // total, balance, lessonId - $32.50 scaled 65 -> 87.50 is $43.75
      expect(params).toEqual([43.75, 43.75, 91]);
    });

    it('keeps the discount instead of copying the gross', async () => {
      const { service, manager } = build({
        lessons: [
          lesson({
            id: 93,
            programRate: '65.00',
            total: '32.50',
            discounts: [
              discount(LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY, 10, 1),
            ],
          }),
        ],
        hourlyRate: '87.50',
      });

      await service.change({
        locationId: 15,
        enrolmentId: 500,
        pricingTier: 2,
        reason: 'moving onto a tier',
        changedByUserId: 7,
      });

      const params = manager.query.mock.calls.find((call: any[]) =>
        /UPDATE private_lesson/i.test(String(call[0])),
      )?.[1];

      // $32.50 gross -> $43.75, and 90% of that is $39.38, not $43.75.
      expect(params).toEqual([39.38, 39.38, 93]);
    });

    it('does not lose a cent re-deriving the discount from rounded dollars', async () => {
      // Arcadia, 2026-08-26. A 3% payment-frequency discount on a $32.50
      // lesson is billed $31.53, and the service used to rebuild the discount
      // as 31.53/32.50 = 0.9701538 rather than 0.97. Re-priced to the Tier 1
      // rate that gave $35.17 a lesson, and twelve of them billed $422.04
      // against a published $422.00.
      const { service, manager } = build({
        lessons: [
          lesson({
            id: 95,
            programRate: '65.00',
            total: '32.50',
            discounts: [
              discount(LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY, 3, 1),
            ],
          }),
        ],
        hourlyRate: '72.50',
      });

      await service.change({
        locationId: 15,
        enrolmentId: 500,
        pricingTier: 1,
        reason: 'moving onto a tier',
        changedByUserId: 7,
      });

      const params = manager.query.mock.calls.find((call: any[]) =>
        /UPDATE private_lesson/i.test(String(call[0])),
      )?.[1];

      // $36.25 gross less 3% is $35.1625, which rounds to $35.16 - not the
      // $35.17 the reconstructed ratio produced.
      expect(params).toEqual([35.16, 35.16, 95]);
    });

    it('lets the prepaid amount govern, ignoring the percentage', async () => {
      // The other half of the same report. A prepaid cycle carries a dollar
      // amount that already has the prepaid saving in it, so the
      // payment-frequency percentage must not also apply - otherwise the
      // published total is discounted twice.
      const { service, manager } = build({
        lessons: [
          lesson({
            id: 96,
            programRate: '65.00',
            total: '32.50',
            discounts: [
              discount(LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY, 3, 1),
              discount(LessonDiscount.TYPE_PREPAID_CYCLE, 1.09, 0),
            ],
          }),
        ],
        hourlyRate: '72.50',
      });

      await service.change({
        locationId: 15,
        enrolmentId: 500,
        pricingTier: 1,
        reason: 'moving onto a tier',
        changedByUserId: 7,
      });

      const params = manager.query.mock.calls.find((call: any[]) =>
        /UPDATE private_lesson/i.test(String(call[0])),
      )?.[1];

      // $36.25 gross less the $1.09 prepaid amount. Eleven of these plus one
      // remainder lesson at $35.24 is the published $422.00 exactly.
      expect(params).toEqual([35.16, 35.16, 96]);
    });

    it('bills the gross when the lesson carries no discount', async () => {
      // This used to be a test that a drifted `private_lesson.total` above the
      // gross fell back to the gross. That whole failure mode is gone: the
      // billed figure is now derived from the rate and the discount rows
      // rather than from whatever the row happened to hold, so a drifted row
      // cannot propagate in the first place.
      const { service, manager } = build({
        lessons: [
          lesson({
            id: 94,
            programRate: '65.00',
            total: '32.50',
            discounts: [],
          }),
        ],
        hourlyRate: '87.50',
      });

      // A row that had drifted above its own gross - now simply ignored.
      manager.query.mockImplementation(async (sql: string) => {
        if (/invoice_item_lesson/.test(sql)) return [];
        if (/FROM private_lesson/.test(sql)) {
          return [{ lessonId: 94, total: '999.00' }];
        }
        return [];
      });

      await service.change({
        locationId: 15,
        enrolmentId: 500,
        pricingTier: 2,
        reason: 'moving onto a tier',
        changedByUserId: 7,
      });

      const params = manager.query.mock.calls.find((call: any[]) =>
        /UPDATE private_lesson/i.test(String(call[0])),
      )?.[1];

      expect(params).toEqual([43.75, 43.75, 94]);
    });

    it('is left alone when the lesson is settled', async () => {
      const { service, manager } = build({
        lessons: [lesson({ id: 92, programRate: '65.00', total: '32.50' })],
        settled: [92],
        hourlyRate: '87.50',
      });

      await service.change({
        locationId: 15,
        enrolmentId: 500,
        pricingTier: 2,
        reason: 'moving onto a tier',
        changedByUserId: 7,
      });

      const updates = manager.query.mock.calls
        .map((call: any[]) => String(call[0]))
        .filter((sql: string) => /UPDATE private_lesson/i.test(sql));

      expect(updates).toHaveLength(0);
    });
  });
});
