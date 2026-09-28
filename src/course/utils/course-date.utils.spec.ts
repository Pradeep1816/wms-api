import { describe, expect, it, vi } from 'vitest';
import {
  validCourseDay,
  hasValidCourseBounds,
  validCourseDateSql,
} from './course-date.utils';
import { LessonEditScheduleRepository } from '../../lesson/repositories/lesson-edit-schedule.repository';
import { PrivateLessonDeleteRepository } from '../../lesson/repositories/private-lesson-actions/private-lesson-delete.repository';
import { EditDurationRepository } from '../../lesson/repositories/private-lesson-actions/edit-duration.repository';

describe('course date integrity', () => {
  it.each([
    null,
    undefined,
    new Date(NaN),
    '0000-00-00 00:00:00',
    '2026-00-01',
    '2026-01-00',
    '2026-02-29',
    '2026-04-31',
    'NaN-NaN-NaN',
  ])('rejects invalid date %s', (value) => {
    expect(validCourseDay(value)).toBeNull();
  });

  it('accepts leap dates, SQL datetimes and local Date parts', () => {
    expect(validCourseDay('2024-02-29')).toBe('2024-02-29');
    expect(validCourseDay('2022-01-24 16:00:00')).toBe('2022-01-24');
    expect(validCourseDay(new Date(2026, 8, 1, 0, 15))).toBe('2026-09-01');
    expect(hasValidCourseBounds('2028-01-22', '2022-01-24')).toBe(false);
  });

  const paths = [
    {
      name: 'edit schedule',
      alias: 'lesson.date',
      run: (manager: any) =>
        Object.create(LessonEditScheduleRepository.prototype).updateCourseDates(
          900,
          { manager },
        ),
    },
    {
      name: 'delete lesson',
      alias: 'l.date',
      run: (manager: any) =>
        Object.create(
          PrivateLessonDeleteRepository.prototype,
        ).updateCourseDates(900, manager),
    },
    {
      name: 'edit duration batch',
      alias: 'l.date',
      run: (manager: any) =>
        Object.create(EditDurationRepository.prototype).updateCourseDatesBatch(
          [900],
          manager,
        ),
    },
  ] as const;

  for (const route of paths) {
    describe(route.name, () => {
      function setup(first: unknown, last: unknown) {
        const query: any = {};
        for (const method of [
          'select',
          'addSelect',
          'where',
          'andWhere',
          'groupBy',
        ])
          query[method] = vi.fn(() => query);
        query.getRawOne = vi.fn(async () => ({ first, last }));
        query.getRawMany = vi.fn(async () => [{ courseId: 900, first, last }]);
        const update = vi.fn();
        const manager = {
          createQueryBuilder: () => query,
          findOne: async () => null,
          getRepository: () => ({ createQueryBuilder: () => query, update }),
        };
        return { manager, query, update };
      }

      it('filters invalid historical dates and preserves valid course bounds', async () => {
        const { manager, query, update } = setup(
          '2022-01-24 16:00:00',
          '2028-01-22 11:00:00',
        );
        await route.run(manager);
        expect(query.andWhere).toHaveBeenCalledWith(
          validCourseDateSql(route.alias),
        );
        expect(update).toHaveBeenCalledOnce();
        const saved = update.mock.calls[0][1];
        expect(validCourseDay(saved.startDate)).toBe('2022-01-24');
        expect(validCourseDay(saved.endDate)).toBe('2028-01-22');
      });

      it.each([
        [null, null],
        ['0000-00-00 00:00:00', '2028-01-22'],
        [new Date(NaN), '2028-01-22'],
        ['2028-01-22', '2022-01-24'],
      ])(
        'does not overwrite course bounds with unusable aggregates',
        async (first, last) => {
          const { manager, update } = setup(first, last);
          await route.run(manager);
          expect(update).not.toHaveBeenCalled();
        },
      );
    });
  }
});
