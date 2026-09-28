import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { EnrolmentService } from './enrolment.service';

function createQueryBuilderMock() {
  let datePredicate: { sql: string; params: Record<string, unknown> } | null = null;

  const queryBuilder: any = {
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn((sql: string, params?: Record<string, unknown>) => {
      if (sql.includes('lesson.date')) {
        datePredicate = { sql, params: params || {} };
      }

      return queryBuilder;
    }),
    getCount: vi.fn(async () => {
      if (!datePredicate) {
        throw new Error('Expected the delete guard to include a lesson date predicate');
      }

      // Simulate a confirmed lesson later today.
      const lessonDate = new Date('2026-07-17T10:00:00.000Z');

      if (datePredicate.sql.includes('DATE(lesson.date)')) {
        const currentDate = String(datePredicate.params.currentDate ?? '').slice(0, 10);
        return lessonDate.toISOString().slice(0, 10) <= currentDate ? 1 : 0;
      }

      const currentDateTime = new Date(datePredicate.params.currentDateTime as string | Date);
      return lessonDate <= currentDateTime ? 1 : 0;
    }),
    getDatePredicate: () => datePredicate,
  };

  return queryBuilder;
}

function createService() {
  const lessonRepository = {
    createQueryBuilder: vi.fn(),
  };

  const service = Object.create(EnrolmentService.prototype) as EnrolmentService;
  Object.assign(service, {
    lessonRepository,
  });

  return {
    service,
    lessonRepository,
  };
}

describe('EnrolmentService delete guard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows deleting when the only lesson is later the same day, matching legacy timestamp logic', async () => {
    // 2026-07-17 09:00 New York time -> lesson at 10:00 is still in the future.
    vi.setSystemTime(new Date('2026-07-17T13:00:00.000Z'));

    const { service, lessonRepository } = createService();
    const queryBuilder = createQueryBuilderMock();
    lessonRepository.createQueryBuilder.mockReturnValue(queryBuilder);

    const result = await (service as any).canBeDeleted(101);

    expect(result).toBe(true);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('lesson.date <= :currentDateTime', {
      currentDateTime: expect.any(Date),
    });
    expect(queryBuilder.getDatePredicate()).toEqual({
      sql: 'lesson.date <= :currentDateTime',
      params: expect.objectContaining({
        currentDateTime: expect.any(Date),
      }),
    });
  });
});
