import { BadRequestException, NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityManager } from 'typeorm';
import { EnrolmentPaymentFrequencyService } from '../../../src/enrolment/services/enrolment-payment-frequency.service';
import { PaymentFrequency } from '../../../src/payment/entities/payment-frequency.entity';
import { Enrolment } from '../../../src/enrolment/entities/enrolment.entity';

/** Mirrors `formatDateToString` in the service under test. */
const asFormDate = (date: Date): string => {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[date.getMonth()]} ${date.getDate().toString().padStart(2,'0')}, ${date.getFullYear()}`;
};

type RepoMock = ReturnType<typeof createRepositoryMock>;

function createRepositoryMock() {
  return {
    getEnrolmentWithPaymentFrequency: vi.fn(),
    findPaymentFrequencyById: vi.fn(),
    getEnrolmentWithPaymentCycles: vi.fn(),
    updateEnrolmentPaymentFrequency: vi.fn(),
    findOrCreateEnrolmentPaymentFrequency: vi.fn(),
    deletePaymentCyclesFromDate: vi.fn(),
    getLastPaymentCycle: vi.fn(),
    updatePaymentCycleEndDate: vi.fn(),
    clonePaymentCycle: vi.fn(),
    deletePaymentCycle: vi.fn(),
    linkLessonsToPaymentCycle: vi.fn(),
    createPaymentCycle: vi.fn(),
    batchUpdateLessonDueDates: vi.fn(),
    updateLessonDueDate: vi.fn(),
    getConfirmedLessonsForEnrolment: vi.fn(),
    getCourseWithProgram: vi.fn(),
    getRecentCourseSchedule: vi.fn(),
    updateCourseScheduleEndDate: vi.fn(),
    updateCourseScheduleIsRecent: vi.fn(),
    createCourseSchedule: vi.fn(),
    createCourseProgramRate: vi.fn(),
    // Null by default: these fixtures assert the program-list fallback, and a
    // held rate would legitimately take precedence over it.
    findRateInEffectBefore: vi.fn(async () => null),
    createAutoRenewal: vi.fn(),
    createLessonForAutoRenewal: vi.fn(),
    createPrivateLessonsForAutoRenewal: vi.fn(),
    createAutoRenewalLesson: vi.fn(),
    createPaymentCycleForAutoRenewal: vi.fn(),
    createAutoRenewalPaymentCycle: vi.fn(),
    createPaymentCycleLesson: vi.fn(),
    updateCourseEndDate: vi.fn(),
    updateEnrolmentEndDate: vi.fn(),
    getTeacherQualificationRate: vi.fn(),
    getFirstLessonForCourse: vi.fn(),
  };
}

function createDataSourceMock(manager: EntityManager) {
  return {
    transaction: vi.fn(async (handler: (transactionManager: EntityManager) => Promise<unknown>) =>
      handler(manager),
    ),
  };
}

function utcDate(year: number, month: number, day: number, hour = 12): Date {
  return new Date(Date.UTC(year, month, day, hour, 0, 0));
}

function dateParts(date: Date): [number, number, number] {
  return [date.getFullYear(), date.getMonth(), date.getDate()];
}

function computeDueDate(firstLessonDate: Date): Date {
  const dueDate = new Date(
    firstLessonDate.getFullYear(),
    firstLessonDate.getMonth() - 1,
    1,
  );
  dueDate.setDate(dueDate.getDate() + 14);
  return dueDate;
}

function computeRenewalStartDate(courseEndDate: Date): Date {
  const renewalStartDate = new Date(courseEndDate);
  renewalStartDate.setDate(renewalStartDate.getDate() + 1);
  return renewalStartDate;
}

function computeRenewalEndDate(courseEndDate: Date): Date {
  const renewalEndDate = new Date(courseEndDate);
  renewalEndDate.setMonth(renewalEndDate.getMonth() + 25, 0);
  return renewalEndDate;
}

describe('EnrolmentPaymentFrequencyService payment frequency behavior', () => {
  let service: EnrolmentPaymentFrequencyService;
  let catalogueRate: { hourlyRateFor: ReturnType<typeof vi.fn> };
  let prepaidPricing: { applyForEnrolment: ReturnType<typeof vi.fn> };
  let customerBalanceRecalculator: {
    recalculateAndPersist: ReturnType<typeof vi.fn>;
  };
  let repository: RepoMock;
  let dataSource: ReturnType<typeof createDataSourceMock>;
  let manager: EntityManager;

  beforeEach(() => {
    manager = {} as EntityManager;
    repository = createRepositoryMock();
    dataSource = createDataSourceMock(manager);
    // The catalogue answers `null` for these fixtures - they are not tiered -
    // so the extension keeps `program.rate`, which is what every assertion here
    // was written against. Prepaid likewise has nothing to price.
    catalogueRate = { hourlyRateFor: vi.fn().mockResolvedValue(null) };
    prepaidPricing = {
      applyForEnrolment: vi
        .fn()
        .mockResolvedValue({ cyclesPriced: 0, cyclesSkipped: 0, skipped: null }),
    };
    customerBalanceRecalculator = {
      recalculateAndPersist: vi.fn().mockResolvedValue(0),
    };

    service = new EnrolmentPaymentFrequencyService(
      repository as any,
      dataSource as any,
      catalogueRate as any,
      prepaidPricing as any,
      customerBalanceRecalculator as any,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /**
   * The edit form opens on TODAY, not on the stored date.
   *
   * This test used to assert the opposite - that the persisted
   * `paymentCycleStartDate` came back as the effective date - which is the
   * behaviour Arcadia reported as a fault on 2026-09-01: the form opened on
   * July 2025 when they were setting a September 2026 frequency.
   *
   * Legacy cannot return a stored date. `actionChangePaymentFrequency` builds
   * a fresh model and sets today, and its `effectiveDate` is a virtual
   * attribute that is never persisted.
   */
  it('opens the edit form on today, not on the stored cycle start', async () => {
    repository.getEnrolmentWithPaymentFrequency.mockResolvedValue({
      id: 77,
      paymentFrequency: {
        id: 5,
        name: 'Quarterly',
      },
    });

    const today = new Date();
    const expected = asFormDate(today);

    const result = await service.getPaymentFrequency(3, 77);

    expect(result.body).toEqual({
      id: 77,
      paymentFrequencyId: 5,
      paymentFrequency: 'Quarterly',
      effectiveDate: expected,
    });
  });

  it('still opens on today when the enrolment has an old cycle start', async () => {
    // The stored row is untouched by this - it is simply no longer the
    // form's suggestion.
    repository.getEnrolmentWithPaymentFrequency.mockResolvedValue({
      id: 77,
      paymentFrequency: { id: 5, name: 'Quarterly' },
    });

    const result = await service.getPaymentFrequency(3, 77);

    expect(result.body.effectiveDate).toBe(asFormDate(new Date()));
    expect(result.body.effectiveDate).not.toContain('2025');
  });

  it('rejects an unknown payment frequency id before the transaction starts', async () => {
    repository.findPaymentFrequencyById.mockResolvedValue(null);

    await expect(
      service.changePaymentFrequency(
        3,
        77,
        { paymentFrequencyId: 999, effectiveDate: 'Apr 01, 2026' } as any,
        7001,
      ),
    ).rejects.toThrow(new BadRequestException('Payment frequency not found: 999'));

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects an invalid effective date before the transaction starts', async () => {
    repository.findPaymentFrequencyById.mockResolvedValue({
      id: 5,
      name: 'Monthly',
      frequencyLength: 1,
    });

    await expect(
      service.changePaymentFrequency(
        3,
        77,
        { paymentFrequencyId: 5, effectiveDate: 'bad-date' } as any,
        7001,
      ),
    ).rejects.toThrow(
      new BadRequestException('Invalid effective date format: bad-date'),
    );

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects a missing enrolment inside the transaction', async () => {
    repository.findPaymentFrequencyById.mockResolvedValue({
      id: 5,
      name: 'Monthly',
      frequencyLength: 1,
    });
    repository.getEnrolmentWithPaymentCycles.mockResolvedValue(null);

    await expect(
      service.changePaymentFrequency(
        3,
        77,
        { paymentFrequencyId: 5, effectiveDate: 'Apr 01, 2026' } as any,
        7001,
      ),
    ).rejects.toThrow(new NotFoundException('Enrolment not found: 77'));

    expect(repository.updateEnrolmentPaymentFrequency).not.toHaveBeenCalled();
    expect(repository.findOrCreateEnrolmentPaymentFrequency).not.toHaveBeenCalled();
  });

  it('prices the extension from the tier, not the program list rate', async () => {
    // Reported 2026-08-24 on enrolment 33592. Changing the payment frequency
    // extends the enrolment - which is expected - but every extension lesson was
    // priced from `program.rate`, the pre-September list price. A tier 1
    // enrolment sold at $72.50 an hour quietly produced lessons at $65.00, so
    // $32.50 a lesson against the $36.25 it was sold at, on 98 lessons.
    //
    // This file predates tiers; it was written in April 2026.
    catalogueRate.hourlyRateFor.mockResolvedValue(72.5);

    await renewWithFixtures();

    // The rate row the extension writes...
    expect(repository.createCourseProgramRate).toHaveBeenCalled();
    expect(repository.createCourseProgramRate.mock.calls[0][3]).toBe(72.5);
    // ...and the lessons themselves. Index 6 is programRate.
    expect(repository.createLessonForAutoRenewal.mock.calls[0][6]).toBe(72.5);

    // Priced for the day the extension starts, since prices are effective-dated.
    expect(catalogueRate.hourlyRateFor).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: 3,
        programId: 8,
        duration: '00:45:00',
        pricingTier: 1,
        keepsPreviousRate: false,
      }),
    );
  });

  it('keeps the program rate when the catalogue has no opinion', async () => {
    // A location outside the pilot, a held rate or a marker program all answer
    // null, and the behaviour every other test here was written against must
    // survive untouched. The course has no rate row of its own in these
    // fixtures, so the program list price is still the right fallback.
    //
    // An UNTIERED enrolment no longer reaches the catalogue at all - it carries
    // its own rate forward instead. See
    // `enrolment-payment-frequency-extension-rate.spec.ts`.
    catalogueRate.hourlyRateFor.mockResolvedValue(null);

    await renewWithFixtures();

    expect(repository.createCourseProgramRate.mock.calls[0][3]).toBe(130);
    expect(repository.createLessonForAutoRenewal.mock.calls[0][6]).toBe(130);
  });

  it('recalculates the persisted customer balance for a legacy-priced enrolment', async () => {
    vi.spyOn(service as any, 'resetPaymentCycles').mockResolvedValue(undefined);
    prepaidPricing.applyForEnrolment.mockResolvedValue({
      cyclesPriced: 0,
      cyclesSkipped: 0,
      skipped: 'no-tier',
    });

    repository.findPaymentFrequencyById.mockResolvedValue({
      id: 6,
      name: 'Quarterly',
      frequencyLength: 3,
    });
    repository.getEnrolmentWithPaymentCycles.mockResolvedValue({
      id: 77,
      student: {
        customerId: 14648,
      },
      course: {
        id: 88,
        endDate: utcDate(2026, 11, 31),
      },
    } as Enrolment);
    repository.updateEnrolmentPaymentFrequency.mockResolvedValue(undefined);
    repository.findOrCreateEnrolmentPaymentFrequency.mockResolvedValue(undefined);

    await service.changePaymentFrequency(
      3,
      77,
      { paymentFrequencyId: 6, effectiveDate: 'Apr 01, 2026' } as any,
      7001,
    );

    expect(prepaidPricing.applyForEnrolment).toHaveBeenCalledWith(
      {
        enrolmentId: 77,
        frequencyLength: 3,
      },
      manager,
    );
    expect(customerBalanceRecalculator.recalculateAndPersist).toHaveBeenCalledWith(
      14648,
      {
        manager,
        updatedByUserId: 7001,
      },
    );
    expect(
      customerBalanceRecalculator.recalculateAndPersist.mock.invocationCallOrder[0],
    ).toBeGreaterThan(prepaidPricing.applyForEnrolment.mock.invocationCallOrder[0]);
  });

  it('triggers auto-renew when the course ends before the next cycle start', async () => {
    const renewSpy = vi
      .spyOn(service as any, 'renewEnrolment')
      .mockResolvedValue(undefined);
    const resetSpy = vi
      .spyOn(service as any, 'resetPaymentCycles')
      .mockResolvedValue(undefined);

    repository.findPaymentFrequencyById.mockResolvedValue({
      id: 5,
      name: 'Monthly',
      frequencyLength: 1,
    });
    const originalEnrolmentWithCycles = {
      id: 77,
      student: {
        customerId: 14648,
      },
      course: {
        id: 88,
        endDate: utcDate(2026, 3, 30),
      },
    } as Enrolment;
    repository.getEnrolmentWithPaymentCycles.mockResolvedValue(originalEnrolmentWithCycles);
    repository.updateEnrolmentPaymentFrequency.mockResolvedValue(undefined);
    repository.findOrCreateEnrolmentPaymentFrequency.mockResolvedValue(undefined);

    const result = await service.changePaymentFrequency(
      3,
      77,
      { paymentFrequencyId: 5, effectiveDate: 'Apr 01, 2026' } as any,
      7001,
    );

    expect(result).toEqual({
      id: 77,
      paymentFrequencyId: 5,
      paymentFrequency: 'Monthly',
      effectiveDate: 'Apr 01, 2026',
    });
    expect(repository.getEnrolmentWithPaymentCycles).toHaveBeenCalledTimes(1);
    // Changing the frequency is the fourth place payment cycles are created, and
    // the one prepaid pricing originally missed - so a tiered enrolment moved to
    // a prepaid term got its cycles and then billed them lesson by lesson.
    // Moving back to Monthly runs it too, which is what clears the prepaid rows.
    expect(prepaidPricing.applyForEnrolment).toHaveBeenCalledWith(
      expect.objectContaining({ enrolmentId: 77, frequencyLength: 1 }),
      expect.anything(),
    );
    expect(renewSpy).toHaveBeenCalledTimes(1);
    expect(renewSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 77,
        course: expect.objectContaining({
          endDate: utcDate(2026, 3, 30),
        }),
      }),
      expect.objectContaining({
        id: 5,
        frequencyLength: 1,
      }),
      7001,
      manager,
    );
    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(resetSpy).toHaveBeenCalledWith(
      77,
      originalEnrolmentWithCycles,
      expect.any(Date),
      expect.objectContaining({
        id: 5,
        frequencyLength: 1,
      }),
      manager,
    );
    expect(repository.updateEnrolmentPaymentFrequency).toHaveBeenCalledWith(
      77,
      5,
      7001,
      manager,
    );
  });

  it('updates the in-memory enrolment course end date during auto-renew', async () => {
    const enrolment = {
      id: 77,
      courseId: 88,
      studentId: 55,
      endDateTime: utcDate(2026, 3, 30),
      course: {
        id: 88,
        endDate: utcDate(2026, 3, 30),
        teacherId: 15,
        isOnline: 1,
        program: {
          id: 22,
          rate: 100,
        },
      },
      paymentFrequency: {
        id: 5,
        frequencyLength: 1,
      },
    } as unknown as Enrolment;

    repository.getCourseWithProgram.mockResolvedValue({
      id: 88,
      endDate: utcDate(2026, 3, 30),
      teacherId: 15,
      isOnline: 1,
      program: {
        id: 22,
        rate: 100,
      },
    });
    repository.getLastPaymentCycle.mockResolvedValue({
      id: 991,
      startDate: utcDate(2026, 0, 1),
      endDate: utcDate(2026, 0, 31),
    });
    repository.getFirstLessonForCourse.mockResolvedValue({
      id: 101,
      date: utcDate(2026, 0, 5),
      originalDate: utcDate(2026, 0, 5),
    } as Lesson);
    repository.getTeacherQualificationRate.mockResolvedValue(50);
    repository.createCourseProgramRate.mockResolvedValue(undefined);
    repository.createAutoRenewal.mockResolvedValue({ id: 900 } as any);
    repository.getRecentCourseSchedule.mockResolvedValue({
      id: 600,
      day: 8,
      fromTime: '10:00:00',
      duration: '00:30:00',
    });
    repository.updateCourseScheduleEndDate.mockResolvedValue(undefined);
    repository.updateCourseScheduleIsRecent.mockResolvedValue(undefined);
    repository.createPrivateLessonsForAutoRenewal.mockResolvedValue(undefined);
    repository.updateCourseEndDate.mockResolvedValue(undefined);
    repository.updateEnrolmentEndDate.mockResolvedValue(undefined);
    const setAutoRenewalPaymentCycleSpy = vi
      .spyOn(service as any, 'setAutoRenewalPaymentCycle')
      .mockResolvedValue([]);

    await (service as any).renewEnrolment(
      enrolment,
      {
        id: 5,
        frequencyLength: 1,
      } as PaymentFrequency,
      7001,
      manager,
    );

    const expectedRenewalEndDate = computeRenewalEndDate(utcDate(2026, 3, 30));
    expect(enrolment.course.endDate).toEqual(expectedRenewalEndDate);
    expect(enrolment.endDateTime).toEqual(expectedRenewalEndDate);
    expect(setAutoRenewalPaymentCycleSpy).toHaveBeenCalledWith(
      77,
      expect.any(Date),
      expect.any(Date),
      expect.objectContaining({
        id: 5,
        frequencyLength: 1,
      }),
      900,
      7001,
      manager,
    );
  });

  it('rebuilds payment cycles, clones the boundary cycle, and refreshes due dates', async () => {
    const setDueDateSpy = vi
      .spyOn(service as any, 'setDueDate')
      .mockResolvedValue(undefined);

    const effectiveDate = utcDate(2026, 3, 1);
    const enrolment = {
      id: 77,
      course: {
        id: 88,
        endDate: utcDate(2026, 5, 30),
      },
    } as Enrolment;
    const paymentFrequency = {
      id: 5,
      frequencyLength: 3,
    } as PaymentFrequency;
    const lastPaymentCycle = {
      id: 991,
      startDate: utcDate(2026, 0, 1),
      endDate: utcDate(2026, 2, 31),
    };

    repository.deletePaymentCyclesFromDate.mockResolvedValue(undefined);
    repository.getLastPaymentCycle.mockResolvedValue(lastPaymentCycle);
    repository.updatePaymentCycleEndDate.mockResolvedValue(undefined);
    repository.clonePaymentCycle.mockImplementation(async (paymentCycle: any) => ({
      ...paymentCycle,
      id: 992,
    }));
    repository.linkLessonsToPaymentCycle.mockResolvedValue({
      linkedLessonIds: [401, 402],
    });
    repository.createPaymentCycle.mockResolvedValue({
      id: 2001,
      enrolmentId: 77,
      startDate: utcDate(2026, 3, 1),
      endDate: utcDate(2026, 5, 30),
    });
    repository.batchUpdateLessonDueDates.mockResolvedValue(undefined);

    await (service as any).resetPaymentCycles(
      77,
      enrolment,
      effectiveDate,
      paymentFrequency,
      manager,
    );

    expect(repository.deletePaymentCyclesFromDate).toHaveBeenCalledWith(
      77,
      effectiveDate,
      manager,
    );
    expect(repository.updatePaymentCycleEndDate).toHaveBeenCalledTimes(1);
    expect(dateParts(repository.updatePaymentCycleEndDate.mock.calls[0][1])).toEqual([
      2026,
      2,
      31,
    ]);
    expect(repository.clonePaymentCycle).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 991,
        endDate: expect.any(Date),
      }),
      manager,
    );
    expect(repository.createPaymentCycle).toHaveBeenCalledTimes(1);
    expect(repository.linkLessonsToPaymentCycle).toHaveBeenCalledTimes(2);
    expect(repository.batchUpdateLessonDueDates).not.toHaveBeenCalled();
    expect(setDueDateSpy).toHaveBeenCalledWith(77, manager);
  });

  it('builds auto-renew payment cycles on legacy month boundaries', async () => {
    repository.createPaymentCycleForAutoRenewal.mockImplementation(
      async (enrolmentId: number, startDate: Date, endDate: Date) => ({
        id: Math.trunc(startDate.getTime() / 1000),
        enrolmentId,
        startDate,
        endDate,
      }),
    );
    repository.createAutoRenewalPaymentCycle.mockResolvedValue(undefined);

    const cycles = await (service as any).setAutoRenewalPaymentCycle(
      77,
      utcDate(2026, 0, 15),
      utcDate(2026, 2, 31),
      {
        frequencyLength: 1,
      } as PaymentFrequency,
      900,
      7001,
      manager,
    );

    expect(cycles).toHaveLength(3);
    expect(dateParts(cycles[0].startDate)).toEqual([2026, 0, 1]);
    expect(dateParts(cycles[0].endDate)).toEqual([2026, 0, 31]);
    expect(dateParts(cycles[1].startDate)).toEqual([2026, 1, 1]);
    expect(dateParts(cycles[1].endDate)).toEqual([2026, 1, 28]);
    expect(dateParts(cycles[2].startDate)).toEqual([2026, 2, 1]);
    expect(dateParts(cycles[2].endDate)).toEqual([2026, 2, 31]);
    expect(repository.createPaymentCycleForAutoRenewal).toHaveBeenNthCalledWith(
      1,
      77,
      expect.any(Date),
      expect.any(Date),
      manager,
    );
    expect(dateParts(repository.createPaymentCycleForAutoRenewal.mock.calls[0][1])).toEqual([
      2026,
      0,
      1,
    ]);
    expect(dateParts(repository.createPaymentCycleForAutoRenewal.mock.calls[0][2])).toEqual([
      2026,
      0,
      31,
    ]);
  });

  it('recalculates due dates for all lessons in each payment cycle', async () => {
    repository.getConfirmedLessonsForEnrolment.mockResolvedValue([
      {
        lesson: {
          id: 1,
          date: utcDate(2026, 3, 15),
          originalDate: utcDate(2026, 3, 15),
        },
        paymentCycleId: 11,
        paymentCycleStartDate: utcDate(2026, 3, 1),
      },
      {
        lesson: {
          id: 2,
          date: utcDate(2026, 3, 16),
          originalDate: utcDate(2026, 3, 16),
        },
        paymentCycleId: 11,
        paymentCycleStartDate: utcDate(2026, 3, 1),
      },
      {
        lesson: {
          id: 3,
          date: utcDate(2026, 4, 20),
          originalDate: utcDate(2026, 4, 20),
        },
        paymentCycleId: 12,
        paymentCycleStartDate: utcDate(2026, 4, 1),
      },
    ]);
    repository.updateLessonDueDate.mockResolvedValue(undefined);

    await (service as any).setDueDate(77, manager);

    expect(repository.getConfirmedLessonsForEnrolment).toHaveBeenCalledWith(77, manager);
    expect(repository.updateLessonDueDate).toHaveBeenCalledTimes(3);
    expect(repository.updateLessonDueDate).toHaveBeenNthCalledWith(1, 1, expect.any(Date), manager);
    expect(repository.updateLessonDueDate).toHaveBeenNthCalledWith(2, 2, expect.any(Date), manager);
    expect(repository.updateLessonDueDate).toHaveBeenNthCalledWith(3, 3, expect.any(Date), manager);

    expect(dateParts(repository.updateLessonDueDate.mock.calls[0][1])).toEqual([
      2026,
      2,
      15,
    ]);
    expect(dateParts(repository.updateLessonDueDate.mock.calls[1][1])).toEqual([
      2026,
      2,
      15,
    ]);
    expect(dateParts(repository.updateLessonDueDate.mock.calls[2][1])).toEqual([
      2026,
      3,
      15,
    ]);
  });

  it('keeps a cycle due date stable when a lesson moves in from the previous month', async () => {
    const novemberCycleStart = utcDate(2026, 10, 1);
    repository.getConfirmedLessonsForEnrolment.mockResolvedValue([
      {
        lesson: {
          id: 5170162,
          date: utcDate(2026, 10, 4),
          originalDate: utcDate(2026, 10, 4),
        },
        paymentCycleId: 729391,
        paymentCycleStartDate: novemberCycleStart,
      },
      {
        lesson: {
          id: 5276213,
          date: utcDate(2026, 10, 5),
          originalDate: utcDate(2026, 9, 14),
        },
        paymentCycleId: 729391,
        paymentCycleStartDate: novemberCycleStart,
      },
      {
        lesson: {
          id: 5170163,
          date: utcDate(2026, 10, 11),
          originalDate: utcDate(2026, 10, 11),
        },
        paymentCycleId: 729391,
        paymentCycleStartDate: novemberCycleStart,
      },
    ]);
    repository.updateLessonDueDate.mockResolvedValue(undefined);

    await (service as any).setDueDate(33310, manager);

    expect(repository.updateLessonDueDate).toHaveBeenCalledTimes(3);
    for (const [, dueDate] of repository.updateLessonDueDate.mock.calls) {
      expect(dateParts(dueDate)).toEqual([2026, 9, 15]);
    }
  });

  it('does not bill before a first occurrence that starts after the cycle boundary', async () => {
    repository.getConfirmedLessonsForEnrolment.mockResolvedValue([
      {
        lesson: {
          id: 9001,
          date: utcDate(2026, 8, 3),
          originalDate: utcDate(2026, 8, 3),
        },
        paymentCycleId: 800,
        paymentCycleStartDate: utcDate(2026, 7, 1),
      },
      {
        lesson: {
          id: 9002,
          date: utcDate(2026, 8, 10),
          originalDate: utcDate(2026, 8, 10),
        },
        paymentCycleId: 800,
        paymentCycleStartDate: utcDate(2026, 7, 1),
      },
    ]);
    repository.updateLessonDueDate.mockResolvedValue(undefined);

    await (service as any).setDueDate(77, manager);

    expect(repository.updateLessonDueDate).toHaveBeenCalledTimes(2);
    for (const [, dueDate] of repository.updateLessonDueDate.mock.calls) {
      expect(dateParts(dueDate)).toEqual([2026, 7, 15]);
    }
  });

  it('keeps September and October on separate due dates after a September lesson moves to October', async () => {
    repository.getConfirmedLessonsForEnrolment.mockResolvedValue([
      {
        lesson: {
          id: 1,
          date: utcDate(2026, 8, 9),
          originalDate: utcDate(2026, 8, 9),
        },
        paymentCycleId: 100,
        paymentCycleStartDate: utcDate(2026, 8, 1),
      },
      {
        lesson: {
          id: 2,
          date: utcDate(2026, 9, 5),
          originalDate: utcDate(2026, 8, 16),
        },
        paymentCycleId: 100,
        paymentCycleStartDate: utcDate(2026, 8, 1),
      },
      {
        lesson: {
          id: 3,
          date: utcDate(2026, 9, 7),
          originalDate: utcDate(2026, 9, 7),
        },
        paymentCycleId: 101,
        paymentCycleStartDate: utcDate(2026, 9, 1),
      },
    ]);
    repository.updateLessonDueDate.mockResolvedValue(undefined);

    await (service as any).setDueDate(77, manager);

    expect(dateParts(repository.updateLessonDueDate.mock.calls[0][1])).toEqual([
      2026,
      7,
      15,
    ]);
    expect(dateParts(repository.updateLessonDueDate.mock.calls[1][1])).toEqual([
      2026,
      7,
      15,
    ]);
    expect(dateParts(repository.updateLessonDueDate.mock.calls[2][1])).toEqual([
      2026,
      8,
      15,
    ]);
  });

  it('uses the cycle start month for a multi-month payment frequency', async () => {
    repository.getConfirmedLessonsForEnrolment.mockResolvedValue([
      {
        lesson: {
          id: 10,
          date: utcDate(2026, 10, 5),
          originalDate: utcDate(2026, 9, 14),
        },
        paymentCycleId: 20,
        paymentCycleStartDate: utcDate(2026, 9, 1),
      },
      {
        lesson: {
          id: 11,
          date: utcDate(2026, 11, 3),
          originalDate: utcDate(2026, 11, 3),
        },
        paymentCycleId: 20,
        paymentCycleStartDate: utcDate(2026, 9, 1),
      },
    ]);
    repository.updateLessonDueDate.mockResolvedValue(undefined);

    await (service as any).setDueDate(77, manager);

    expect(repository.updateLessonDueDate).toHaveBeenCalledTimes(2);
    for (const [, dueDate] of repository.updateLessonDueDate.mock.calls) {
      expect(dateParts(dueDate)).toEqual([2026, 8, 15]);
    }
  });

  /**
   * The auto-renew fixtures, shared so the rate tests below arrange exactly
   * what the original test does and differ only in what the catalogue answers.
   */
  async function renewWithFixtures(): Promise<{ scheduleDay: number }> {
      const courseEndDate = utcDate(2024, 1, 29);
      const renewalStartDate = computeRenewalStartDate(courseEndDate);
      const renewalEndDate = computeRenewalEndDate(courseEndDate);
      const scheduleDay = renewalStartDate.getDay() === 0 ? 7 : renewalStartDate.getDay();

      repository.getCourseWithProgram.mockResolvedValue({
        id: 88,
        locationId: 3,
        endDate: courseEndDate,
        teacherId: 14,
        isOnline: 0,
        program: {
          id: 8,
          rate: 130,
        },
      });
      repository.getLastPaymentCycle.mockResolvedValue({
        id: 991,
        startDate: utcDate(2024, 0, 1),
        endDate: utcDate(2024, 2, 31),
      });
      repository.getFirstLessonForCourse.mockResolvedValue({
        id: 501,
        date: utcDate(2024, 2, 1),
      });
      repository.getRecentCourseSchedule.mockResolvedValue({
        id: 300,
        day: scheduleDay,
        fromTime: '15:00:00',
        duration: '00:45:00',
      });
      repository.getTeacherQualificationRate.mockResolvedValue(62);
      repository.createCourseProgramRate.mockResolvedValue(undefined);
      repository.createAutoRenewal.mockResolvedValue({ id: 900 });
      repository.createLessonForAutoRenewal.mockImplementation(
        async (
          courseId: number,
          enrolmentId: number,
          studentId: number,
          teacherId: number,
          date: Date,
          duration: string,
          programRate: number,
          teacherRate: number,
        ) => ({
          id: Math.trunc(date.getTime() / 1000),
          courseId,
          enrolmentId,
          studentId,
          teacherId,
          date,
          duration,
          programRate,
          teacherRate,
        }),
      );
      repository.createAutoRenewalLesson.mockResolvedValue(undefined);
      repository.createPrivateLessonsForAutoRenewal.mockResolvedValue(undefined);
      repository.updateCourseScheduleEndDate.mockResolvedValue(undefined);
      repository.updateCourseScheduleIsRecent.mockResolvedValue(undefined);
      repository.createCourseSchedule.mockResolvedValue({
        id: 301,
      });
      repository.updatePaymentCycleEndDate.mockResolvedValue(undefined);
      repository.createPaymentCycleForAutoRenewal.mockImplementation(
        async (enrolmentId: number, startDate: Date, endDate: Date) => ({
          id: Math.trunc(startDate.getTime() / 1000),
          enrolmentId,
          startDate,
          endDate,
        }),
      );
      repository.createAutoRenewalPaymentCycle.mockResolvedValue(undefined);
      repository.createPaymentCycleLesson.mockResolvedValue(undefined);
      repository.updateCourseEndDate.mockResolvedValue(undefined);
      repository.updateEnrolmentEndDate.mockResolvedValue(undefined);

      await (service as any).renewEnrolment(
        {
          id: 77,
          courseId: 88,
          studentId: 301,
          endDateTime: utcDate(2024, 1, 29),
          // A real enrolment carries these, and the extension rate is looked up
          // from them. Without a tier here the lookup could not be tested.
          pricingTier: 1,
          keepsPreviousRate: false,
        } as Enrolment,
        {
          id: 5,
          name: 'Annual',
          frequencyLength: 12,
        } as PaymentFrequency,
        7001,
        manager,
      );

    return { scheduleDay };
  }

  it('uses the teacher qualification rate and updates the recent schedule during auto-renew', async () => {
    const { scheduleDay } = await renewWithFixtures();


    expect(repository.getTeacherQualificationRate).toHaveBeenCalledWith(14, 8, manager);
    expect(repository.createLessonForAutoRenewal).toHaveBeenCalled();
    expect(repository.createLessonForAutoRenewal.mock.calls[0][6]).toBe(130);
    expect(repository.createLessonForAutoRenewal.mock.calls[0][7]).toBe(62);
    expect(repository.createPrivateLessonsForAutoRenewal).toHaveBeenCalled();
    expect(repository.createPrivateLessonsForAutoRenewal.mock.calls[0][0].length).toBeGreaterThan(0);
    expect(repository.updateCourseScheduleEndDate).toHaveBeenCalledWith(
      300,
      expect.any(Date),
      manager,
    );
    expect(dateParts(repository.updateCourseScheduleEndDate.mock.calls[0][1])).toEqual([
      2024,
      1,
      29,
    ]);
    expect(repository.updateCourseScheduleIsRecent).toHaveBeenCalledWith(300, false, manager);
    expect(repository.createCourseSchedule).toHaveBeenCalledWith(
      88,
      '15:00:00',
      '00:45:00',
      scheduleDay,
      expect.any(Date),
      expect.any(Date),
      14,
      manager,
    );
    expect(dateParts(repository.createCourseSchedule.mock.calls[0][4])).toEqual([
      2024,
      2,
      1,
    ]);
    expect(dateParts(repository.createCourseSchedule.mock.calls[0][5])).toEqual([
      2026,
      1,
      28,
    ]);
    expect(repository.updateCourseEndDate).toHaveBeenCalledWith(88, expect.any(Date), manager);
    expect(repository.updateEnrolmentEndDate).toHaveBeenCalledWith(77, expect.any(Date), manager);
    expect(dateParts(repository.updateCourseEndDate.mock.calls[0][1])).toEqual([
      2026,
      1,
      28,
    ]);
    expect(dateParts(repository.updateEnrolmentEndDate.mock.calls[0][1])).toEqual([
      2026,
      1,
      28,
    ]);
  });
});
