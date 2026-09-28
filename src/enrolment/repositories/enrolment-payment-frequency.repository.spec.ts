import { describe, expect, it, vi } from 'vitest';
import { EnrolmentPaymentFrequencyRepository } from './enrolment-payment-frequency.repository';

function createQueryBuilder(result: unknown[] = []) {
  return {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    addOrderBy: vi.fn().mockReturnThis(),
    getMany: vi.fn().mockResolvedValue(result),
  };
}

describe('EnrolmentPaymentFrequencyRepository payment-cycle linking', () => {
  it.each([
    {
      direction: 'into a later month',
      date: '2026-10-05T09:15:00.000Z',
      originalDate: '2026-09-16T09:15:00.000Z',
      cycleStart: '2026-09-01T00:00:00.000Z',
      cycleEnd: '2026-09-30T00:00:00.000Z',
    },
    {
      direction: 'into an earlier month',
      date: '2026-09-16T09:15:00.000Z',
      originalDate: '2026-10-05T09:15:00.000Z',
      cycleStart: '2026-10-01T00:00:00.000Z',
      cycleEnd: '2026-10-31T00:00:00.000Z',
    },
  ])(
    'uses the preserved billing occurrence after a cross-month move $direction',
    async ({ date, originalDate, cycleStart, cycleEnd }) => {
      const lessons = [
        {
          id: 1,
          date: new Date(date),
          originalDate: new Date(originalDate),
        },
      ];
      const lessonQuery = createQueryBuilder(lessons);
      const existingLinksQuery = createQueryBuilder([]);
      const insertQuery = {
        insert: vi.fn().mockReturnThis(),
        into: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(undefined),
      };
      const paymentCycleLessonRepository = {
        createQueryBuilder: vi
          .fn()
          .mockReturnValueOnce(existingLinksQuery)
          .mockReturnValueOnce(insertQuery),
        save: vi.fn(),
      };
      const repository = Object.create(
        EnrolmentPaymentFrequencyRepository.prototype,
      ) as EnrolmentPaymentFrequencyRepository;
      Object.assign(repository as object, {
        lessonRepository: {
          createQueryBuilder: vi.fn().mockReturnValue(lessonQuery),
        },
        paymentCycleLessonRepository,
      });

      const startDate = new Date(cycleStart);
      const endDate = new Date(cycleEnd);
      const result = await repository.linkLessonsToPaymentCycle(
        100,
        200,
        startDate,
        endDate,
      );

      expect(lessonQuery.andWhere).toHaveBeenCalledWith(
        'COALESCE(lesson.originalDate, lesson.date) >= :startDate',
        { startDate: expect.any(Date) },
      );
      expect(lessonQuery.andWhere).toHaveBeenCalledWith(
        'COALESCE(lesson.originalDate, lesson.date) <= :endDate',
        { endDate: expect.any(Date) },
      );
      expect(lessonQuery.orderBy).toHaveBeenCalledWith(
        'COALESCE(lesson.originalDate, lesson.date)',
        'ASC',
      );
      expect(lessonQuery.addOrderBy).toHaveBeenCalledWith(
        'lesson.date',
        'ASC',
      );
      expect(insertQuery.values).toHaveBeenCalledWith([
        {
          paymentCycleId: 100,
          lessonId: 1,
          isDeleted: 0,
        },
      ]);
      expect(result).toEqual({ linkedLessonIds: [1] });
    },
  );
});
