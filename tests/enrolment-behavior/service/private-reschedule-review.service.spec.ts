import { afterEach, describe, expect, it, vi } from 'vitest';
import { PermanentScheduleChangeReviewRepository } from '../../../src/enrolment/repositories/permanent-schedule-change/permanent-schedule-change-review.repository';
import { PermanentScheduleChangeReviewService } from '../../../src/enrolment/permanent-schedule-change/permanent-schedule-change-review.service';
import { LessonStatusEnum } from '../../../src/lesson/enums/lesson-status';

function createRepositoryMock() {
  return {
    findOne: vi.fn(),
    find: vi.fn(),
    createQueryBuilder: vi.fn(),
  };
}

function createQueryBuilderMock(result: unknown) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder: Record<string, any> = {
    calls,
    select: (...args: unknown[]) => {
      calls.push({ method: 'select', args });
      return builder;
    },
    addSelect: (...args: unknown[]) => {
      calls.push({ method: 'addSelect', args });
      return builder;
    },
    leftJoinAndSelect: (...args: unknown[]) => {
      calls.push({ method: 'leftJoinAndSelect', args });
      return builder;
    },
    leftJoin: (...args: unknown[]) => {
      calls.push({ method: 'leftJoin', args });
      return builder;
    },
    innerJoin: (...args: unknown[]) => {
      calls.push({ method: 'innerJoin', args });
      return builder;
    },
    where: (...args: unknown[]) => {
      calls.push({ method: 'where', args });
      return builder;
    },
    andWhere: (...args: unknown[]) => {
      calls.push({ method: 'andWhere', args });
      return builder;
    },
    orderBy: (...args: unknown[]) => {
      calls.push({ method: 'orderBy', args });
      return builder;
    },
    addOrderBy: (...args: unknown[]) => {
      calls.push({ method: 'addOrderBy', args });
      return builder;
    },
    groupBy: (...args: unknown[]) => {
      calls.push({ method: 'groupBy', args });
      return builder;
    },
    getMany: vi.fn(async () =>
      Array.isArray(result) ? result : result ? [result] : [],
    ),
    getOne: vi.fn(async () => result),
    getRawMany: vi.fn(async () =>
      Array.isArray(result) ? result : result ? [result] : [],
    ),
  };
  return builder;
}

function buildService() {
  const lessonRepository = createRepositoryMock();
  const courseRepository = createRepositoryMock();
  const enrolmentRepository = createRepositoryMock();
  const courseScheduleRepository = createRepositoryMock();
  const holidayRepository = createRepositoryMock();
  const repository = new PermanentScheduleChangeReviewRepository(
    lessonRepository as any,
    courseRepository as any,
    enrolmentRepository as any,
    courseScheduleRepository as any,
    holidayRepository as any,
  );
  const service = new PermanentScheduleChangeReviewService(repository);

  return {
    service,
    lessonRepository,
    courseRepository,
    enrolmentRepository,
    courseScheduleRepository,
    holidayRepository,
  };
}

describe('enrolment behavior: private reschedule review service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('limits review to the reschedule window and excludes old lessons that will be cancelled from conflict checks', async () => {
    const {
      service,
      lessonRepository,
      courseRepository,
      enrolmentRepository,
      holidayRepository,
    } = buildService();

    const course = {
      id: 77,
      locationId: 3,
      isDeleted: false,
      startDate: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
      endDate: new Date(Date.UTC(2026, 4, 26, 15, 0, 0)),
      teacherId: 501,
      teacher: { profile: { firstname: 'Olive', lastname: 'Original' } },
      programId: 901,
      program: { id: 901, name: 'Private Piano' },
      enrolments: [
        { studentId: 801, student: { firstName: 'Mila', lastName: 'Student' } },
      ],
    };
    const enrolment = {
      courseId: 77,
      studentId: 801,
      student: { firstName: 'Mila', lastName: 'Student' },
    };

    const draftLessons = [
      {
        id: 1001,
        courseId: 77,
        teacherId: 601,
        date: new Date(Date.UTC(2026, 4, 6, 0, 30, 0)),
        duration: '00:45:00',
        isConfirmed: false,
        isDeleted: false,
        status: LessonStatusEnum.SCHEDULED,
        teacher: { profile: { firstname: 'Taylor', lastname: 'Teacher' } },
      },
      {
        id: 1002,
        courseId: 77,
        teacherId: 601,
        date: new Date(Date.UTC(2026, 4, 13, 0, 30, 0)),
        duration: '00:45:00',
        isConfirmed: false,
        isDeleted: false,
        status: LessonStatusEnum.SCHEDULED,
        teacher: { profile: { firstname: 'Taylor', lastname: 'Teacher' } },
      },
    ];

    const reviewLessonsQuery = createQueryBuilderMock(draftLessons);
    const holidayQueryOne = createQueryBuilderMock(null);
    const studentConflictQueryOne = createQueryBuilderMock(null);
    const holidayQueryTwo = createQueryBuilderMock(null);
    const studentConflictQueryTwo = createQueryBuilderMock(null);
    const oldLessonsQuery = createQueryBuilderMock([]);

    lessonRepository.createQueryBuilder
      .mockReturnValueOnce(reviewLessonsQuery)
      .mockReturnValueOnce(studentConflictQueryOne)
      .mockReturnValueOnce(studentConflictQueryTwo)
      .mockReturnValueOnce(oldLessonsQuery);
    holidayRepository.createQueryBuilder
      .mockReturnValueOnce(holidayQueryOne)
      .mockReturnValueOnce(holidayQueryTwo);

    courseRepository.findOne.mockResolvedValue(course);
    enrolmentRepository.findOne.mockResolvedValue(enrolment);
    lessonRepository.find
      .mockResolvedValueOnce([{ id: 8001 }, { id: 8002 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const review = await service.getReview(
      77,
      3,
      false,
      new Date(Date.UTC(2026, 4, 1, 0, 0, 0)),
      new Date(Date.UTC(2026, 4, 31, 23, 59, 59, 999)),
    );

    expect(review.summary).toEqual({
      holidayConflicted: 0,
      conflicted: 0,
      unscheduled: 0,
      scheduled: 2,
      total: 2,
    });
    expect(review.teacherName).toBe('Taylor Teacher');
    expect(review.teacherId).toBe(601);
    expect(review.studentName).toBe('Mila Student');
    expect(review.startDate.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(review.endDate.toISOString()).toBe('2026-05-31T23:59:59.999Z');
    expect(review.startTime).toBe('00:30:00');
    expect(review.lessons.map((lesson) => lesson.id)).toEqual([1001, 1002]);
    // The lessons excluded from conflict checks are the ones a permanent
    // schedule change will cancel, which is every non-cancelled lesson - not
    // only the SCHEDULED ones. Asserting SCHEDULED here previously locked in a
    // defect: a leftover RESCHEDULED lesson stayed visible to the conflict
    // check and produced a clash on that one date. See
    // lesson-review.service.spec.ts, 'permanent schedule change - lessons
    // excluded from conflict checks'.
    expect(lessonRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          courseId: 77,
          type: 1,
          isDeleted: false,
          isConfirmed: true,
          status: expect.objectContaining({
            type: 'not',
            value: LessonStatusEnum.CANCELED,
          }),
        }),
        select: ['id', 'status', 'date', 'originalDate'],
      }),
    );

    expect(reviewLessonsQuery.calls).toContainEqual({
      method: 'andWhere',
      args: ['DATE(lesson.date) >= :beginDate', { beginDate: '2026-05-01' }],
    });
    expect(reviewLessonsQuery.calls).toContainEqual({
      method: 'andWhere',
      args: ['DATE(lesson.date) <= :endDate', { endDate: '2026-05-31' }],
    });

    const exclusion = studentConflictQueryOne.calls.find(
      (call) =>
        call.method === 'andWhere' &&
        typeof call.args[0] === 'string' &&
        call.args[0].includes('conflictLesson.id NOT IN'),
    );
    expect(exclusion?.args[1]).toEqual({
      excludeConflictLessonIds: [8001, 8002],
    });
  });
});
