import { describe, expect, it, vi } from 'vitest';
import { Lesson } from '../entities/lesson.entity';
import { LessonChangeService } from './lesson-change.service';

const sourceLesson = (id: number, date: string) =>
  Object.assign(new Lesson(), {
    id,
    courseId: 700,
    date: new Date(date),
    originalDate: new Date('2026-09-23T10:00:00.000Z'),
    duration: '00:15:00',
    programRate: 65,
    status: 5,
    isExploded: 1,
    isOnline: false,
  });

function build(options: {
  lessons: Lesson[];
  lineage?: Array<Record<string, unknown>>;
  destinationRates?: number[];
  enrolmentDiscounts?: number[];
}) {
  let nextLessonId = 300;
  let nextRateIndex = 0;
  let nextDiscountIndex = 0;
  const lessonRepository = {
    findLessonsByIds: vi.fn().mockResolvedValue(options.lessons),
    findCourseWithEnrolment: vi.fn().mockResolvedValue({
      id: 700,
      enrolments: [
        {
          courseId: 700,
          studentId: 50,
          student: { id: 50, firstName: 'Test', lastName: 'Student' },
        },
      ],
    }),
    findOrCreateExtraCourse: vi.fn().mockResolvedValue({ id: 900 }),
    findStudentEnrolmentByProgram: vi.fn().mockResolvedValue({ courseId: 900 }),
    createExtraCourseEnrolment: vi.fn(),
    createCourseSchedule: vi.fn(),
    createLesson: vi.fn((...args: unknown[]) =>
      Promise.resolve(
        Object.assign(new Lesson(), {
          id: ++nextLessonId,
          duration: args[3],
          programRate: args[8],
          tax: 0,
        }),
      ),
    ),
    makeLessonAsRoot: vi.fn(),
    createPrivateLessonRecord: vi.fn(),
    getLessonPayments: vi.fn().mockResolvedValue([]),
    getLessonNumber: vi.fn(),
    transferLessonPayments: vi.fn(),
    updatePaymentReferenceForCreditUsage: vi.fn(),
    cancelLesson: vi.fn(),
    findExplodedLineageForLessons: vi
      .fn()
      .mockResolvedValue(options.lineage ?? []),
    updateChangedLessonPricing: vi.fn(),
  };
  const queryRunner = {
    connect: vi.fn(),
    startTransaction: vi.fn(),
    commitTransaction: vi.fn(),
    rollbackTransaction: vi.fn(),
    release: vi.fn(),
  };
  const service = new LessonChangeService(
    lessonRepository as never,
    { createLog: vi.fn() } as never,
    { findLogObjectByName: vi.fn().mockResolvedValue(null) } as never,
    { findLogActivityByName: vi.fn() } as never,
    {
      findOne: vi.fn().mockResolvedValue({ id: 7, username: 'tester' }),
    } as never,
    { createQueryRunner: vi.fn(() => queryRunner) } as never,
    {
      resolveAndRecord: vi.fn(() =>
        Promise.resolve(options.destinationRates?.[nextRateIndex++] ?? 72.5),
      ),
      applyEnrolmentDiscounts: vi.fn(() =>
        Promise.resolve(
          options.enrolmentDiscounts?.[nextDiscountIndex++] ?? 0,
        ),
      ),
    } as never,
  );

  return { service, lessonRepository };
}

describe('LessonChangeService exploded lesson pricing', () => {
  const completeLineage = [
    {
      lessonId: 201,
      explodedParentId: 101,
      explodedBranchId: 201,
      explodedBranchDate: '2026-10-10T12:30:00.000Z',
      parentDuration: '00:15:00',
      descendantDepth: 0,
      splitCount: 1,
    },
    {
      lessonId: 201,
      explodedParentId: 100,
      explodedBranchId: 101,
      explodedBranchDate: '2026-09-23T10:00:00.000Z',
      parentDuration: '00:30:00',
      descendantDepth: 1,
      splitCount: 2,
    },
    {
      lessonId: 202,
      explodedParentId: 102,
      explodedBranchId: 202,
      explodedBranchDate: '2026-10-17T14:30:00.000Z',
      parentDuration: '00:15:00',
      descendantDepth: 0,
      splitCount: 1,
    },
    {
      lessonId: 202,
      explodedParentId: 100,
      explodedBranchId: 102,
      explodedBranchDate: '2026-09-23T10:15:00.000Z',
      parentDuration: '00:30:00',
      descendantDepth: 1,
      splitCount: 2,
    },
  ];

  it('preserves the target parent total for a complete exploded selection', async () => {
    const { service, lessonRepository } = build({
      lessons: [
        sourceLesson(201, '2026-10-10T12:30:00.000Z'),
        sourceLesson(202, '2026-10-17T14:30:00.000Z'),
      ],
      lineage: completeLineage,
    });

    const result = await service.changeLessons(
      'burlington',
      15,
      [201, 202],
      { programId: 4, teacherId: 8, lessonIds: [201, 202] },
      7,
    );

    expect(result.success).toBe(true);
    expect(lessonRepository.updateChangedLessonPricing.mock.calls).toEqual([
      [301, 72.52, 18.13],
      [302, 72.48, 18.12],
    ]);
  });

  it('preserves enrolment reductions while reconciling exploded totals', async () => {
    const { service, lessonRepository } = build({
      lessons: [
        sourceLesson(201, '2026-10-10T12:30:00.000Z'),
        sourceLesson(202, '2026-10-17T14:30:00.000Z'),
      ],
      lineage: completeLineage,
      enrolmentDiscounts: [0.55, 0.55],
    });

    const result = await service.changeLessons(
      'burlington',
      15,
      [201, 202],
      { programId: 4, teacherId: 8, lessonIds: [201, 202] },
      7,
    );

    expect(result.success).toBe(true);
    expect(lessonRepository.updateChangedLessonPricing.mock.calls).toEqual([
      [301, 72.52, 17.58],
      [302, 72.48, 17.57],
    ]);
  });

  it('preserves the target parent total for a three-way split', async () => {
    const { service, lessonRepository } = build({
      lessons: [
        sourceLesson(201, '2026-10-10T12:30:00.000Z'),
        sourceLesson(202, '2026-10-17T14:30:00.000Z'),
        sourceLesson(203, '2026-10-24T16:30:00.000Z'),
      ],
      lineage: [
        {
          lessonId: 201,
          explodedParentId: 100,
          explodedBranchId: 101,
          explodedBranchDate: '2026-09-23T10:00:00.000Z',
          parentDuration: '00:45:00',
          descendantDepth: 1,
          splitCount: 3,
        },
        {
          lessonId: 202,
          explodedParentId: 100,
          explodedBranchId: 102,
          explodedBranchDate: '2026-09-23T10:15:00.000Z',
          parentDuration: '00:45:00',
          descendantDepth: 1,
          splitCount: 3,
        },
        {
          lessonId: 203,
          explodedParentId: 100,
          explodedBranchId: 103,
          explodedBranchDate: '2026-09-23T10:30:00.000Z',
          parentDuration: '00:45:00',
          descendantDepth: 1,
          splitCount: 3,
        },
      ],
    });

    const result = await service.changeLessons(
      'burlington',
      15,
      [201, 202, 203],
      { programId: 4, teacherId: 8, lessonIds: [201, 202, 203] },
      7,
    );

    expect(result.success).toBe(true);
    expect(lessonRepository.updateChangedLessonPricing.mock.calls).toEqual([
      [301, 72.52, 18.13],
      [302, 72.52, 18.13],
      [303, 72.48, 18.12],
    ]);
  });

  it('keeps independent pricing when only one exploded branch is selected', async () => {
    const { service, lessonRepository } = build({
      lessons: [sourceLesson(201, '2026-10-10T12:30:00.000Z')],
      lineage: [completeLineage[0]],
    });

    const result = await service.changeLessons(
      'burlington',
      15,
      [201],
      { programId: 4, teacherId: 8, lessonIds: [201] },
      7,
    );

    expect(result.success).toBe(true);
    expect(lessonRepository.updateChangedLessonPricing).not.toHaveBeenCalled();
  });

  it('does not reconcile siblings that resolve to different destination rates', async () => {
    const { service, lessonRepository } = build({
      lessons: [
        sourceLesson(201, '2026-10-10T12:30:00.000Z'),
        sourceLesson(202, '2026-10-17T14:30:00.000Z'),
      ],
      lineage: completeLineage,
      destinationRates: [72.5, 87.5],
    });

    const result = await service.changeLessons(
      'burlington',
      15,
      [201, 202],
      { programId: 4, teacherId: 8, lessonIds: [201, 202] },
      7,
    );

    expect(result.success).toBe(true);
    expect(lessonRepository.updateChangedLessonPricing).not.toHaveBeenCalled();
  });

  it('does not alter normal lesson conversion pricing', async () => {
    const normal = sourceLesson(203, '2026-10-24T12:30:00.000Z');
    normal.isExploded = 0;
    const { service, lessonRepository } = build({ lessons: [normal] });

    const result = await service.changeLessons(
      'burlington',
      15,
      [203],
      { programId: 4, teacherId: 8, lessonIds: [203] },
      7,
    );

    expect(result.success).toBe(true);
    expect(lessonRepository.updateChangedLessonPricing).not.toHaveBeenCalled();
  });
});
