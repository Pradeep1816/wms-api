/** Query-level coverage for PSC confirmation persistence. */
import { describe, expect, it, vi } from 'vitest';
import { PermanentScheduleChangeConfirmationPersistenceAdapter } from './permanent-schedule-change-confirmation.repository';

/** Build a chainable query builder for inspecting generated PSC predicates. */
function createQueryBuilderMock() {
  return {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    leftJoinAndSelect: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    getMany: vi.fn().mockResolvedValue([]),
  };
}

describe('PermanentScheduleChangeConfirmationPersistenceAdapter', () => {
  it('uses the selected month boundary for both old-lesson queries', async () => {
    const rescheduledQuery = createQueryBuilderMock();
    const oldLessonQuery = createQueryBuilderMock();
    const lessonRepository = {
      createQueryBuilder: vi
        .fn()
        .mockReturnValueOnce(rescheduledQuery)
        .mockReturnValueOnce(oldLessonQuery),
    };
    const persistence =
      new PermanentScheduleChangeConfirmationPersistenceAdapter(
        () => ({ lessonRepository }) as never,
      );
    const selectedDate = new Date('2026-09-07T00:00:00.000Z');

    await persistence.findOldRescheduledLessons(77, selectedDate);
    await persistence.findOldLessons(77, selectedDate, []);

    expect(rescheduledQuery.andWhere).toHaveBeenCalledWith(
      'DATE(lesson.date) >= :pscBoundary',
      { pscBoundary: '2026-09-01' },
    );
    expect(oldLessonQuery.andWhere).toHaveBeenCalledWith(
      'DATE(lesson.date) >= :pscBoundary',
      { pscBoundary: '2026-09-01' },
    );
    expect(oldLessonQuery.andWhere).toHaveBeenCalledWith(
      'lesson.type = :pscLessonType',
      { pscLessonType: 1 },
    );
  });
});
