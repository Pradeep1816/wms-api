import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  eligibleCycleLessons,
  evaluatePaymentCycleMembership,
  type CycleLesson,
  type PaymentCycleLessonLink,
  type PaymentCycleWindow,
} from '../invariants/payment-cycle-membership.js';

const monthlyCycle: PaymentCycleWindow = {
  id: 9001,
  startDate: '2026-05-01',
  endDate: '2026-05-31',
};

describe('enrolment behavior: payment-cycle membership', () => {
  it('happy-path monthly private confirmation has one active payment_cycle_lesson per confirmed active lesson in cycle', () => {
    const lessons: CycleLesson[] = [
      lesson(101, '2026-05-07'),
      lesson(102, '2026-05-14'),
      lesson(103, '2026-05-21'),
      lesson(104, '2026-05-28'),
    ];
    const links = lessons.map(
      (currentLesson, index): PaymentCycleLessonLink => ({
        id: 5000 + index,
        paymentCycleId: monthlyCycle.id,
        lessonId: currentLesson.id,
        isDeleted: false,
      }),
    );

    expect(
      eligibleCycleLessons(monthlyCycle, lessons).map(
        (currentLesson) => currentLesson.id,
      ),
    ).toEqual([101, 102, 103, 104]);
    expect(
      evaluatePaymentCycleMembership({ cycle: monthlyCycle, lessons, links }),
    ).toEqual([]);
  });

  it('reports missing, duplicate, and ineligible active links as explicit graph violations', () => {
    const lessons: CycleLesson[] = [
      lesson(101, '2026-05-07'),
      lesson(102, '2026-05-14'),
      lesson(103, '2026-06-04'),
      { ...lesson(104, '2026-05-28'), status: 'canceled' },
    ];
    const links: PaymentCycleLessonLink[] = [
      {
        id: 7001,
        paymentCycleId: monthlyCycle.id,
        lessonId: 101,
        isDeleted: false,
      },
      {
        id: 7002,
        paymentCycleId: monthlyCycle.id,
        lessonId: 101,
        isDeleted: false,
      },
      {
        id: 7003,
        paymentCycleId: monthlyCycle.id,
        lessonId: 103,
        isDeleted: false,
      },
      {
        id: 7004,
        paymentCycleId: monthlyCycle.id,
        lessonId: 104,
        isDeleted: false,
      },
    ];

    expect(
      evaluatePaymentCycleMembership({ cycle: monthlyCycle, lessons, links }),
    ).toEqual([
      {
        kind: 'ineligible-active-link',
        paymentCycleId: monthlyCycle.id,
        lessonId: 103,
        linkId: 7003,
        reason: 'out-of-range',
      },
      {
        kind: 'ineligible-active-link',
        paymentCycleId: monthlyCycle.id,
        lessonId: 104,
        linkId: 7004,
        reason: 'canceled',
      },
      {
        kind: 'duplicate-active-link',
        paymentCycleId: monthlyCycle.id,
        lessonId: 101,
        linkIds: [7001, 7002],
      },
      {
        kind: 'missing-active-link',
        paymentCycleId: monthlyCycle.id,
        lessonId: 102,
      },
    ]);
  });

  it('property: a perfect link set satisfies the membership predicate for arbitrary lesson lists', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(cycleLessonArb, {
          selector: (currentLesson) => currentLesson.id,
          maxLength: 40,
        }),
        (lessons) => {
          const links = eligibleCycleLessons(monthlyCycle, lessons).map(
            (currentLesson, index): PaymentCycleLessonLink => ({
              id: 100_000 + index,
              paymentCycleId: monthlyCycle.id,
              lessonId: currentLesson.id,
              isDeleted: false,
            }),
          );

          expect(
            evaluatePaymentCycleMembership({
              cycle: monthlyCycle,
              lessons,
              links,
            }),
          ).toEqual([]);
        },
      ),
      { numRuns: 1000 },
    );
  });
});

function lesson(id: number, date: string): CycleLesson {
  return {
    id,
    date,
    status: 'scheduled',
    isConfirmed: true,
    isDeleted: false,
  };
}

const cycleLessonArb = fc.record({
  id: fc.integer({ min: 1, max: 100_000 }),
  date: fc
    .record({
      year: fc.constant(2026),
      month: fc.integer({ min: 4, max: 6 }),
      day: fc.integer({ min: 1, max: 28 }),
    })
    .map(
      ({ year, month, day }) =>
        `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    ),
  status: fc.constantFrom(
    'scheduled',
    'rescheduled',
    'completed',
    'absent',
    'canceled',
    'unscheduled',
  ),
  isConfirmed: fc.boolean(),
  isDeleted: fc.boolean(),
}) satisfies fc.Arbitrary<CycleLesson>;
