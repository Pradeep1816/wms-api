import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { EnrolmentAutoRenewalCronRepository } from '../repositories/enrolment-auto-renewal-cron.repository';
import { EnrolmentAutoRenewalCronService } from './enrolment-auto-renewal-cron.service';
import { CourseRateResolverService } from '../../pricing/services/course-rate-resolver.service';

describe('EnrolmentAutoRenewalCronService', () => {
  function createService() {
    const repository = {
      getTargetEnrolments: vi.fn(),
      createPaymentCycleForLegacyAutoRenewal: vi.fn(),
      createAutoRenewalPaymentCycleForLegacyAutoRenewal: vi.fn(),
      getConfirmedLessonsForLegacyAutoRenewalEnrolment: vi.fn(),
      updateLessonDueDateForLegacyAutoRenewal: vi.fn(),
    } as unknown as EnrolmentAutoRenewalCronRepository;

    const dataSource = {
      transaction: vi.fn(),
    } as never;

    const cronLockService = {
      runWithLock: vi.fn((_lockName, _jobName, _logger, run) => run()),
    } as never;

    // Prepaid re-pricing has its own spec; here it only has to be called.
    const enrolmentPrepaidPricing = {
      applyForEnrolment: vi
        .fn()
        .mockResolvedValue({ cyclesPriced: 0, cyclesSkipped: 0, skipped: null }),
    };

    const service = new EnrolmentAutoRenewalCronService(
      repository,
      dataSource,
      cronLockService,
      new CourseRateResolverService(),
      enrolmentPrepaidPricing as never,
    );

    return {
      service,
      repository: repository as unknown as {
        getTargetEnrolments: ReturnType<typeof vi.fn>;
        createPaymentCycleForLegacyAutoRenewal: ReturnType<typeof vi.fn>;
        createAutoRenewalPaymentCycleForLegacyAutoRenewal: ReturnType<
          typeof vi.fn
        >;
        getConfirmedLessonsForLegacyAutoRenewalEnrolment: ReturnType<
          typeof vi.fn
        >;
        updateLessonDueDateForLegacyAutoRenewal: ReturnType<typeof vi.fn>;
      },
      dataSource: dataSource as unknown as {
        transaction: ReturnType<typeof vi.fn>;
      },
    };
  }

  it('continues processing other enrolments when one candidate is missing legacy renewal context', async () => {
    process.env.SMW_TEST_CURRENT_DATE = '2026-05-21';
    const { service, repository } = createService();

    repository.getTargetEnrolments.mockResolvedValue([
      { courseId: 10, enrolmentId: 100 },
      { courseId: 11, enrolmentId: 101 },
    ]);
    vi.spyOn(service as never, 'runLegacyAutoRenewal')
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const result = await service.runManually(77);

    expect(result).not.toBeNull();
    expect(result?.enrolmentsMatched).toBe(2);
    expect(result?.enrolmentsProcessed).toBe(2);
    expect(result?.enrolmentsFailed).toBe(0);
    expect((service as never).runLegacyAutoRenewal).toHaveBeenCalledTimes(2);
  });

  it('logs unexpected renewal errors and continues processing remaining enrolments', async () => {
    process.env.SMW_TEST_CURRENT_DATE = '2026-05-21';
    const { service, repository } = createService();

    repository.getTargetEnrolments.mockResolvedValue([
      { courseId: 10, enrolmentId: 100 },
      { courseId: 11, enrolmentId: 101 },
    ]);
    vi.spyOn(service as never, 'runLegacyAutoRenewal')
      .mockRejectedValueOnce(
        new BadRequestException('Unexpected validation error'),
      )
      .mockResolvedValueOnce(undefined);

    const result = await service.runManually(77);

    expect(result).not.toBeNull();
    expect(result?.enrolmentsMatched).toBe(2);
    expect(result?.enrolmentsProcessed).toBe(1);
    expect(result?.enrolmentsFailed).toBe(1);
    expect((service as never).runLegacyAutoRenewal).toHaveBeenCalledTimes(2);
  });

  it('replaces a moved final lesson time with the permanent schedule time', () => {
    const { service } = createService();
    const courseEndBasedCandidate = new Date('2026-10-24T16:30:00.000Z');
    const serviceWithScheduleTime = service as unknown as {
      applyCourseScheduleTime(date: Date, fromTime: string): Date;
    };

    const lessonDate = serviceWithScheduleTime.applyCourseScheduleTime(
      courseEndBasedCandidate,
      '12:30:00',
    );

    expect(lessonDate.toISOString()).toBe('2026-10-24T12:30:00.000Z');
    expect(courseEndBasedCandidate.toISOString()).toBe(
      '2026-10-24T16:30:00.000Z',
    );
  });

  it('creates the legacy fixed count of monthly payment cycles', async () => {
    const { service, repository } = createService();
    let nextPaymentCycleId = 1000;

    repository.createPaymentCycleForLegacyAutoRenewal.mockImplementation(
      async (_enrolmentId, _courseId, startDate, endDate) => ({
        id: nextPaymentCycleId++,
        startDate,
        endDate,
      }),
    );
    repository.createAutoRenewalPaymentCycleForLegacyAutoRenewal.mockResolvedValue(
      undefined,
    );

    const result = await (service as never).setAutoRenewalPaymentCycle(
      26807,
      26478,
      new Date('2026-08-22T07:30:00.000Z'),
      new Date('2028-08-31T18:29:59.000Z'),
      { frequencyLength: 1 },
      5514,
      727,
    );

    expect(result).toHaveLength(24);
    expect(
      repository.createPaymentCycleForLegacyAutoRenewal,
    ).toHaveBeenCalledTimes(24);
    expect(
      repository.createAutoRenewalPaymentCycleForLegacyAutoRenewal,
    ).toHaveBeenCalledTimes(24);
  });

  it('keeps auto-renewed cycle due dates independent of moved lesson original dates', async () => {
    const { service, repository } = createService();
    repository.getConfirmedLessonsForLegacyAutoRenewalEnrolment.mockResolvedValue(
      [
        {
          lesson: {
            id: 5170162,
            date: new Date('2026-11-04T09:15:00.000Z'),
            originalDate: new Date('2026-11-04T09:15:00.000Z'),
          },
          paymentCycleId: 729391,
          paymentCycleStartDate: '2026-11-01',
        },
        {
          lesson: {
            id: 5276213,
            date: new Date('2026-11-05T09:15:00.000Z'),
            originalDate: new Date('2026-10-14T09:15:00.000Z'),
          },
          paymentCycleId: 729391,
          paymentCycleStartDate: '2026-11-01',
        },
      ],
    );

    await (service as never).setDueDate(33310);

    expect(
      repository.updateLessonDueDateForLegacyAutoRenewal,
    ).toHaveBeenCalledTimes(2);
    expect(
      repository.updateLessonDueDateForLegacyAutoRenewal,
    ).toHaveBeenNthCalledWith(
      1,
      5170162,
      new Date('2026-10-15T00:00:00.000Z'),
      undefined,
    );
    expect(
      repository.updateLessonDueDateForLegacyAutoRenewal,
    ).toHaveBeenNthCalledWith(
      2,
      5276213,
      new Date('2026-10-15T00:00:00.000Z'),
      undefined,
    );
  });

  it('does not advance auto-renewed due dates before a later first occurrence', async () => {
    const { service, repository } = createService();
    repository.getConfirmedLessonsForLegacyAutoRenewalEnrolment.mockResolvedValue(
      [
        {
          lesson: {
            id: 6001,
            date: new Date('2026-09-03T19:00:00.000Z'),
            originalDate: new Date('2026-09-03T19:00:00.000Z'),
          },
          paymentCycleId: 801,
          paymentCycleStartDate: '2026-08-01',
        },
      ],
    );

    await (service as never).setDueDate(33310);

    expect(
      repository.updateLessonDueDateForLegacyAutoRenewal,
    ).toHaveBeenCalledWith(
      6001,
      new Date('2026-08-15T00:00:00.000Z'),
      undefined,
    );
  });

  it('matches legacy diffInMonths behavior for a single calendar month range', () => {
    const { service } = createService();

    const result = (service as never).diffInMonths(
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-31T00:00:00.000Z'),
    );

    expect(result).toBe(0);
  });
});
