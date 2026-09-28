import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditDiscountRepository } from './edit-discount.repository';

function createRepositoryMock() {
  return {
    find: vi.fn(),
    create: vi.fn((payload) => payload),
    save: vi.fn(async (payload) => payload),
  };
}

describe('EditDiscountRepository', () => {
  let repository: EditDiscountRepository;
  let lessonDiscountRepository: ReturnType<typeof createRepositoryMock>;

  beforeEach(() => {
    lessonDiscountRepository = createRepositoryMock();
    repository = new EditDiscountRepository(lessonDiscountRepository as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('matches lesson discounts by lesson, type, and enrolmentId', async () => {
    lessonDiscountRepository.find.mockResolvedValueOnce([
      {
        id: 1,
        lessonId: 10,
        type: 2,
        enrolmentId: 99,
        value: 25,
        valueType: 0,
      },
    ]);

    await repository.discountLessons(10, 2, 50, 1, 99);

    expect(lessonDiscountRepository.find).toHaveBeenCalledWith({
      where: {
        lessonId: 10,
        type: 2,
        enrolmentId: 99,
      },
      order: {
        id: 'ASC',
      },
    });
    expect(lessonDiscountRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonId: 10,
        type: 2,
        enrolmentId: 99,
        value: 50,
        valueType: 1,
      }),
    );
  });

  it('uses the first matching lesson discount row for the same composite key', async () => {
    lessonDiscountRepository.find.mockResolvedValueOnce([
      {
        id: 1,
        lessonId: 10,
        type: 2,
        enrolmentId: 99,
        value: 25,
        valueType: 0,
      },
      {
        id: 2,
        lessonId: 10,
        type: 2,
        enrolmentId: 99,
        value: 30,
        valueType: 1,
      },
    ]);

    await repository.discountLessons(10, 2, 50, 1, 99);

    expect(lessonDiscountRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        lessonId: 10,
        type: 2,
        enrolmentId: 99,
        value: 50,
        valueType: 1,
      }),
    );
  });

  it('uses the enrolmentId in bulk lookups', async () => {
    lessonDiscountRepository.find.mockResolvedValueOnce([
      {
        id: 1,
        lessonId: 10,
        type: 2,
        enrolmentId: 99,
        value: 25,
        valueType: 0,
      },
      {
        id: 2,
        lessonId: 11,
        type: 3,
        enrolmentId: 88,
        value: 5,
        valueType: 0,
      },
    ]);

    await repository.discountLessonsBulk([
      { lessonId: 10, type: 2, value: 50, valueType: 1, enrolmentId: 99 },
      { lessonId: 11, type: 3, value: 10, valueType: 0, enrolmentId: 88 },
    ]);

    const findArg = lessonDiscountRepository.find.mock.calls[0][0];
    expect(findArg.where.lessonId).toBeDefined();
    expect(findArg.where.type).toBeDefined();
    expect(findArg.where.enrolmentId).toBeDefined();
    expect(lessonDiscountRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        lessonId: 10,
        type: 2,
        enrolmentId: 99,
        value: 50,
        valueType: 1,
      }),
      expect.objectContaining({
        lessonId: 11,
        type: 3,
        enrolmentId: 88,
        value: 10,
        valueType: 0,
      }),
    ]);
  });

  it('uses the first matching row in bulk for duplicate composite keys', async () => {
    lessonDiscountRepository.find.mockResolvedValueOnce([
      {
        id: 1,
        lessonId: 10,
        type: 2,
        enrolmentId: 99,
        value: 25,
        valueType: 0,
      },
      {
        id: 2,
        lessonId: 10,
        type: 2,
        enrolmentId: 99,
        value: 30,
        valueType: 1,
      },
    ]);

    await repository.discountLessonsBulk([
      { lessonId: 10, type: 2, value: 50, valueType: 1, enrolmentId: 99 },
    ]);

    expect(lessonDiscountRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 1,
        lessonId: 10,
        type: 2,
        enrolmentId: 99,
        value: 50,
        valueType: 1,
      }),
    ]);
  });
});
