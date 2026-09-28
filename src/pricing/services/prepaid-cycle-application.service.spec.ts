import { describe, expect, it, vi } from 'vitest';
import { PrepaidCycleApplicationService } from './prepaid-cycle-application.service';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonDiscount } from '../../lesson/entities/lesson-discount.entity';
import { LessonScheduleTransformationService } from '../../lesson/services/transformation/lesson-schedule-transformation.service';

/** A real Lesson, so `getGrossPrice()` is the production calculation. */
function lesson(id: number, programRate = 87.5, duration = '00:30:00'): Lesson {
  const row = new Lesson();
  row.id = id;
  row.programRate = programRate;
  row.duration = duration;
  row.discounts = [];
  return row;
}

function service() {
  return new PrepaidCycleApplicationService({} as never, {} as never);
}

describe('PrepaidCycleApplicationService.distribute', () => {
  it('spreads the published total, not a percentage of anything', () => {
    // The whole point: tier 2, 30 min, 3 months is $510.00 published, where 3%
    // of $525.00 would be $509.25.
    const lessons = Array.from({ length: 12 }, (_, i) => lesson(i + 1));

    const result = service().distribute(lessons, '510.00');

    expect(result.distributedTotal).toBe('510.00');
    expect(result.lessons[0].payableAmount).toBe('42.50');
    // Gross is $43.75 a lesson at $87.50/hr for 30 minutes.
    expect(result.lessons[0].grossAmount).toBe('43.75');
    expect(result.lessons[0].discountAmount).toBe('1.25');
  });

  it('charges the published total when the cycle holds its standard count', () => {
    // The property that has to survive the move to a per-lesson rate: a full
    // cycle still costs exactly what Arcadia published, to the cent, for every
    // term and every price in the sheet.
    const cases: Array<[string, number]> = [
      ['422.00', 3],
      ['510.00', 3],
      ['597.00', 3],
      ['634.00', 3],
      ['827.00', 6],
      ['998.00', 6],
      ['1601.00', 12],
      ['1932.00', 12],
    ];

    for (const [total, termMonths] of cases) {
      const standard = termMonths * 4;
      const lessons = Array.from({ length: standard }, (_, i) => lesson(i + 1));

      const result = service().distribute(lessons, total, standard);

      expect(
        result.distributedTotal,
        `${total} over its standard ${standard} lessons`,
      ).toBe(total);
    }
  });

  it('charges per lesson when the cycle holds a different number', () => {
    // Ashif, 2026-08-25, reversing D18: they pro-rate routinely - a student
    // joining mid-month, or away for two months of a prepaid cycle - and asked
    // not to be locked to a fixed lesson count.
    //
    // $510.00 is the price of a standard 12-lesson quarter, so $42.50 a lesson.
    // These are the exact figures quoted back to him.
    const quarter = (count: number) =>
      service().distribute(
        Array.from({ length: count }, (_, i) => lesson(i + 1)),
        '510.00',
        12,
      ).distributedTotal;

    expect(quarter(12)).toBe('510.00');
    expect(quarter(6)).toBe('255.00');
    expect(quarter(11)).toBe('467.50');
    expect(quarter(14)).toBe('595.00');
    expect(quarter(2)).toBe('85.00');
  });

  it('lets a short cycle be cheaper than the published total', () => {
    // The limitation the old rule could not escape. A lesson discount can only
    // reduce a price, so an 11-lesson quarter could not reach a published
    // $1,019.00 at all - it billed $962.50 and the shortfall was silent, on
    // about one in five cycles. Priced per lesson there is no total left to
    // fall short of.
    const lessons = Array.from({ length: 11 }, (_, i) => lesson(i + 1, 175));

    const result = service().distribute(lessons, '1019.00', 12);

    expect(Number(result.distributedTotal)).toBeLessThan(1019);
    // 1019.00 over a standard 12 is 84.91 a lesson with 8 cents over; ten
    // lessons take 84.91 and the last takes 84.99.
    expect(result.distributedTotal).toBe('934.09');
    // And every lesson is discounted, rather than some being left at gross
    // because the arithmetic ran out.
    expect(
      result.lessons.every((row) => Number(row.discountAmount) > 0),
    ).toBe(true);
  });

  it('puts the odd cents on the last lesson only', () => {
    // $510.00 across 7 is $72.857..., so six lessons take $72.85 and the last
    // takes the rest.
    const lessons = Array.from({ length: 7 }, (_, i) => lesson(i + 1));

    const result = service().distribute(lessons, '510.00');

    const amounts = result.lessons.map((l) => l.payableAmount);
    expect(amounts.slice(0, 6)).toEqual(Array(6).fill('72.85'));
    expect(amounts[6]).toBe('72.90');
    expect(result.distributedTotal).toBe('510.00');
  });

  it('never stores a negative reduction', () => {
    // A cycle priced above gross would otherwise store a discount that puts the
    // bill up.
    const lessons = [lesson(1, 10)];

    const result = service().distribute(lessons, '500.00');

    expect(Number(result.lessons[0].discountAmount)).toBe(0);
  });

  it('handles a cycle with a single lesson', () => {
    const result = service().distribute([lesson(1)], '422.00');

    expect(result.lessons).toHaveLength(1);
    expect(result.lessons[0].payableAmount).toBe('422.00');
    expect(result.distributedTotal).toBe('422.00');
  });

  it('returns nothing for a cycle with no lessons', () => {
    const result = service().distribute([], '510.00');

    expect(result.lessons).toEqual([]);
    expect(result.distributedTotal).toBe('0.00');
  });
});

describe('the cascade honours a prepaid row', () => {
  function withDiscounts(rows: Array<Partial<LessonDiscount>>): Lesson {
    const row = lesson(1, 87.5);
    row.discounts = rows as LessonDiscount[];
    return row;
  }

  it('applies the prepaid reduction as dollars', () => {
    const row = withDiscounts([
      { type: LessonDiscount.TYPE_PREPAID_CYCLE, value: 1.25, valueType: 0 },
    ]);

    expect(row.getNetPrice()).toBeCloseTo(42.5, 2);
  });

  it('suppresses payment frequency when a prepaid row is present - D15', () => {
    // Both express the same entitlement to a cheaper cycle. Applying both would
    // discount the cycle twice.
    const row = withDiscounts([
      { type: LessonDiscount.TYPE_PREPAID_CYCLE, value: 1.25, valueType: 0 },
      {
        type: LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
        value: 3,
        valueType: 1,
      },
    ]);

    // 43.75 less 1.25, and NOT a further 3%.
    expect(row.getNetPrice()).toBeCloseTo(42.5, 2);
  });

  it('still applies payment frequency when there is no prepaid row', () => {
    const row = withDiscounts([
      {
        type: LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
        value: 3,
        valueType: 1,
      },
    ]);

    // 43.75 less 3% is 42.4375, which the lesson rounds to cents.
    expect(row.getNetPrice()).toBeCloseTo(42.44, 2);
  });

  it('still stacks with a multiple-enrolment discount, which is a different entitlement', () => {
    const row = withDiscounts([
      {
        type: LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
        value: 1.25,
        valueType: 0,
      },
      { type: LessonDiscount.TYPE_PREPAID_CYCLE, value: 1.25, valueType: 0 },
    ]);

    expect(row.getNetPrice()).toBeCloseTo(41.25, 2);
  });
});

describe('PrepaidCycleApplicationService.plan reads through the given manager', () => {
  /**
   * Caught only by running against a real database, and worth pinning here.
   *
   * `plan` used to load the cycle's lessons through `this.dataSource`. Enrolment
   * confirmation runs inside a transaction, so those lessons were not committed
   * yet and the query returned **nothing** - the plan priced an empty cycle,
   * `apply` wrote no rows, and the enrolment was silently billed monthly. It
   * reported success the whole way, which is why every mocked test passed.
   */
  it('uses the manager it is given, not the default connection', async () => {
    const managerLessons = [
      Object.assign(new Lesson(), {
        id: 1,
        programRate: 87.5,
        duration: '01:00:00',
        discounts: [],
      }),
    ];

    const queryBuilder = {
      where: () => queryBuilder,
      andWhere: () => queryBuilder,
      orderBy: () => queryBuilder,
      getMany: () => Promise.resolve(managerLessons),
    };
    const manager = {
      getRepository: () => ({ createQueryBuilder: () => queryBuilder }),
    };

    // The default connection can only fail this test, never satisfy it.
    const dataSource = {
      manager: {
        getRepository: () => {
          throw new Error('plan must not read on the default connection');
        },
      },
    };

    const pricing = {
      resolve: () =>
        Promise.resolve({
          termMonths: 3,
          monthlyAmount: '350.00',
          payableTermAmount: '1019.00',
          isApprovedTerm: true,
        }),
    };

    const service = new PrepaidCycleApplicationService(
      dataSource as never,
      pricing as never,
    );

    const plan = await service.plan(
      {
        enrolmentId: 500,
        courseId: 900,
        lessonIds: [1],
        locationId: 15,
        pricingCategory: 'standard' as never,
        pricingTier: 2,
        durationMinutes: 60,
        frequencyLength: 3,
        effectiveDate: '2026-09-01',
      },
      manager as never,
    );

    expect(plan.lessons).toHaveLength(1);
    expect(plan.payableTermAmount).toBe('1019.00');
  });
});

describe('PrepaidCycleApplicationService.apply', () => {
  it('replaces any prepaid row already there, so a re-run corrects rather than doubles', async () => {
    const deleted: unknown[] = [];
    const saved: unknown[] = [];
    const repository = {
      delete: vi.fn((where: unknown) => {
        deleted.push(where);
        return Promise.resolve({});
      }),
      create: (payload: unknown) => payload,
      save: vi.fn((rows: unknown) => {
        saved.push(rows);
        return Promise.resolve(rows);
      }),
    };
    const manager = { getRepository: () => repository };

    const written = await service().apply(
      {
        enrolmentId: 7,
        termMonths: 3,
        payableTermAmount: '510.00',
        distributedTotal: '510.00',
        isApprovedTerm: true,
        staleLessonIds: [],
        expectedGrossAmount: '43.75',
        lessons: [
          {
            lessonId: 11,
            grossAmount: '43.75',
            payableAmount: '42.50',
            discountAmount: '1.25',
          },
          {
            lessonId: 12,
            grossAmount: '43.75',
            payableAmount: '43.75',
            discountAmount: '0.00',
          },
        ],
      },
      manager as never,
    );

    expect(deleted).toHaveLength(1);
    // The zero-reduction lesson gets no row at all.
    expect(written).toBe(1);
    const rows = saved[0] as Array<{ type: number; valueType: number }>;
    expect(rows[0].type).toBe(LessonDiscount.TYPE_PREPAID_CYCLE);
    expect(rows[0].valueType).toBe(0);
  });
});

describe('PrepaidCycleApplicationService refuses to run out of order', () => {
  /** A plan shaped like `plan()` builds one, with the stale set supplied. */
  const planWith = (staleLessonIds: number[]) => ({
    enrolmentId: 7,
    termMonths: 3,
    payableTermAmount: '510.00',
    distributedTotal: '510.00',
    isApprovedTerm: true,
    expectedGrossAmount: '43.75',
    staleLessonIds,
    lessons: [
      {
        lessonId: 11,
        grossAmount: '43.75',
        payableAmount: '42.50',
        discountAmount: '1.25',
      },
      {
        lessonId: 12,
        grossAmount: '43.75',
        payableAmount: '42.50',
        discountAmount: '1.25',
      },
    ],
  });

  const repo = () => ({
    delete: vi.fn().mockResolvedValue({}),
    create: (payload: unknown) => payload,
    save: vi.fn((rows: unknown) => Promise.resolve(rows)),
  });

  it('throws rather than writing when lessons are still on the old rate', async () => {
    // The failure this prevents: the reduction is gross minus payable, so a
    // gross that has not been re-rated yet gives a reduction that is too
    // small. Re-rate the lesson afterwards and the customer pays MORE than
    // the published cycle total.
    const repository = repo();
    const manager = { getRepository: () => repository };

    await expect(
      service().apply(planWith([11, 12]) as never, manager as never),
    ).rejects.toThrow(/still on a pre-migration rate/);

    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('names the enrolment and the lessons, so the fix is obvious', async () => {
    const manager = { getRepository: () => repo() };

    await expect(
      service().apply(planWith([11, 12]) as never, manager as never),
    ).rejects.toThrow(/Enrolment 7: 2 of 2 lessons/);
  });

  it('writes when nothing is stale', async () => {
    const repository = repo();
    const manager = { getRepository: () => repository };

    await service().apply(planWith([]), manager as never);

    expect(repository.save).toHaveBeenCalled();
  });

  it('can be forced, for a cycle on a deliberate non-catalogue rate', async () => {
    const repository = repo();
    const manager = { getRepository: () => repository };

    await service().apply(planWith([11]), manager as never, true);

    expect(repository.save).toHaveBeenCalled();
  });
});

describe('every calculator agrees on a prepaid lesson', () => {
  /**
   * Six places price a lesson from its rate and its discounts, and they were
   * found one at a time. This pins the answer so a seventh cannot quietly
   * disagree: $47.50 gross, a $5.00 published reduction, and a 3%
   * payment-frequency row that must be ignored while prepaid is present.
   */
  const GROSS = 47.5;
  const PREPAID = 5;
  const EXPECTED_DISCOUNT = 5;

  it('the entity - Lesson.getDiscount()', () => {
    const lesson = new Lesson();
    lesson.programRate = 95;
    lesson.duration = '00:30:00';
    lesson.discounts = [
      { type: LessonDiscount.TYPE_PREPAID_CYCLE, value: PREPAID, valueType: 0 },
      {
        type: LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
        value: 3,
        valueType: 1,
      },
    ] as never;

    expect(lesson.getGrossPrice()).toBeCloseTo(GROSS, 2);
    expect(lesson.getDiscount()).toBeCloseTo(EXPECTED_DISCOUNT, 2);
  });

  it('the schedule display - calculateDiscount()', () => {
    const service = new LessonScheduleTransformationService();

    const discount = service.calculateDiscount(GROSS, [
      { type: LessonDiscount.TYPE_PREPAID_CYCLE, value: PREPAID, valueType: 0 },
      {
        type: LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
        value: 3,
        valueType: 1,
      },
    ] as never);

    expect(discount).toBeCloseTo(EXPECTED_DISCOUNT, 2);
  });
});
