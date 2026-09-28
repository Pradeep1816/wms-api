import { describe, expect, it, vi } from 'vitest';
import type { Repository } from 'typeorm';
import { Location } from '../../location/entities/location.entity';
import { User } from '../../user/entities/user.entity';
import { GroupLesson } from '../entities/group-lesson.entity';
import { Lesson } from '../entities/lesson.entity';
import { GroupLessonRepository } from './group-lesson.repository';

function createQueryBuilder(rawResult: unknown) {
  const queryBuilder: Record<string, any> = {};
  const fluentMethods = [
    'innerJoin',
    'leftJoin',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'skip',
    'take',
    'distinct',
    'select',
    'addSelect',
  ];

  for (const method of fluentMethods) {
    queryBuilder[method] = vi.fn(() => queryBuilder);
  }

  queryBuilder.getRawMany = vi.fn().mockResolvedValue(rawResult);
  queryBuilder.getRawOne = vi.fn().mockResolvedValue(rawResult);
  return queryBuilder;
}

describe('GroupLessonRepository', () => {
  it('returns the group lesson id and allocation for payment editing', async () => {
    const rows = [
      {
        id: 7001,
        date: '2026-09-16 15:30:00',
        paymentAmount: '143.7500',
        amount: '143.7500',
        balance: '0.0000',
      },
    ];
    const dataQuery = createQueryBuilder(rows);
    const countQuery = createQueryBuilder({ count: '1' });
    const lessonRepository = {
      createQueryBuilder: vi
        .fn()
        .mockReturnValueOnce(dataQuery)
        .mockReturnValueOnce(countQuery),
    };
    const repository = new GroupLessonRepository(
      {} as Repository<GroupLesson>,
      lessonRepository as unknown as Repository<Lesson>,
      {} as Repository<Location>,
      {} as Repository<User>,
    );

    const result = await repository.getGroupLessonsByPaymentId(88, 15, 77);

    expect(result).toEqual({ groupLessons: rows, total: 1 });
    expect(dataQuery.select).toHaveBeenCalledWith('gl.id', 'id');
    expect(dataQuery.addSelect).toHaveBeenCalledWith(
      'lp.amount',
      'paymentAmount',
    );
    expect(dataQuery.innerJoin).toHaveBeenCalledWith(
      'lesson_payment',
      'lp',
      'lp.lessonId = lesson.id AND lp.enrolmentId = e.id AND lp.paymentId = :paymentId AND lp.isDeleted = 0',
      { paymentId: 88 },
    );
    expect(countQuery.select).toHaveBeenCalledWith(
      'COUNT(DISTINCT gl.id)',
      'count',
    );
  });
});
