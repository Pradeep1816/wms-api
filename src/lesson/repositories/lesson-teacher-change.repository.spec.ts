import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LessonTeacherChangeRepository } from './lesson-teacher-change.repository';
import { RoundingUtils } from '../../utils/rounding.utils';

function createRepositoryMock() {
  return {
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn((payload) => payload),
    save: vi.fn(async (payload) => payload),
    update: vi.fn(async () => ({ affected: 1 })),
    createQueryBuilder: vi.fn(),
    manager: {
      transaction: vi.fn(),
    },
  };
}

describe('LessonTeacherChangeRepository', () => {
  let repository: LessonTeacherChangeRepository;
  let lessonRepository: ReturnType<typeof createRepositoryMock>;
  let privateLessonRepository: ReturnType<typeof createRepositoryMock>;

  beforeEach(() => {
    const mock = createRepositoryMock();
    lessonRepository = mock;
    privateLessonRepository = createRepositoryMock();

    repository = new LessonTeacherChangeRepository(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      lessonRepository as any,
      privateLessonRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs work inside a transaction when available', async () => {
    const txManager = {};
    lessonRepository.manager.transaction.mockImplementation(async (callback: any) => callback(txManager));

    const callback = vi.fn(async () => 'ok');
    const result = await repository.runInTransaction(callback);

    expect(lessonRepository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(txManager);
    expect(result).toBe('ok');
  });

  it('falls back to direct execution when a transaction helper is unavailable', async () => {
    lessonRepository.manager = {} as any;

    const callback = vi.fn(async (manager) => manager ?? 'fallback');
    const result = await repository.runInTransaction(callback);

    expect(callback).toHaveBeenCalledWith(undefined);
    expect(result).toBe('fallback');
  });

  it('rounds private lesson totals through the shared helper when upserting', async () => {
    const roundSpy = vi.spyOn(RoundingUtils, 'roundDecimal');
    privateLessonRepository.findOne.mockResolvedValue(null);

    await repository.upsertPrivateLesson(
      77,
      new Date('2026-09-10T00:00:00.000Z'),
      15.625,
      15.625,
      new Date('2026-09-10T00:00:00.000Z'),
    );

    expect(roundSpy).toHaveBeenCalledTimes(2);
    expect(privateLessonRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonId: 77,
        total: 15.63,
        balance: 15.63,
      }),
    );
  });
});
