/**
 * Single source of truth for lesson eligibility in permanent schedule changes.
 * Draft and confirmation queries both consume these same boundary rules.
 */
import {
  FindOptionsWhere,
  MoreThanOrEqual,
  Not,
  SelectQueryBuilder,
} from 'typeorm';
import { Lesson } from '../../../lesson/entities/lesson.entity';
import { LessonStatusEnum } from '../../../lesson/enums/lesson-status';
import { startOfPermanentScheduleMonth } from './permanent-schedule-date';

export const PERMANENT_SCHEDULE_REGULAR_LESSON_TYPE = 1;

/**
 * Permanent schedule changes select existing lessons from the beginning of
 * the chosen month. The separately selected day controls the first new slot.
 */
export function getPermanentScheduleMonthBoundary(date: Date): Date {
  return startOfPermanentScheduleMonth(date);
}

/** Build the TypeORM criteria for confirmed regular lessons affected by PSC. */
export function getPermanentScheduleEligibleLessonWhere(
  courseId: number,
  dateToChangeSchedule: Date,
): FindOptionsWhere<Lesson> {
  return {
    courseId,
    type: PERMANENT_SCHEDULE_REGULAR_LESSON_TYPE,
    isDeleted: false,
    isConfirmed: true,
    status: Not(LessonStatusEnum.CANCELED),
    date: MoreThanOrEqual(
      getPermanentScheduleMonthBoundary(dateToChangeSchedule),
    ),
  };
}

/** Apply the canonical PSC lesson criteria to a query-builder operation. */
export function applyPermanentScheduleLessonEligibility(
  query: SelectQueryBuilder<Lesson>,
  courseId: number,
  dateToChangeSchedule: Date,
  alias: string = 'lesson',
): SelectQueryBuilder<Lesson> {
  const boundary = getPermanentScheduleMonthBoundary(dateToChangeSchedule)
    .toISOString()
    .split('T')[0];

  return query
    .where(`${alias}.courseId = :pscCourseId`, { pscCourseId: courseId })
    .andWhere(`${alias}.type = :pscLessonType`, {
      pscLessonType: PERMANENT_SCHEDULE_REGULAR_LESSON_TYPE,
    })
    .andWhere(`${alias}.isDeleted = :pscIsDeleted`, {
      pscIsDeleted: false,
    })
    .andWhere(`${alias}.isConfirmed = :pscIsConfirmed`, {
      pscIsConfirmed: true,
    })
    .andWhere(`${alias}.status != :pscCanceledStatus`, {
      pscCanceledStatus: LessonStatusEnum.CANCELED,
    })
    .andWhere(`DATE(${alias}.date) >= :pscBoundary`, { pscBoundary: boundary });
}

/**
 * Restore a previously rescheduled lesson when its original slot precedes the
 * selected month. This is the exception preserved from the legacy workflow.
 */
export function isPermanentScheduleLessonRestored(
  lesson: Pick<Lesson, 'status' | 'date' | 'originalDate'>,
  dateToChangeSchedule: Date,
): boolean {
  if (lesson.status !== Number(LessonStatusEnum.RESCHEDULED)) {
    return false;
  }

  const originalDate = new Date(lesson.originalDate || lesson.date);
  return originalDate < getPermanentScheduleMonthBoundary(dateToChangeSchedule);
}
