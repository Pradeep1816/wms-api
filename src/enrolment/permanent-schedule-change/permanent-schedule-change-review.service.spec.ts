import { describe, expect, it, vi } from 'vitest';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import type { PermanentScheduleChangeReviewRepository } from '../repositories/permanent-schedule-change/permanent-schedule-change-review.repository';
import { PermanentScheduleChangeReviewService } from './permanent-schedule-change-review.service';

describe('PermanentScheduleChangeReviewService', () => {
  const course = {
    id: 44,
    programId: 8,
    program: { id: 8, name: 'Piano Core' },
    teacherId: 10,
    teacher: {
      profile: { firstname: 'Current', lastname: 'Teacher' },
    },
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T00:00:00.000Z'),
  };
  const enrolment = {
    studentId: 22,
    student: { firstName: 'Test', lastName: 'Student' },
  };

  function createRepository(overrides: object = {}) {
    return {
      findCourse: vi.fn().mockResolvedValue(course),
      findEnrolment: vi.fn().mockResolvedValue(enrolment),
      findDraftLessons: vi.fn().mockResolvedValue([]),
      findEligibleOldLessons: vi.fn().mockResolvedValue([]),
      findHolidays: vi.fn().mockResolvedValue([]),
      findCourseDraftLessons: vi.fn().mockResolvedValue([]),
      findConflictFlags: vi.fn().mockResolvedValue(new Map()),
      findRecentSchedule: vi.fn().mockResolvedValue({ fromTime: '16:00:00' }),
      findChangedLessons: vi.fn().mockResolvedValue({
        unscheduledLessons: [],
        rescheduledLessons: [],
      }),
      ...overrides,
    };
  }

  function createService(repository: object) {
    return new PermanentScheduleChangeReviewService(
      repository as PermanentScheduleChangeReviewRepository,
    );
  }

  it('owns review behavior without calling the generic lesson review service', async () => {
    const repository = createRepository();
    const service = createService(repository);

    await expect(service.getReview(44, 3, false)).resolves.toEqual({
      courseId: 44,
      programId: 8,
      programName: 'Piano Core',
      teacherId: 10,
      teacherName: 'Current Teacher',
      studentName: 'Test Student',
      startDate: course.startDate,
      endDate: course.endDate,
      startTime: '16:00:00',
      lessons: [],
      unscheduledLessons: [],
      rescheduledLessons: [],
      summary: {
        holidayConflicted: 0,
        conflicted: 0,
        unscheduled: 0,
        scheduled: 0,
        total: 0,
      },
    });
    expect(repository.findEligibleOldLessons).not.toHaveBeenCalled();
    expect(repository.findChangedLessons).not.toHaveBeenCalled();
  });

  it('excludes exactly the old lessons that PSC confirmation will cancel', async () => {
    const beginDate = new Date('2026-09-04T00:00:00.000Z');
    const endDate = new Date('2026-12-31T23:59:59.999Z');
    const draftLesson = {
      id: 201,
      teacherId: 20,
      teacher: {
        profile: { firstname: 'New', lastname: 'Teacher' },
      },
      date: new Date('2026-09-04T17:45:00.000Z'),
      duration: '00:45:00',
    };
    const repository = createRepository({
      findDraftLessons: vi.fn().mockResolvedValue([draftLesson]),
      findEligibleOldLessons: vi.fn().mockResolvedValue([
        {
          id: 101,
          status: LessonStatusEnum.SCHEDULED,
          date: new Date('2026-09-04T17:30:00.000Z'),
          originalDate: new Date('2026-09-04T17:30:00.000Z'),
        },
        {
          id: 102,
          status: LessonStatusEnum.RESCHEDULED,
          date: new Date('2026-09-11T17:30:00.000Z'),
          originalDate: new Date('2026-08-28T17:30:00.000Z'),
        },
      ]),
    });
    const service = createService(repository);

    const review = await service.getReview(44, 3, true, beginDate, endDate);

    expect(repository.findConflictFlags).toHaveBeenCalledWith(
      [draftLesson],
      22,
      10,
      3,
      [101],
    );
    expect(repository.findChangedLessons).toHaveBeenCalledWith(44, beginDate);
    expect(review).toMatchObject({
      teacherId: 20,
      teacherName: 'New Teacher',
      startDate: beginDate,
      endDate,
      startTime: '17:45:00',
      summary: { total: 1, scheduled: 1 },
    });
  });
});
