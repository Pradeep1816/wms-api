import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PermanentScheduleChangeDraftService } from './permanent-schedule-change-draft.service';
import type { PermanentScheduleChangeReviewRequestDto } from '../dto/permanent-schedule-change/permanent-schedule-change-review-request.dto';
import type { RescheduleRequestDto } from '../dto/permanent-schedule-change/permanent-schedule-change-request.dto';
import { PermanentScheduleChangeService } from '../services/permanent-schedule-change.service';
import { PermanentScheduleChangeValidator } from '../validators/permanent-schedule-change/permanent-schedule-change.validator';
import type { PermanentScheduleChangeQueryRepository } from '../repositories/permanent-schedule-change/permanent-schedule-change-query.repository';
import type { PermanentScheduleChangeReviewService } from './permanent-schedule-change-review.service';
import type { PermanentScheduleChangeConfirmationService } from './permanent-schedule-change-confirmation.service';

describe('PermanentScheduleChangeService', () => {
  const request: PermanentScheduleChangeReviewRequestDto = { courseId: 44 };

  const createService = (
    draftService: object,
    queryRepository: object,
    reviewService: object = {},
    validator: object = {},
    confirmationService: object = {},
  ) => {
    const businessValidator = Object.assign(
      new PermanentScheduleChangeValidator(
        queryRepository as PermanentScheduleChangeQueryRepository,
      ),
      validator,
    );

    return new PermanentScheduleChangeService(
      draftService as PermanentScheduleChangeDraftService,
      queryRepository as PermanentScheduleChangeQueryRepository,
      reviewService as PermanentScheduleChangeReviewService,
      businessValidator,
      confirmationService as PermanentScheduleChangeConfirmationService,
    );
  };

  const eligibleEnrolment = {
    id: 22,
    courseId: 44,
    course: {
      id: 44,
      locationId: 3,
      programId: 8,
      program: { type: 1 },
      type: 1,
      isDeleted: false,
      teacherId: 10,
      teacher: {
        profile: { firstname: 'Current', lastname: 'Teacher' },
      },
    },
  };

  it('owns preview orchestration and validates a selected month', async () => {
    const validator = { validateMonthConstraints: vi.fn() };
    const queryRepository = {
      findEnrolment: vi.fn().mockResolvedValue(eligibleEnrolment),
      findRecentSchedule: vi.fn().mockResolvedValue({
        day: 1,
        fromTime: '16:00:00',
        duration: '00:30:00',
      }),
      findQualifiedTeachers: vi
        .fn()
        .mockResolvedValue([{ id: 20, name: 'New Teacher' }]),
    };
    const service = createService({}, queryRepository, {}, validator);

    await expect(
      service.getPreview(3, 22, { startMonth: '2026-02' }),
    ).resolves.toEqual({
      courseId: 44,
      currentTeacherId: 10,
      currentTeacherName: 'Current Teacher',
      currentDayTime: 'Monday 04:00 PM',
      currentDuration: '00:30',
      teachers: [{ id: 20, name: 'New Teacher' }],
      dateToChangeSchedule: '2026-02',
    });
    expect(validator.validateMonthConstraints).toHaveBeenCalledWith(
      44,
      new Date('2026-02-01T00:00:00.000Z'),
    );
  });

  it('owns reschedule orchestration and delegates only draft persistence', async () => {
    const lastLessonDate = new Date('2026-06-15T00:00:00.000Z');
    const draftService = {
      replaceDraft: vi.fn().mockResolvedValue(lastLessonDate),
    };
    const validator = { validateMonthConstraints: vi.fn() };
    const queryRepository = {
      findEnrolment: vi.fn().mockResolvedValue(eligibleEnrolment),
      findRecentSchedule: vi.fn().mockResolvedValue({
        day: 1,
        fromTime: '16:00:00',
      }),
      findQualifiedTeachers: vi
        .fn()
        .mockResolvedValue([{ id: 20, name: 'New Teacher' }]),
    };
    const service = createService(draftService, queryRepository, {}, validator);
    const rescheduleRequest: RescheduleRequestDto = {
      dateToChangeSchedule: '2026-02',
      teacherId: 20,
      dayTime: 'Monday 04:00 PM',
      duration: '00:30',
      rescheduleBeginDate: 'Feb 2, 2026',
    };

    await expect(
      service.reschedule(3, 22, rescheduleRequest, 7001),
    ).resolves.toEqual({
      courseId: 44,
      rescheduleBeginDate: 'Feb 1, 2026',
      rescheduleEndDate: 'Jun 15, 2026',
      isTeacherOnlyChanged: true,
    });
    expect(validator.validateMonthConstraints).toHaveBeenCalledWith(
      44,
      new Date('2026-02-01T00:00:00.000Z'),
    );
    expect(draftService.replaceDraft).toHaveBeenCalledWith(
      eligibleEnrolment,
      eligibleEnrolment.course,
      new Date('2026-02-01T00:00:00.000Z'),
      20,
      1,
      '16:00:00',
      '00:30',
      new Date('2026-02-02T00:00:00.000Z'),
      7001,
    );
  });

  it('rejects a teacher who is not eligible for the program and location', async () => {
    const draftService = { replaceDraft: vi.fn() };
    const service = createService(
      draftService,
      {
        findEnrolment: vi.fn().mockResolvedValue(eligibleEnrolment),
        findQualifiedTeachers: vi.fn().mockResolvedValue([]),
      },
      {},
      { validateMonthConstraints: vi.fn() },
    );

    await expect(
      service.reschedule(
        3,
        22,
        {
          dateToChangeSchedule: '2026-02',
          teacherId: 20,
          dayTime: 'Monday 04:00 PM',
          duration: '00:30',
          rescheduleBeginDate: 'Feb 2, 2026',
        },
        7001,
      ),
    ).rejects.toThrow('Selected teacher is not eligible');
    expect(draftService.replaceDraft).not.toHaveBeenCalled();
  });

  it('rejects a review when the route enrolment does not own the course', async () => {
    const scheduleService = {};
    const reviewService = { getReview: vi.fn() };
    const queryRepository = {
      findEnrolmentForReview: vi.fn().mockResolvedValue(null),
    };
    const service = createService(
      scheduleService,
      queryRepository,
      reviewService,
    );

    await expect(service.getReview(3, 22, request)).rejects.toThrow(
      NotFoundException,
    );
    expect(reviewService.getReview).not.toHaveBeenCalled();
  });

  it('rejects a review from another location', async () => {
    const scheduleService = {};
    const reviewService = { getReview: vi.fn() };
    const queryRepository = {
      findEnrolmentForReview: vi
        .fn()
        .mockResolvedValue({ course: { locationId: 9 } }),
    };
    const service = createService(
      scheduleService,
      queryRepository,
      reviewService,
    );

    await expect(service.getReview(3, 22, request)).rejects.toThrow(
      BadRequestException,
    );
    expect(reviewService.getReview).not.toHaveBeenCalled();
  });

  it('delegates review after enrolment ownership and location validation', async () => {
    const review = { lessons: [] };
    const scheduleService = {};
    const reviewService = {
      getReview: vi.fn().mockResolvedValue(review),
    };
    const queryRepository = {
      findEnrolmentForReview: vi
        .fn()
        .mockResolvedValue({ course: { locationId: 3 } }),
    };
    const service = createService(
      scheduleService,
      queryRepository,
      reviewService,
    );

    await expect(service.getReview(3, 22, request)).resolves.toBe(review);
    expect(reviewService.getReview).toHaveBeenCalledWith(
      44,
      3,
      false,
      undefined,
      undefined,
    );
  });

  it('confirms PSC through its independent service using the route enrolment course', async () => {
    const queryRepository = {
      findEnrolment: vi.fn().mockResolvedValue(eligibleEnrolment),
    };
    const confirmationService = {
      confirm: vi.fn().mockResolvedValue(22),
    };
    const service = createService(
      {},
      queryRepository,
      {},
      {},
      confirmationService,
    );

    await expect(
      service.confirm(
        'main',
        3,
        22,
        {
          rescheduleBeginDate: '01-02-2026',
          rescheduleEndDate: '30-06-2026',
        },
        7001,
      ),
    ).resolves.toBe(22);
    expect(queryRepository.findEnrolment).toHaveBeenCalledWith(22, [
      'course',
      'course.program',
    ]);
    expect(confirmationService.confirm).toHaveBeenCalledWith({
      courseId: 44,
      enrolmentId: 22,
      locationId: 3,
      locationSlug: 'main',
      loggedUserId: 7001,
      rescheduleBeginDate: '01-02-2026',
      rescheduleEndDate: '30-06-2026',
    });
  });

  it('does not confirm PSC when the route enrolment is outside the location', async () => {
    const confirmationService = {
      confirm: vi.fn(),
    };
    const service = createService(
      {},
      {
        findEnrolment: vi.fn().mockResolvedValue({
          ...eligibleEnrolment,
          course: { ...eligibleEnrolment.course, locationId: 9 },
        }),
      },
      {},
      {},
      confirmationService,
    );

    await expect(
      service.confirm(
        'main',
        3,
        22,
        {
          rescheduleBeginDate: '01-02-2026',
          rescheduleEndDate: '30-06-2026',
        },
        7001,
      ),
    ).rejects.toThrow('Enrolment does not belong to this location');
    expect(confirmationService.confirm).not.toHaveBeenCalled();
  });
});
