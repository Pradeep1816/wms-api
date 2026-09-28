/**
 * Business workflow for replacing a permanent schedule change draft. Lesson
 * planning stays here while transaction mechanics and queries stay in the PSC
 * draft repository.
 */
import { Injectable } from '@nestjs/common';
import { Course } from '../../course/entities/course.entity';
import { CourseSchedule } from '../../course/entities/course-schedule.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import {
  getCurrentESTDate,
  isProfessionalDevelopmentDay,
  parseLocalDateTime,
} from '../../utils/date-utils';
import { Enrolment } from '../entities/enrolment.entity';
import { isPermanentScheduleLessonRestored } from './domain/permanent-schedule-eligibility.policy';
import {
  getPermanentSchedulePlanningDates,
  planRescheduleDates,
  sortPermanentScheduleLessonsByOccurrence,
} from './domain/permanent-schedule-planner';
import {
  PermanentScheduleChangeDraftPersistence,
  PermanentScheduleChangeDraftRepository,
} from '../repositories/permanent-schedule-change/permanent-schedule-change-draft.repository';
import { PermanentScheduleChangeValidator } from '../validators/permanent-schedule-change/permanent-schedule-change.validator';

/** Creates replacement lessons for a validated permanent schedule change. */
@Injectable()
export class PermanentScheduleChangeDraftService {
  /** Inject transactional persistence and the shared PSC month validator. */
  constructor(
    private readonly repository: PermanentScheduleChangeDraftRepository,
    private readonly validator: PermanentScheduleChangeValidator,
  ) {}

  /**
   * Replace a PSC draft as one unit. The course row lock serializes concurrent
   * drafts for the same course, making the most recent completed request the
   * only remaining draft instead of allowing duplicate draft sets.
   */
  async replaceDraft(
    enrolment: Enrolment,
    course: Course,
    dateToChangeSchedule: Date,
    teacherId: number,
    day: number,
    fromTime: string,
    duration: string,
    rescheduleBeginDate: Date,
    loggedUserId: number,
  ): Promise<Date> {
    const lastLessonDate = await this.repository.transaction((persistence) =>
      this.regenerateLessonsForReschedule(
        enrolment,
        course,
        dateToChangeSchedule,
        teacherId,
        day,
        fromTime,
        duration,
        rescheduleBeginDate,
        loggedUserId,
        persistence,
      ),
    );

    await this.repository.updateStudentAndUserStatus(enrolment);
    return lastLessonDate;
  }

  /**
   * Regenerate all replacement lessons inside the draft transaction while
   * preserving the legacy CourseReschedule workflow.
   */
  private async regenerateLessonsForReschedule(
    enrolment: Enrolment,
    course: Course,
    dateToChangeSchedule: Date,
    teacherId: number,
    day: number,
    fromTime: string,
    duration: string,
    rescheduleBeginDate: Date,
    loggedUserId: number,
    persistence: PermanentScheduleChangeDraftPersistence,
  ): Promise<Date> {
    await persistence.lockCourse(course.id);

    // Recheck after taking the lock so invoicing or lesson changes that raced
    // with the request cannot produce an invalid draft.
    await this.validator.validateMonthConstraints(
      course.id,
      dateToChangeSchedule,
      persistence,
    );

    // Delete unconfirmed lessons (matching legacy: Lesson::deleteAll(['isConfirmed' => false]))
    await persistence.deleteUnconfirmedLessons(course.id);

    // Get rescheduled lessons that need to be restored
    // Match legacy Query 10: Lesson::find()->regular()->rescheduled()->notCanceled()->isConfirmed()
    // regular() = lesson.type = 1 (TYPE_REGULAR)
    // rescheduled() = lesson.status = 1 (RESCHEDULED)
    // notCanceled() = NOT status = 4 (CANCELED)
    // Note: rescheduleStartDate is not used in queries, only for calculating nextDate
    // We use rescheduleBeginDate directly for nextDate calculation

    const rescheduledLessons = await persistence.findRescheduledLessons(
      course.id,
      dateToChangeSchedule,
    );

    const lessonIdsToRestore = rescheduledLessons
      .filter((lesson) =>
        isPermanentScheduleLessonRestored(lesson, dateToChangeSchedule),
      )
      .map((lesson) => lesson.id);

    // Get old lessons that will be replaced (to copy originalDate for new lessons)
    // IMPORTANT: Do NOT delete old confirmed lessons during reschedule/preview step
    // Legacy: CourseReschedule::reschdeule() only deletes unconfirmed lessons (line 96-99)
    // Old confirmed lessons are only cancelled (status = CANCELED) during confirmation step
    // Match legacy: the selected month is the inclusive replacement boundary.
    // rescheduleBeginDate is used below only to choose the first new slot.
    const oldLessonsToReplace = await persistence.findEligibleLessons(
      course.id,
      dateToChangeSchedule,
    );

    // Filter out lessons that should be restored (rescheduled lessons)
    // Store old lessons in a map to copy originalDate to new lessons
    const oldLessonsMap = new Map<number, Lesson>();
    for (const lesson of oldLessonsToReplace) {
      if (!lessonIdsToRestore.includes(lesson.id)) {
        oldLessonsMap.set(lesson.id, lesson);
      }
    }

    // Calculate start date for new lessons
    // Legacy: rescheduleStartDate->modify('next ' . $day)
    // Use rescheduleBeginDate directly (not rescheduleBeginDate - 1 day) to calculate nextDate
    // Check if rescheduleBeginDate itself is the target day, otherwise find next occurrence
    const targetDayOfWeek = day === 7 ? 0 : day; // Convert Sunday from 7 to 0
    const nextDate = new Date(rescheduleBeginDate);

    console.log('[RESCHEDULE] Calculating nextDate:', {
      rescheduleBeginDate: rescheduleBeginDate.toISOString(),
      rescheduleBeginDateUTCDay: rescheduleBeginDate.getUTCDay(),
      targetDayOfWeek,
      day,
      match: rescheduleBeginDate.getUTCDay() === targetDayOfWeek,
    });

    // Check if rescheduleBeginDate is already the target day (use UTC to match parseRescheduleBeginDate)
    if (nextDate.getUTCDay() === targetDayOfWeek) {
      // Use rescheduleBeginDate itself as the first lesson date
      // No need to modify
      console.log(
        '[RESCHEDULE] rescheduleBeginDate matches target day, using it directly:',
        nextDate.toISOString(),
      );
    } else {
      // Find next occurrence of the day after rescheduleBeginDate
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      console.log(
        '[RESCHEDULE] rescheduleBeginDate does not match, starting search from:',
        nextDate.toISOString(),
      );
      let iterations = 0;
      while (nextDate.getUTCDay() !== targetDayOfWeek) {
        nextDate.setUTCDate(nextDate.getUTCDate() + 1);
        iterations++;
        if (iterations > 7) {
          console.error(
            '[RESCHEDULE] ERROR: Infinite loop detected in day search!',
          );
          break;
        }
      }
      console.log(
        '[RESCHEDULE] Found next occurrence after',
        iterations,
        'iterations:',
        nextDate.toISOString(),
      );
    }

    // Get course end date
    const courseEndDate = course.endDate || new Date();

    // Match legacy behavior: copy rates from last lesson before dateToChangeSchedule boundary.
    const lastLessonBeforeDate = await persistence.findLastLessonBefore(
      course.id,
      dateToChangeSchedule,
    );

    // Create a temporary schedule object for generateLessonsForReschedule (not saved to DB)
    // This is only used to pass schedule info to the lesson generation method
    // IMPORTANT: Use nextDate as startDate so generateLessonsForReschedule uses the correct first lesson date
    const tempSchedule = {
      courseId: course.id,
      teacherId,
      day,
      fromTime,
      duration:
        duration.includes(':') && duration.split(':').length === 2
          ? duration + ':00'
          : duration,
      startDate: nextDate, // Use the calculated nextDate (which may be rescheduleStartDate if it matches the day)
      endDate: courseEndDate,
      isRecent: true,
    } as CourseSchedule;

    console.log('[RESCHEDULE] Created tempSchedule with startDate:', {
      nextDate: nextDate.toISOString(),
      tempScheduleStartDate: tempSchedule.startDate.toISOString(),
    });

    // Generate lessons from nextDate to courseEndDate
    // Use a dummy last lesson if no lessons exist before dateToChangeSchedule
    // For reschedule, we need lastLesson to copy rates, but we'll use schedule.startDate (nextDate) as the actual start date
    // IMPORTANT: Do NOT save dummy lessons to database - they should only exist in memory for copying rates
    let lastLesson: Lesson;
    if (lastLessonBeforeDate) {
      lastLesson = lastLessonBeforeDate;
    } else {
      // Create a dummy lesson in memory only (NOT saved to DB) for generateLessonsForReschedule to work with (to copy rates)
      // Use a date before nextDate (reschedule begin date) so it doesn't interfere with lesson generation
      const dummyDate = new Date(nextDate);
      dummyDate.setUTCDate(dummyDate.getUTCDate() - 7); // One week before reschedule begin date
      lastLesson = persistence.createLesson({
        courseId: course.id,
        date: dummyDate,
        teacherId,
        duration: tempSchedule.duration,
        status: LessonStatusEnum.SCHEDULED,
        isPresent: true,
        isDeleted: false,
        isConfirmed: true,
        type: 1,
        isExploded: 0,
        createdByUserId: loggedUserId,
        updatedByUserId: loggedUserId,
        programRate: 0,
        teacherRate: 0,
        teacherRateOld: 0,
        tax: 0,
      });
      // DO NOT save dummy lesson to database - it's only used in memory to copy rates
      // The dummy lesson remains in memory and is never persisted.
    }

    // Generate lessons for reschedule (with isConfirmed=false and originalDate from old lessons)
    // Match legacy: Creates lessons with isConfirmed=0 and originalDate set to old lesson date
    console.log(
      '[RESCHEDULE] About to call generateLessonsForReschedule with:',
      {
        nextDate: nextDate.toISOString(),
        lastLessonDate: lastLesson.date.toISOString(),
        courseEndDate: courseEndDate.toISOString(),
        tempScheduleStartDate: tempSchedule.startDate.toISOString(),
      },
    );
    const lastGeneratedLessonDate = await this.generateLessonsForReschedule(
      enrolment,
      lastLesson,
      courseEndDate,
      tempSchedule,
      loggedUserId,
      oldLessonsMap,
      dateToChangeSchedule,
      rescheduleBeginDate, // Pass rescheduleBeginDate to ensure we don't create lessons before it
      persistence,
    );

    console.log(
      '[RESCHEDULE] generateLessonsForReschedule completed, lastGeneratedLessonDate:',
      lastGeneratedLessonDate ? lastGeneratedLessonDate.toISOString() : null,
    );

    return lastGeneratedLessonDate
      ? new Date(lastGeneratedLessonDate)
      : courseEndDate;
  }

  /**
   * Generate unconfirmed replacement lessons and retain each replaced lesson's
   * original date, matching the legacy CourseReschedule behavior:
   *
   * 1. INSERT lessons with isConfirmed=0 and originalDate = old lesson date
   * 2. UPDATE originalDate to new lesson date
   */
  private async generateLessonsForReschedule(
    enrolment: Enrolment,
    lastLesson: Lesson,
    courseEndDate: Date,
    schedule: CourseSchedule,
    loggedUserId: number,
    oldLessonsMap: Map<number, Lesson>,
    dateToChangeSchedule: Date,
    rescheduleBeginDate: Date | undefined,
    persistence: PermanentScheduleChangeDraftPersistence,
  ): Promise<Date | null> {
    console.log('[RESCHEDULE] generateLessonsForReschedule called with:', {
      lastLessonDate: lastLesson.date.toISOString(),
      courseEndDate: courseEndDate.toISOString(),
      scheduleStartDate: schedule.startDate
        ? new Date(schedule.startDate).toISOString()
        : 'null',
      scheduleDay: schedule.day,
      dateToChangeSchedule: dateToChangeSchedule.toISOString(),
    });

    // For reschedule, always use schedule.startDate (which is nextDate calculated from rescheduleBeginDate)
    // This matches legacy: Course::generateLessons($lessons, $startDate, ...) where $startDate is rescheduleStartDate
    // We should NOT use lastLesson.date + 1 day for reschedule, as that would create lessons before rescheduleBeginDate
    let actualStartDate: Date;
    if (schedule.startDate) {
      // Use schedule.startDate (nextDate from rescheduleBeginDate) - this is the correct reschedule start date
      actualStartDate = new Date(schedule.startDate);
      console.log(
        '[RESCHEDULE] Using schedule.startDate (reschedule begin date) as actualStartDate:',
        actualStartDate.toISOString(),
      );
    } else {
      // Fallback: use lastLesson.date + 1 day (for regular lesson generation, not reschedule)
      const startDate = new Date(lastLesson.date);
      startDate.setUTCDate(startDate.getUTCDate() + 1);
      actualStartDate = startDate;
      console.log(
        '[RESCHEDULE] No schedule.startDate, using lastLesson.date + 1 day as fallback:',
        actualStartDate.toISOString(),
      );
    }

    let currentDate = new Date(actualStartDate);
    const dayOfWeek = schedule.day; // 1-7 (Monday-Sunday)

    const lessons: Lesson[] = [];
    const oldLessonsToReplace = sortPermanentScheduleLessonsByOccurrence(
      Array.from(oldLessonsMap.values()),
    );
    const invoicedLessonIds = await persistence.findInvoicedLessonIds(
      oldLessonsToReplace.map((lesson) => lesson.id),
    );

    console.log('[RESCHEDULE] Starting lesson generation loop:', {
      actualStartDate: actualStartDate.toISOString(),
      actualStartDateDay: actualStartDate.getUTCDay(),
      dayOfWeek,
      oldLessonsToReplaceCount: oldLessonsToReplace.length,
      dateToChangeSchedule: dateToChangeSchedule.toISOString(),
      courseEndDate: courseEndDate.toISOString(), // logging only; generation count follows legacy old-lesson count
    });

    if (oldLessonsToReplace.length === 0) {
      return null;
    }

    let lessonCount = 0;
    const targetDayOfWeek = dayOfWeek === 7 ? 0 : dayOfWeek;
    const normalizedScheduleDuration =
      schedule.duration.includes(':') &&
      schedule.duration.split(':').length === 2
        ? `${schedule.duration}:00`
        : schedule.duration;
    const defaultExplodedDuration = '00:15:00'; // Legacy Lesson::DEFAULT_LESSON_DURATION
    let lastPlannedLessonDate: Date | null = null;

    // Safety: ensure currentDate lands on the selected weekday.
    while (currentDate.getUTCDay() !== targetDayOfWeek) {
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    // Ensure we don't create lessons before rescheduleBeginDate (if provided)
    // This is a safety check - actualStartDate should already be >= rescheduleBeginDate since it's calculated from it
    const minDate = rescheduleBeginDate ? new Date(rescheduleBeginDate) : null;
    if (minDate) {
      minDate.setUTCHours(0, 0, 0, 0);
      // If actualStartDate is before rescheduleBeginDate, adjust it (shouldn't happen, but safety check)
      if (actualStartDate < minDate) {
        console.log(
          '[RESCHEDULE] WARNING: actualStartDate is before rescheduleBeginDate, adjusting:',
          {
            actualStartDate: actualStartDate.toISOString(),
            rescheduleBeginDate: minDate.toISOString(),
          },
        );
        currentDate = new Date(minDate);
        // Ensure currentDate is on or after the target day
        while (currentDate.getUTCDay() !== targetDayOfWeek) {
          currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }
        console.log(
          '[RESCHEDULE] Adjusted currentDate to:',
          currentDate.toISOString(),
        );
      }
    }

    // One replacement per old lesson keeps confirmation pairing aligned. A
    // rescheduled lesson contributes its original occurrence week so PSC
    // absorbs an eligible cross-month move without removing that weekly slot.
    const plannedDates = planRescheduleDates(
      getPermanentSchedulePlanningDates(oldLessonsToReplace),
      targetDayOfWeek,
      minDate ?? (actualStartDate ? new Date(actualStartDate) : null),
      isProfessionalDevelopmentDay,
    );

    for (const [oldLessonIndex, oldLesson] of oldLessonsToReplace.entries()) {
      currentDate = new Date(plannedDates[oldLessonIndex]);

      lessonCount++;
      console.log(
        `[RESCHEDULE] Lesson ${lessonCount} - Generating from old lesson:`,
        {
          oldLessonId: oldLesson.id,
          oldLessonDate: new Date(oldLesson.date).toISOString(),
          newLessonDateBase: currentDate.toISOString(),
        },
      );

      // Use parseLocalDateTime to handle timezone correctly (treat input as exact wall-clock time)
      const year = currentDate.getUTCFullYear();
      const month = String(currentDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getUTCDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const timeStr =
        schedule.fromTime.length === 8
          ? schedule.fromTime
          : `${schedule.fromTime}:00`;
      const dateTimeString = `${dateStr} ${timeStr}`;
      const lessonDate = parseLocalDateTime(dateTimeString);
      lastPlannedLessonDate = lessonDate;

      // Match legacy duration behavior for exploded lessons.
      const lessonDuration =
        Number(oldLesson.isExploded) === 1
          ? defaultExplodedDuration
          : normalizedScheduleDuration;

      // Match legacy insert intent: keep original date linkage from the lesson being replaced.
      // Legacy afterSave ultimately normalizes originalDate to the new lesson date.
      const originalDateForLesson = new Date(oldLesson.date);
      const dueDate = oldLesson.dueDate || lastLesson.dueDate || new Date();
      const now = getCurrentESTDate();
      const classroomId = await persistence.resolveClassroom(
        schedule.teacherId,
        enrolment.course.locationId,
        lessonDate,
        lessonDuration,
      );

      const lesson = persistence.createLesson({
        courseId: enrolment.courseId,
        teacherId: schedule.teacherId,
        classroomId: classroomId ?? undefined,
        colorCode: oldLesson.colorCode ?? undefined,
        date: lessonDate,
        duration: lessonDuration,
        status: LessonStatusEnum.SCHEDULED,
        isPresent: oldLesson.isPresent,
        isDeleted: false,
        isConfirmed: false, // Match legacy: isConfirmed=0
        type: oldLesson.type || 1,
        isExploded: oldLesson.isExploded || 0,
        isOnline: oldLesson.isOnline,
        createdByUserId: loggedUserId,
        updatedByUserId: loggedUserId,
        programRate: Number(oldLesson.programRate || 0),
        teacherRate: Number(oldLesson.teacherRate || 0),
        teacherRateOld: Number(oldLesson.teacherRateOld || 0),
        tax: Number(oldLesson.tax || 0),
        paidStatus: Number(oldLesson.paidStatus || 0),
        total: Number(oldLesson.total || 0),
        dueDate: dueDate,
        originalDate: originalDateForLesson,
        createdOn: now,
        updatedOn: now,
      });

      if (invoicedLessonIds.has(oldLesson.id)) {
        console.log(
          '[RESCHEDULE] Skipping draft creation for invoiced lesson (legacy parity):',
          {
            oldLessonId: oldLesson.id,
          },
        );
        // The next replacement has its own planned date, so nothing to advance.
        continue;
      }

      lessons.push(lesson);
    }

    console.log('[RESCHEDULE] Lesson generation loop completed:', {
      totalLessonsCreated: lessons.length,
      lessons: lessons.map((l) => ({
        id: l.id,
        date: new Date(l.date).toISOString(),
      })),
    });

    // Save all lessons
    if (lessons.length > 0) {
      const savedLessons = await persistence.saveLessons(lessons);
      console.log(
        '[RESCHEDULE] Saved lessons:',
        savedLessons.map((l) => ({
          id: l.id,
          date: new Date(l.date).toISOString(),
        })),
      );

      // Update originalDate to new lesson date (matching legacy: UPDATE lesson SET originalDate)
      for (const lesson of savedLessons) {
        await persistence.updateOriginalDate(lesson);
      }

      // Make lessons as root (create lesson_hierarchy entries)
      await persistence.makeLessonsAsRoot(savedLessons);

      // Apply discounts to new lessons
      await persistence.applyDiscounts(enrolment, savedLessons, loggedUserId);

      // Create private_lesson records (matching legacy)
      await persistence.createPrivateLessons(savedLessons, enrolment);

      // Match legacy return: end boundary is the last planned lesson date in loop.
      return (
        lastPlannedLessonDate ||
        new Date(savedLessons[savedLessons.length - 1].date)
      );
    }

    // If all lessons were invoiced (skipped), legacy still returns the last planned date.
    return lastPlannedLessonDate;
  }
}
