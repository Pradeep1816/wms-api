import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LessonDetailRepository } from './lesson-detail.repository';
import { LessonStatusEnum } from '../enums/lesson-status';

function createLessonOverlapQueryBuilderMock(count: number) {
  return {
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getCount: vi.fn().mockResolvedValue(count),
  };
}

function createUnavailabilityQueryBuilderMock(count: number) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getCount: vi.fn().mockResolvedValue(count),
  };
}

function createRepositoryMock() {
  return {
    createQueryBuilder: vi.fn(),
    update: vi.fn(),
    manager: {
      createQueryBuilder: vi.fn(),
    },
  };
}

describe('LessonDetailRepository', () => {
  let repository: LessonDetailRepository;
  let lessonRepository: ReturnType<typeof createRepositoryMock>;
  let classroomRepository: { findOne: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    lessonRepository = createRepositoryMock();
    classroomRepository = { findOne: vi.fn() };

    repository = new LessonDetailRepository(
      lessonRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      classroomRepository as any,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates classroom for a single lesson when there is no conflict', async () => {
    const lesson = {
      id: 1001,
      date: new Date('2026-05-05T10:15:00.000Z'),
      duration: '00:45:00',
      status: LessonStatusEnum.SCHEDULED,
      isDeleted: false,
      classroomId: 7,
    };
    const reloadedLesson = {
      ...lesson,
      classroomId: 12,
    };

    const overlapQuery = createLessonOverlapQueryBuilderMock(0);
    const unavailabilityQuery = createUnavailabilityQueryBuilderMock(0);

    vi.spyOn(repository, 'findLessonDetailsById')
      .mockResolvedValueOnce(lesson as any)
      .mockResolvedValueOnce(reloadedLesson as any);
    vi.spyOn(repository, 'getColorCode').mockResolvedValue('default-color');

    classroomRepository.findOne.mockResolvedValue({ id: 12 });
    lessonRepository.createQueryBuilder.mockReturnValue(overlapQuery);
    lessonRepository.manager.createQueryBuilder.mockReturnValue(unavailabilityQuery);
    lessonRepository.update.mockResolvedValue({ affected: 1 });

    const result = await repository.updateLessonDetails(1001, 3, { classroomId: 12 }, 99);

    expect(classroomRepository.findOne).toHaveBeenCalledWith({
      where: {
        id: 12,
        locationId: 3,
        isDeleted: false,
      },
    });
    expect(lessonRepository.update).toHaveBeenCalledWith(1001, {
      updatedByUserId: 99,
      classroomId: 12,
    });
    expect(result.classroomId).toBe(12);
    expect(result.colorCode).toBe('default-color');
  });

  it('rejects classroom changes when another lesson overlaps in the same room', async () => {
    const lesson = {
      id: 1001,
      date: new Date('2026-05-05T10:15:00.000Z'),
      duration: '00:45:00',
      status: LessonStatusEnum.SCHEDULED,
      isDeleted: false,
      classroomId: 7,
    };

    const overlapQuery = createLessonOverlapQueryBuilderMock(1);
    const unavailabilityQuery = createUnavailabilityQueryBuilderMock(0);

    vi.spyOn(repository, 'findLessonDetailsById').mockResolvedValue(lesson as any);

    classroomRepository.findOne.mockResolvedValue({ id: 12 });
    lessonRepository.createQueryBuilder.mockReturnValue(overlapQuery);
    lessonRepository.manager.createQueryBuilder.mockReturnValue(unavailabilityQuery);

    await expect(
      repository.updateLessonDetails(1001, 3, { classroomId: 12 }, 99),
    ).rejects.toThrow('Classroom already chosen!');

    expect(lessonRepository.update).not.toHaveBeenCalled();
  });

  it('rejects classroom changes when the classroom is unavailable on that date', async () => {
    const lesson = {
      id: 1001,
      date: new Date('2026-05-05T10:15:00.000Z'),
      duration: '00:45:00',
      status: LessonStatusEnum.SCHEDULED,
      isDeleted: false,
      classroomId: 7,
    };

    const overlapQuery = createLessonOverlapQueryBuilderMock(0);
    const unavailabilityQuery = createUnavailabilityQueryBuilderMock(1);

    vi.spyOn(repository, 'findLessonDetailsById').mockResolvedValue(lesson as any);

    classroomRepository.findOne.mockResolvedValue({ id: 12 });
    lessonRepository.createQueryBuilder.mockReturnValue(overlapQuery);
    lessonRepository.manager.createQueryBuilder.mockReturnValue(unavailabilityQuery);

    await expect(
      repository.updateLessonDetails(1001, 3, { classroomId: 12 }, 99),
    ).rejects.toThrow('Classroom is unavailable');

    expect(lessonRepository.update).not.toHaveBeenCalled();
  });
});
