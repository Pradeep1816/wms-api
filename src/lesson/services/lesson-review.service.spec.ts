import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { LessonReviewService } from './lesson-review.service';
import { LessonStatusEnum } from '../enums/lesson-status';
import { Program } from '../../program/entities/program.entity';

function createRepositoryMock() {
  return {
    findOne: vi.fn(),
    find: vi.fn(),
    createQueryBuilder: vi.fn(),
  };
}

function createTeacherSubstituteRepositoryMock() {
  return {
    checkTeacherQualification: vi.fn(),
    checkTeacherConflict: vi.fn(),
    checkTeacherScheduledForDay: vi.fn(),
    checkTeacherAvailableAtTime: vi.fn(),
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
    distinct: (...args: unknown[]) => {
      calls.push({ method: 'distinct', args });
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

describe('LessonReviewService', () => {
  let service: LessonReviewService;
  let lessonRepository: ReturnType<typeof createRepositoryMock>;
  let courseRepository: ReturnType<typeof createRepositoryMock>;
  let enrolmentRepository: ReturnType<typeof createRepositoryMock>;
  let courseScheduleRepository: ReturnType<typeof createRepositoryMock>;
  let holidayRepository: ReturnType<typeof createRepositoryMock>;
  let userRepository: ReturnType<typeof createRepositoryMock>;
  let userProfileRepository: ReturnType<typeof createRepositoryMock>;
  let studentRepository: ReturnType<typeof createRepositoryMock>;
  let teacherSubstituteRepository: ReturnType<
    typeof createTeacherSubstituteRepositoryMock
  >;

  beforeEach(() => {
    lessonRepository = createRepositoryMock();
    lessonRepository.createQueryBuilder.mockImplementation(() =>
      createQueryBuilderMock(null),
    );
    courseRepository = createRepositoryMock();
    enrolmentRepository = createRepositoryMock();
    courseScheduleRepository = createRepositoryMock();
    holidayRepository = createRepositoryMock();
    userRepository = createRepositoryMock();
    userProfileRepository = createRepositoryMock();
    studentRepository = createRepositoryMock();
    teacherSubstituteRepository = createTeacherSubstituteRepositoryMock();

    service = new LessonReviewService(
      lessonRepository as any,
      courseRepository as any,
      enrolmentRepository as any,
      courseScheduleRepository as any,
      holidayRepository as any,
      userRepository as any,
      userProfileRepository as any,
      studentRepository as any,
      {} as any,
      teacherSubstituteRepository as any,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws NotFoundException when course does not exist', async () => {
    courseRepository.findOne.mockResolvedValue(null);

    await expect(service.getLessonReview(77, 3)).rejects.toThrow(
      new NotFoundException('Course with ID 77 not found'),
    );
  });

  it('throws NotFoundException when enrolment does not exist for the course', async () => {
    courseRepository.findOne.mockResolvedValue({
      id: 77,
      isDeleted: false,
      startDate: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
    });
    enrolmentRepository.findOne.mockResolvedValue(null);

    await expect(service.getLessonReview(77, 3)).rejects.toThrow(
      new NotFoundException('Enrolment for course 77 not found'),
    );
  });

  it('loads scheduled draft lessons from course start and returns schedule metadata', async () => {
    const course = {
      id: 77,
      locationId: 3,
      isDeleted: false,
      startDate: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
      endDate: new Date(Date.UTC(2026, 4, 12, 15, 0, 0)),
      teacherId: 601,
      teacher: { profile: { firstname: 'Taylor', lastname: 'Teacher' } },
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
    const lessons = [
      {
        id: 1001,
        courseId: 77,
        teacherId: 601,
        date: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
        duration: '00:45:00',
        isConfirmed: false,
        isDeleted: false,
        status: LessonStatusEnum.SCHEDULED,
      },
    ];

    const reviewLessonsQuery = createQueryBuilderMock(lessons);
    const holidayQuery = createQueryBuilderMock(null);
    const studentConflictQuery = createQueryBuilderMock(null);
    lessonRepository.createQueryBuilder
      .mockReturnValueOnce(reviewLessonsQuery)
      .mockReturnValueOnce(studentConflictQuery);
    holidayRepository.createQueryBuilder.mockReturnValueOnce(holidayQuery);

    courseRepository.findOne.mockResolvedValue(course);
    enrolmentRepository.findOne.mockResolvedValue(enrolment);
    lessonRepository.find.mockResolvedValueOnce([]);
    courseScheduleRepository.findOne.mockResolvedValue({
      courseId: 77,
      isRecent: true,
      fromTime: '15:00:00',
    });

    const review = await service.getLessonReview(77, 3);

    expect(review.summary).toEqual({
      holidayConflicted: 0,
      conflicted: 0,
      unscheduled: 0,
      scheduled: 1,
      total: 1,
    });
    expect(review.programId).toBe(901);
    expect(review.programName).toBe('Private Piano');
    expect(review.teacherId).toBe(601);
    expect(review.teacherName).toBe('Taylor Teacher');
    expect(review.studentName).toBe('Mila Student');
    expect(review.startDate).toBe(course.startDate);
    expect(review.endDate).toBe(course.endDate);
    expect(review.startTime).toBe('15:00:00');
    expect(review.lessons).toEqual([
      expect.objectContaining({
        id: 1001,
        isHolidayConflict: false,
        isConflict: false,
      }),
    ]);
    expect(reviewLessonsQuery.calls).toContainEqual({
      method: 'andWhere',
      args: ['DATE(lesson.date) >= :startDate', { startDate: '2026-04-07' }],
    });
  });

  it('marks holiday conflicts separately from general conflicts', async () => {
    const course = {
      id: 77,
      locationId: 3,
      isDeleted: false,
      startDate: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
      endDate: new Date(Date.UTC(2026, 4, 12, 15, 0, 0)),
      teacherId: 601,
      teacher: { profile: { firstname: 'Taylor', lastname: 'Teacher' } },
      program: { name: 'Private Piano' },
      enrolments: [
        { studentId: 801, student: { firstName: 'Mila', lastName: 'Student' } },
      ],
    };
    const enrolment = {
      courseId: 77,
      studentId: 801,
      student: { firstName: 'Mila', lastName: 'Student' },
    };
    const lesson = {
      id: 1001,
      courseId: 77,
      teacherId: 601,
      date: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
      duration: '00:45:00',
      isConfirmed: false,
      isDeleted: false,
      status: LessonStatusEnum.SCHEDULED,
    };

    lessonRepository.createQueryBuilder
      .mockReturnValueOnce(createQueryBuilderMock([lesson]))
      .mockReturnValueOnce(createQueryBuilderMock(null));
    holidayRepository.createQueryBuilder.mockReturnValueOnce(
      createQueryBuilderMock({ date: lesson.date, description: 'Holiday' }),
    );

    courseRepository.findOne.mockResolvedValue(course);
    enrolmentRepository.findOne.mockResolvedValue(enrolment);
    lessonRepository.find.mockResolvedValueOnce([]);
    courseScheduleRepository.findOne.mockResolvedValue({
      fromTime: '15:00:00',
    });

    const review = await service.getLessonReview(77, 3);

    expect(review.summary).toEqual({
      holidayConflicted: 1,
      conflicted: 0,
      unscheduled: 0,
      scheduled: 0,
      total: 1,
    });
    expect(review.lessons[0]).toEqual(
      expect.objectContaining({
        conflict: 'Holiday: Holiday',
        isHolidayConflict: true,
        isConflict: false,
      }),
    );
  });

  it('reports student overlap conflicts for confirmed lessons on the same date and time', async () => {
    const course = {
      id: 77,
      locationId: 3,
      isDeleted: false,
      startDate: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
      endDate: new Date(Date.UTC(2026, 4, 12, 15, 0, 0)),
      teacherId: 601,
      teacher: { profile: { firstname: 'Taylor', lastname: 'Teacher' } },
      program: { name: 'Private Piano' },
      enrolments: [
        { studentId: 801, student: { firstName: 'Mila', lastName: 'Student' } },
      ],
    };
    const enrolment = {
      courseId: 77,
      studentId: 801,
      student: { firstName: 'Mila', lastName: 'Student' },
    };
    const lesson = {
      id: 1001,
      courseId: 77,
      teacherId: 601,
      date: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
      duration: '00:45:00',
      isConfirmed: false,
      isDeleted: false,
      status: LessonStatusEnum.SCHEDULED,
    };

    const studentConflictQuery = createQueryBuilderMock({ id: 2001 });
    lessonRepository.createQueryBuilder
      .mockReturnValueOnce(createQueryBuilderMock([lesson]))
      .mockReturnValueOnce(studentConflictQuery)
      .mockReturnValueOnce(createQueryBuilderMock(null));
    holidayRepository.createQueryBuilder.mockReturnValueOnce(
      createQueryBuilderMock(null),
    );

    courseRepository.findOne.mockResolvedValue(course);
    enrolmentRepository.findOne.mockResolvedValue(enrolment);
    lessonRepository.find.mockResolvedValueOnce([]);
    courseScheduleRepository.findOne.mockResolvedValue({
      fromTime: '15:00:00',
    });

    const review = await service.getLessonReview(77, 3);

    expect(review.summary).toEqual({
      holidayConflicted: 0,
      conflicted: 1,
      unscheduled: 0,
      scheduled: 0,
      total: 1,
    });
    expect(review.lessons[0].conflict).toContain("student's another lesson");
    expect(review.lessons[0].isConflict).toBe(true);
    expect(studentConflictQuery.calls).toContainEqual({
      method: 'andWhere',
      args: ['enrolment.studentId = :studentId', { studentId: 801 }],
    });
  });

  it('reports teacher overlap conflicts for confirmed lessons on the same date and time', async () => {
    const course = {
      id: 77,
      locationId: 3,
      isDeleted: false,
      startDate: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
      endDate: new Date(Date.UTC(2026, 4, 12, 15, 0, 0)),
      teacherId: 601,
      teacher: { profile: { firstname: 'Taylor', lastname: 'Teacher' } },
      program: { name: 'Private Piano' },
      enrolments: [
        { studentId: 801, student: { firstName: 'Mila', lastName: 'Student' } },
      ],
    };
    const enrolment = {
      courseId: 77,
      studentId: 801,
      student: { firstName: 'Mila', lastName: 'Student' },
    };
    const lesson = {
      id: 1001,
      courseId: 77,
      teacherId: 601,
      date: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
      duration: '00:45:00',
      isConfirmed: false,
      isDeleted: false,
      status: LessonStatusEnum.SCHEDULED,
    };

    const teacherConflictQuery = createQueryBuilderMock({ id: 2002 });
    lessonRepository.createQueryBuilder
      .mockReturnValueOnce(createQueryBuilderMock([lesson]))
      .mockReturnValueOnce(createQueryBuilderMock(null))
      .mockReturnValueOnce(teacherConflictQuery);
    holidayRepository.createQueryBuilder.mockReturnValueOnce(
      createQueryBuilderMock(null),
    );

    courseRepository.findOne.mockResolvedValue(course);
    enrolmentRepository.findOne.mockResolvedValue(enrolment);
    lessonRepository.find.mockResolvedValueOnce([]);
    courseScheduleRepository.findOne.mockResolvedValue({
      fromTime: '15:00:00',
    });

    const review = await service.getLessonReview(77, 3);

    expect(review.summary).toEqual({
      holidayConflicted: 0,
      conflicted: 1,
      unscheduled: 0,
      scheduled: 0,
      total: 1,
    });
    expect(review.lessons[0].conflict).toContain("teacher's another lesson");
    expect(review.lessons[0].isConflict).toBe(true);
    expect(teacherConflictQuery.calls).toContainEqual({
      method: 'andWhere',
      args: ['lesson.teacherId = :teacherId', { teacherId: 601 }],
    });
  });

  it('reports same-course draft overlaps for the same enrolment', async () => {
    const course = {
      id: 77,
      locationId: 3,
      isDeleted: false,
      startDate: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
      endDate: new Date(Date.UTC(2026, 4, 12, 15, 0, 0)),
      teacherId: 601,
      teacher: { profile: { firstname: 'Taylor', lastname: 'Teacher' } },
      program: { name: 'Private Piano' },
      enrolments: [
        { studentId: 801, student: { firstName: 'Mila', lastName: 'Student' } },
      ],
    };
    const enrolment = {
      courseId: 77,
      studentId: 801,
      student: { firstName: 'Mila', lastName: 'Student' },
    };
    const firstLesson = {
      id: 1001,
      courseId: 77,
      teacherId: 601,
      date: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
      duration: '00:45:00',
      isConfirmed: false,
      isDeleted: false,
      status: LessonStatusEnum.SCHEDULED,
    };
    const overlappingDraft = {
      id: 1002,
      courseId: 77,
      teacherId: 601,
      date: new Date(Date.UTC(2026, 3, 7, 15, 15, 0)),
      duration: '00:45:00',
      isConfirmed: false,
      isDeleted: false,
    };

    lessonRepository.createQueryBuilder
      .mockReturnValueOnce(createQueryBuilderMock([firstLesson]))
      .mockReturnValueOnce(createQueryBuilderMock(null));
    holidayRepository.createQueryBuilder.mockReturnValueOnce(
      createQueryBuilderMock(null),
    );

    courseRepository.findOne.mockResolvedValue(course);
    enrolmentRepository.findOne.mockResolvedValue(enrolment);
    lessonRepository.find.mockResolvedValueOnce([
      firstLesson,
      overlappingDraft,
    ]);
    courseScheduleRepository.findOne.mockResolvedValue({
      fromTime: '15:00:00',
    });

    const review = await service.getLessonReview(77, 3);

    expect(review.summary).toEqual({
      holidayConflicted: 0,
      conflicted: 1,
      unscheduled: 0,
      scheduled: 0,
      total: 1,
    });
    expect(review.lessons[0].conflict).toContain('same enrolment lesson');
  });

  it('uses the legacy first blocking conflict for bulk teacher-change review', async () => {
    const course = {
      id: 77,
      locationId: 3,
      isDeleted: false,
      startDate: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
      endDate: new Date(Date.UTC(2026, 4, 12, 15, 0, 0)),
      teacherId: 501,
      teacher: { profile: { firstname: 'Olive', lastname: 'Original' } },
      programId: 901,
      program: {
        id: 901,
        name: 'Private Piano',
        type: Program.TYPE_PRIVATE_PROGRAM,
      },
      enrolments: [
        { studentId: 801, student: { firstName: 'Mila', lastName: 'Student' } },
      ],
    };
    const enrolment = {
      id: 31522,
      courseId: 77,
      studentId: 801,
      student: { firstName: 'Mila', lastName: 'Student' },
      course,
    };
    const oldLesson = {
      id: 9001,
      courseId: 77,
      teacherId: 501,
      date: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
      duration: '00:45:00',
      isConfirmed: true,
      isDeleted: false,
      status: LessonStatusEnum.SCHEDULED,
    };
    const newLesson = {
      id: 1001,
      courseId: 77,
      teacherId: 601,
      date: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
      duration: '00:45:00',
      isConfirmed: false,
      isDeleted: false,
      status: LessonStatusEnum.SCHEDULED,
    };

    const oldLessonsQuery = createQueryBuilderMock([oldLesson]);
    const newLessonsQuery = createQueryBuilderMock([newLesson]);
    const studentConflictQuery = createQueryBuilderMock(null);
    const teacherConflictQuery = createQueryBuilderMock(null);
    const unscheduledQuery = createQueryBuilderMock([]);
    const rescheduledQuery = createQueryBuilderMock([]);
    const holidayQuery = createQueryBuilderMock(null);

    lessonRepository.createQueryBuilder
      .mockReturnValueOnce(oldLessonsQuery)
      .mockReturnValueOnce(newLessonsQuery)
      .mockReturnValueOnce(studentConflictQuery)
      .mockReturnValueOnce(teacherConflictQuery)
      .mockReturnValueOnce(unscheduledQuery)
      .mockReturnValueOnce(rescheduledQuery);
    holidayRepository.createQueryBuilder.mockReturnValueOnce(holidayQuery);

    enrolmentRepository.find.mockResolvedValue([enrolment]);
    courseRepository.findOne.mockResolvedValue({ teacherId: 501 });
    userRepository.findOne
      .mockResolvedValueOnce({
        profile: { firstname: 'Olive', lastname: 'Original' },
      })
      .mockResolvedValueOnce({
        profile: { firstname: 'Taylor', lastname: 'Teacher' },
      });

    teacherSubstituteRepository.checkTeacherQualification.mockResolvedValue(
      true,
    );
    teacherSubstituteRepository.checkTeacherConflict.mockResolvedValue(true);
    teacherSubstituteRepository.checkTeacherScheduledForDay.mockResolvedValue(
      true,
    );
    teacherSubstituteRepository.checkTeacherAvailableAtTime.mockResolvedValue(
      true,
    );

    const review = await service.getLessonReviewForEnrolments(
      3,
      [31522],
      601,
      '2026-04-07',
      true,
    );

    expect(review.summary).toEqual({
      holidayConflicted: 0,
      conflicted: 1,
      unscheduled: 0,
      scheduled: 0,
      total: 1,
    });
    expect(review.lessons[0].conflict).toBe(
      'Please choose an eligible teacher who is qualified to teach Private Piano!',
    );
    expect(review.lessons[0].isConflict).toBe(true);
    expect(
      teacherSubstituteRepository.checkTeacherQualification,
    ).toHaveBeenCalledWith(601, 901, 3);
    expect(
      teacherSubstituteRepository.checkTeacherConflict,
    ).toHaveBeenCalledWith(
      601,
      newLesson.date,
      newLesson.duration,
      3,
      [1001, 9001],
    );
  });

  it('returns no blocking conflict when the teacher is qualified and unoccupied', async () => {
    const course = {
      id: 77,
      locationId: 3,
      isDeleted: false,
      startDate: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
      endDate: new Date(Date.UTC(2026, 4, 12, 15, 0, 0)),
      teacherId: 501,
      teacher: { profile: { firstname: 'Olive', lastname: 'Original' } },
      programId: 901,
      program: {
        id: 901,
        name: 'Private Piano',
        type: Program.TYPE_PRIVATE_PROGRAM,
      },
      enrolments: [
        { studentId: 801, student: { firstName: 'Mila', lastName: 'Student' } },
      ],
    };
    const enrolment = {
      id: 31522,
      courseId: 77,
      studentId: 801,
      student: { firstName: 'Mila', lastName: 'Student' },
      course,
    };
    const oldLesson = {
      id: 9001,
      courseId: 77,
      teacherId: 501,
      date: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
      duration: '00:45:00',
      isConfirmed: true,
      isDeleted: false,
      status: LessonStatusEnum.SCHEDULED,
    };
    const newLesson = {
      id: 1001,
      courseId: 77,
      teacherId: 601,
      date: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
      duration: '00:45:00',
      isConfirmed: false,
      isDeleted: false,
      status: LessonStatusEnum.SCHEDULED,
    };

    const oldLessonsQuery = createQueryBuilderMock([oldLesson]);
    const newLessonsQuery = createQueryBuilderMock([newLesson]);
    const studentConflictQuery = createQueryBuilderMock(null);
    const teacherConflictQuery = createQueryBuilderMock(null);
    const unscheduledQuery = createQueryBuilderMock([]);
    const rescheduledQuery = createQueryBuilderMock([]);
    const holidayQuery = createQueryBuilderMock(null);

    lessonRepository.createQueryBuilder
      .mockReturnValueOnce(oldLessonsQuery)
      .mockReturnValueOnce(newLessonsQuery)
      .mockReturnValueOnce(studentConflictQuery)
      .mockReturnValueOnce(teacherConflictQuery)
      .mockReturnValueOnce(unscheduledQuery)
      .mockReturnValueOnce(rescheduledQuery);
    holidayRepository.createQueryBuilder.mockReturnValueOnce(holidayQuery);

    enrolmentRepository.find.mockResolvedValue([enrolment]);
    courseRepository.findOne.mockResolvedValue({ teacherId: 501 });
    userRepository.findOne
      .mockResolvedValueOnce({
        profile: { firstname: 'Olive', lastname: 'Original' },
      })
      .mockResolvedValueOnce({
        profile: { firstname: 'Taylor', lastname: 'Teacher' },
      });

    teacherSubstituteRepository.checkTeacherQualification.mockResolvedValue(
      false,
    );
    teacherSubstituteRepository.checkTeacherConflict.mockResolvedValue(false);
    teacherSubstituteRepository.checkTeacherScheduledForDay.mockResolvedValue(
      true,
    );
    teacherSubstituteRepository.checkTeacherAvailableAtTime.mockResolvedValue(
      true,
    );

    const review = await service.getLessonReviewForEnrolments(
      3,
      [31522],
      601,
      '2026-04-07',
      true,
    );

    expect(review.summary).toEqual({
      holidayConflicted: 0,
      conflicted: 0,
      unscheduled: 0,
      scheduled: 1,
      total: 1,
    });
    expect(review.lessons[0].conflict).toBeUndefined();
    expect(review.lessons[0].isConflict).toBe(false);
    expect(review.lessons[0].isHolidayConflict).toBe(false);
  });
});
