import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EntityManager } from 'typeorm';
import { PermanentScheduleChangeConfirmationService } from './permanent-schedule-change-confirmation.service';
import { PermanentScheduleChangeConfirmer } from './permanent-schedule-change-confirmer';
import type { PermanentScheduleChangeConfirmationPersistence } from '../repositories/permanent-schedule-change/permanent-schedule-change-confirmation.repository';

type ConfirmationTransactionWork = (
  persistence: PermanentScheduleChangeConfirmationPersistence,
  manager: EntityManager,
) => Promise<unknown>;

function createPersistence() {
  return {
    findCourse: vi.fn(),
    findUnconfirmedLessons: vi.fn(),
    markCourseConfirmed: vi.fn(),
    markLessonsConfirmed: vi.fn(),
    ensureLessonEmailStatuses: vi.fn(),
    updateCourseEndDate: vi.fn(),
    findEnrolment: vi.fn(),
    confirmEnrolment: vi.fn(),
    findEnrolmentId: vi.fn(),
    findEnrolmentPaymentFrequency: vi.fn(),
    findPaymentCycles: vi.fn(),
    savePaymentCycle: vi.fn(),
    createPaymentCycleLessonLinks: vi.fn(),
    findConfirmedLessonsForDueDate: vi.fn(),
    updateLessonDueDates: vi.fn(),
  };
}

describe('PermanentScheduleChangeConfirmationService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const input = {
    courseId: 44,
    enrolmentId: 22,
    locationId: 3,
    locationSlug: 'main',
    loggedUserId: 7001,
    rescheduleBeginDate: '01-05-2026',
    rescheduleEndDate: '13-05-2026',
  };

  it('owns the complete PSC confirmation transaction independently', async () => {
    const persistence = createPersistence();
    const manager = { transaction: vi.fn() };
    const repository = {
      transaction: vi.fn((work: ConfirmationTransactionWork) =>
        work(
          persistence as unknown as PermanentScheduleChangeConfirmationPersistence,
          manager as unknown as EntityManager,
        ),
      ),
    };
    const customerBalance = { recalculateAndPersist: vi.fn() };
    const prepaidPricing = { applyForEnrolment: vi.fn() };
    const service = new PermanentScheduleChangeConfirmationService(
      repository as never,
      customerBalance as never,
      prepaidPricing as never,
    );
    const course = {
      id: 44,
      startDate: new Date('2026-04-07T15:00:00.000Z'),
      endDate: new Date('2026-05-12T15:00:00.000Z'),
      program: { type: 1 },
    };
    const replacementLessons = [
      {
        id: 101,
        date: new Date('2026-05-06T15:00:00.000Z'),
        originalDate: new Date('2026-05-05T15:00:00.000Z'),
      },
      {
        id: 102,
        date: new Date('2026-05-13T15:00:00.000Z'),
        originalDate: new Date('2026-05-12T15:00:00.000Z'),
      },
    ];
    const enrolment = {
      id: 22,
      student: { user: { id: 401 } },
      paymentFrequency: { frequencyLength: 1 },
    };
    const cycle = {
      id: 90,
      startDate: new Date('2026-05-01T00:00:00.000Z'),
      endDate: new Date('2026-05-31T00:00:00.000Z'),
    };

    persistence.findCourse.mockResolvedValue(course);
    persistence.findUnconfirmedLessons.mockResolvedValue(replacementLessons);
    persistence.findEnrolment.mockResolvedValue(enrolment);
    persistence.findEnrolmentPaymentFrequency.mockResolvedValue({
      paymentCycleStartDate: new Date('2026-05-01T00:00:00.000Z'),
    });
    persistence.findPaymentCycles.mockResolvedValue([cycle]);
    persistence.findConfirmedLessonsForDueDate.mockResolvedValue(
      replacementLessons,
    );
    const confirmer = vi
      .spyOn(PermanentScheduleChangeConfirmer.prototype, 'confirm')
      .mockResolvedValue();

    await expect(service.confirm(input)).resolves.toBe(22);

    expect(repository.transaction).toHaveBeenCalledTimes(1);
    expect(confirmer).toHaveBeenCalledWith(
      course,
      replacementLessons,
      '01-05-2026',
      '13-05-2026',
      7001,
    );
    expect(confirmer.mock.invocationCallOrder[0]).toBeLessThan(
      persistence.markLessonsConfirmed.mock.invocationCallOrder[0],
    );
    expect(persistence.markLessonsConfirmed).toHaveBeenCalledWith([101, 102]);
    expect(persistence.ensureLessonEmailStatuses).toHaveBeenCalledWith([
      101, 102,
    ]);
    expect(persistence.updateCourseEndDate).toHaveBeenCalledWith(
      44,
      replacementLessons[1].date,
    );
    expect(persistence.confirmEnrolment).toHaveBeenCalledWith(
      22,
      replacementLessons[1].date,
    );
    expect(prepaidPricing.applyForEnrolment).toHaveBeenCalledWith(
      { enrolmentId: 22, frequencyLength: 1 },
      manager,
    );
    expect(customerBalance.recalculateAndPersist).toHaveBeenCalledWith(401, {
      manager,
      updatedByUserId: 7001,
      locationSlug: 'main',
    });
  });

  it('does not run relationship migration when no PSC draft exists', async () => {
    const persistence = createPersistence();
    const repository = {
      transaction: vi.fn((work: ConfirmationTransactionWork) =>
        work(
          persistence as unknown as PermanentScheduleChangeConfirmationPersistence,
          {} as EntityManager,
        ),
      ),
    };
    const service = new PermanentScheduleChangeConfirmationService(
      repository as never,
      {} as never,
      {} as never,
    );
    persistence.findCourse.mockResolvedValue({ id: 44 });
    persistence.findUnconfirmedLessons.mockResolvedValue([]);
    persistence.findEnrolmentId.mockResolvedValue(22);
    const confirmer = vi.spyOn(
      PermanentScheduleChangeConfirmer.prototype,
      'confirm',
    );

    await expect(service.confirm(input)).resolves.toBe(22);

    expect(persistence.markCourseConfirmed).toHaveBeenCalledWith(44);
    expect(confirmer).not.toHaveBeenCalled();
    expect(persistence.markLessonsConfirmed).not.toHaveBeenCalled();
  });
});
