import { FindOperator, SelectQueryBuilder } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { Lesson } from '../../../lesson/entities/lesson.entity';
import { LessonStatusEnum } from '../../../lesson/enums/lesson-status';
import {
  applyPermanentScheduleLessonEligibility,
  getPermanentScheduleEligibleLessonWhere,
  getPermanentScheduleMonthBoundary,
  isPermanentScheduleLessonRestored,
} from './permanent-schedule-eligibility.policy';

function createQueryBuilderMock() {
  const where = vi.fn();
  const andWhere = vi.fn();
  const query = { where, andWhere } as unknown as SelectQueryBuilder<Lesson>;
  where.mockReturnValue(query);
  andWhere.mockReturnValue(query);
  return { query, andWhere };
}

describe('permanent schedule lesson eligibility', () => {
  const selectedFirstSlot = new Date('2026-09-07T00:00:00.000Z');

  it('normalizes any first-week date to the selected month boundary', () => {
    expect(
      getPermanentScheduleMonthBoundary(selectedFirstSlot).toISOString(),
    ).toBe('2026-09-01T00:00:00.000Z');
  });

  it('selects only eligible regular lessons from the month boundary', () => {
    const where = getPermanentScheduleEligibleLessonWhere(
      77,
      selectedFirstSlot,
    );

    expect(where).toMatchObject({
      courseId: 77,
      type: 1,
      isDeleted: false,
      isConfirmed: true,
    });
    const status = where.status as FindOperator<number>;
    const date = where.date as FindOperator<Date>;
    expect(status).toMatchObject({
      type: 'not',
      value: LessonStatusEnum.CANCELED,
    });
    expect(date.value.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('applies the same month boundary to confirmation queries', () => {
    const { query, andWhere } = createQueryBuilderMock();

    applyPermanentScheduleLessonEligibility(query, 77, selectedFirstSlot);

    expect(andWhere).toHaveBeenCalledWith('DATE(lesson.date) >= :pscBoundary', {
      pscBoundary: '2026-09-01',
    });
    expect(andWhere).toHaveBeenCalledWith('lesson.type = :pscLessonType', {
      pscLessonType: 1,
    });
  });

  it('restores only rescheduled lessons originating before the selected month', () => {
    const boundary = new Date('2026-09-01T00:00:00.000Z');

    expect(
      isPermanentScheduleLessonRestored(
        {
          status: LessonStatusEnum.RESCHEDULED,
          date: new Date('2026-09-03T18:30:00.000Z'),
          originalDate: new Date('2026-08-27T18:30:00.000Z'),
        },
        boundary,
      ),
    ).toBe(true);

    expect(
      isPermanentScheduleLessonRestored(
        {
          status: LessonStatusEnum.RESCHEDULED,
          date: new Date('2026-09-03T18:30:00.000Z'),
          originalDate: new Date('2026-09-03T18:30:00.000Z'),
        },
        boundary,
      ),
    ).toBe(false);

    expect(
      isPermanentScheduleLessonRestored(
        {
          status: LessonStatusEnum.SCHEDULED,
          date: new Date('2026-09-01T18:30:00.000Z'),
          originalDate: new Date('2026-08-25T18:30:00.000Z'),
        },
        boundary,
      ),
    ).toBe(false);
  });
});
