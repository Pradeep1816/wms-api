import { describe, expect, it } from 'vitest';
import { LessonStatusEnum } from '../../../lesson/enums/lesson-status';
import {
  getPermanentSchedulePlanningDates,
  planPermanentScheduleDates,
  sortPermanentScheduleLessonsByOccurrence,
} from './permanent-schedule-planner';

const dateKeys = (dates: Date[]): string[] =>
  dates.map((date) => date.toISOString().slice(0, 10));

describe('permanent schedule planning', () => {
  it('keeps lesson identity in original occurrence order across months', () => {
    const lessons = [
      {
        id: 101,
        date: new Date('2026-10-05T17:30:00.000Z'),
        originalDate: new Date('2026-10-05T17:30:00.000Z'),
        status: LessonStatusEnum.SCHEDULED,
      },
      {
        id: 102,
        date: new Date('2026-11-02T17:30:00.000Z'),
        originalDate: new Date('2026-11-02T17:30:00.000Z'),
        status: LessonStatusEnum.SCHEDULED,
      },
      {
        id: 103,
        date: new Date('2026-11-29T17:30:00.000Z'),
        originalDate: new Date('2026-10-12T17:30:00.000Z'),
        status: LessonStatusEnum.RESCHEDULED,
      },
    ];

    expect(
      sortPermanentScheduleLessonsByOccurrence(lessons).map(({ id }) => id),
    ).toEqual([101, 103, 102]);
  });

  it('fills the original week when an eligible lesson moved across months', () => {
    const planningDates = getPermanentSchedulePlanningDates([
      {
        date: new Date('2026-10-01T19:45:00.000Z'),
        originalDate: new Date('2026-10-01T19:45:00.000Z'),
        status: LessonStatusEnum.SCHEDULED,
      },
      {
        date: new Date('2026-10-15T19:45:00.000Z'),
        originalDate: new Date('2026-10-15T19:45:00.000Z'),
        status: LessonStatusEnum.SCHEDULED,
      },
      {
        date: new Date('2026-10-22T19:45:00.000Z'),
        originalDate: new Date('2026-10-22T19:45:00.000Z'),
        status: LessonStatusEnum.SCHEDULED,
      },
      {
        date: new Date('2026-11-30T19:45:00.000Z'),
        originalDate: new Date('2026-10-08T19:45:00.000Z'),
        status: LessonStatusEnum.RESCHEDULED,
      },
      {
        date: new Date('2026-11-05T19:45:00.000Z'),
        originalDate: new Date('2026-11-05T19:45:00.000Z'),
        status: LessonStatusEnum.SCHEDULED,
      },
    ]);

    const replacements = planPermanentScheduleDates(
      planningDates,
      5,
      new Date('2026-10-02T00:00:00.000Z'),
      (date) => date.toISOString().slice(0, 10) === '2026-10-30',
    );

    expect(dateKeys(replacements)).toEqual([
      '2026-10-02',
      '2026-10-09',
      '2026-10-16',
      '2026-10-23',
      '2026-11-06',
    ]);
  });

  it('continues preserving a genuine missing week', () => {
    const planningDates = getPermanentSchedulePlanningDates([
      {
        date: new Date('2026-10-01T19:45:00.000Z'),
        originalDate: new Date('2026-10-01T19:45:00.000Z'),
        status: LessonStatusEnum.SCHEDULED,
      },
      {
        date: new Date('2026-10-15T19:45:00.000Z'),
        originalDate: new Date('2026-10-08T19:45:00.000Z'),
        status: LessonStatusEnum.SCHEDULED,
      },
      {
        date: new Date('2026-10-22T19:45:00.000Z'),
        originalDate: new Date('2026-10-22T19:45:00.000Z'),
        status: LessonStatusEnum.SCHEDULED,
      },
    ]);

    const replacements = planPermanentScheduleDates(
      planningDates,
      5,
      new Date('2026-10-02T00:00:00.000Z'),
    );

    expect(dateKeys(replacements)).toEqual([
      '2026-10-02',
      '2026-10-16',
      '2026-10-23',
    ]);
  });
});
