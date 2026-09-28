/**
 * Pure date planning for permanent schedule changes. The planner has no
 * database dependencies and preserves established weekly gap behavior.
 */
import { LessonStatusEnum } from '../../../lesson/enums/lesson-status';

export interface PermanentSchedulePlanningLesson {
  date: Date | string;
  originalDate?: Date | string | null;
  status: number;
}

/** Resolve the occurrence date that determines a lesson's PSC position. */
function getPermanentSchedulePlanningDate(
  lesson: PermanentSchedulePlanningLesson,
): Date {
  return new Date(
    lesson.status === Number(LessonStatusEnum.RESCHEDULED) &&
      lesson.originalDate
      ? lesson.originalDate
      : lesson.date,
  );
}

/**
 * Keep lesson identity attached to its occurrence position. Draft generation
 * and confirmation must use this same order before transferring financial
 * relationships by index.
 */
export function sortPermanentScheduleLessonsByOccurrence<
  T extends PermanentSchedulePlanningLesson,
>(lessons: readonly T[]): T[] {
  return lessons
    .map((lesson, index) => ({ lesson, index }))
    .sort((left, right) => {
      const occurrenceDifference =
        getPermanentSchedulePlanningDate(left.lesson).getTime() -
        getPermanentSchedulePlanningDate(right.lesson).getTime();
      if (occurrenceDifference !== 0) return occurrenceDifference;

      const scheduledDifference =
        new Date(left.lesson.date).getTime() -
        new Date(right.lesson.date).getTime();
      return scheduledDifference || left.index - right.index;
    })
    .map(({ lesson }) => lesson);
}

/**
 * Resolve the occurrence weeks that PSC should rebuild.
 *
 * An eligible rescheduled lesson contributes its original occurrence so a
 * cross-week move does not leave a false gap in the permanent schedule. Other
 * lessons continue to use their current dates, preserving genuine gaps.
 */
export function getPermanentSchedulePlanningDates(
  lessons: readonly PermanentSchedulePlanningLesson[],
): Date[] {
  return sortPermanentScheduleLessonsByOccurrence(lessons).map((lesson) =>
    getPermanentSchedulePlanningDate(lesson),
  );
}

/**
 * Plan one replacement date for each lesson affected by a permanent schedule
 * change. Each replacement stays anchored to the calendar week of the lesson
 * it replaces so gaps in the old run do not shift every later lesson.
 *
 * The optional floor reproduces the legacy wizard's first-slot behavior while
 * preventing replacements before the selected effective day. Skipped days are
 * supplied as a policy so the planner remains deterministic and database-free.
 */
export function planPermanentScheduleDates(
  oldLessonDates: Date[],
  targetDayOfWeek: number,
  minDate: Date | null,
  isSkippedDay: (day: Date) => boolean = () => false,
): Date[] {
  const startOfDay = (value: Date): Date => {
    const day = new Date(value);
    day.setUTCHours(0, 0, 0, 0);
    return day;
  };

  const floor = minDate ? startOfDay(minDate) : null;

  const inOwnWeek = (lessonDate: Date): Date => {
    const week = startOfDay(lessonDate);
    week.setUTCDate(week.getUTCDate() + (targetDayOfWeek - week.getUTCDay()));
    return week;
  };

  let weeksBack = 0;
  if (floor && oldLessonDates.length > 0) {
    const legacyFirstSlot = new Date(floor);
    while (legacyFirstSlot.getUTCDay() !== targetDayOfWeek) {
      legacyFirstSlot.setUTCDate(legacyFirstSlot.getUTCDate() + 1);
    }

    const daysLate =
      (inOwnWeek(oldLessonDates[0]).getTime() - legacyFirstSlot.getTime()) /
      86400000;

    // Own-week anchoring can introduce exactly one week of calendar-boundary
    // drift. Larger gaps represent a real break and must remain untouched.
    if (daysLate === 7) {
      weeksBack = 1;
    }
  }

  const oldSkipsBefore: number[] = [];
  let oldSkippedCount = 0;
  for (const [index, oldDate] of oldLessonDates.entries()) {
    if (index > 0) {
      const slot = startOfDay(oldLessonDates[index - 1]);
      slot.setUTCDate(slot.getUTCDate() + 7);
      const until = startOfDay(oldDate);

      while (slot < until) {
        if (isSkippedDay(slot)) {
          oldSkippedCount += 1;
        }
        slot.setUTCDate(slot.getUTCDate() + 7);
      }
    }
    oldSkipsBefore.push(oldSkippedCount);
  }

  const planned: Date[] = [];
  let previous: Date | null = null;
  let newSkippedCount = 0;

  for (const [index, oldDate] of oldLessonDates.entries()) {
    const weeksEarly = Math.min(
      1,
      Math.max(0, oldSkipsBefore[index] - newSkippedCount),
    );

    const candidate = inOwnWeek(oldDate);
    candidate.setUTCDate(candidate.getUTCDate() - 7 * (weeksBack + weeksEarly));

    while (floor && candidate < floor) {
      candidate.setUTCDate(candidate.getUTCDate() + 7);
    }

    while (previous && candidate <= previous) {
      candidate.setUTCDate(candidate.getUTCDate() + 7);
    }

    while (isSkippedDay(candidate)) {
      candidate.setUTCDate(candidate.getUTCDate() + 7);
      newSkippedCount += 1;
    }

    planned.push(new Date(candidate));
    previous = candidate;
  }

  return planned;
}

// Compatibility name used by the existing enrolment scheduling flow and
// regression suite while the rest of PSC is extracted incrementally.
export const planRescheduleDates = planPermanentScheduleDates;
