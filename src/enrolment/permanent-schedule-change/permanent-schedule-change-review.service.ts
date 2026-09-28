/**
 * Complete lesson-review workflow for permanent schedule changes (PSC). This
 * service owns PSC review decisions and consumes only the PSC review repository,
 * leaving the generic lesson review service unchanged and independent.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  PermanentScheduleChangeReviewDataDto,
  PermanentScheduleChangeReviewItemDto,
} from '../dto/permanent-schedule-change/permanent-schedule-change-review-response.dto';
import { isPermanentScheduleLessonRestored } from './domain/permanent-schedule-eligibility.policy';
import { PermanentScheduleChangeReviewRepository } from '../repositories/permanent-schedule-change/permanent-schedule-change-review.repository';

/** Builds the full legacy-compatible review for a PSC draft. */
@Injectable()
export class PermanentScheduleChangeReviewService {
  /** Inject the repository containing all PSC review database operations. */
  constructor(
    private readonly repository: PermanentScheduleChangeReviewRepository,
  ) {}

  /**
   * Review replacement lessons, conflicts, changed old lessons, and the
   * effective schedule period without delegating to non-PSC review code.
   */
  async getReview(
    courseId: number,
    locationId: number,
    showAllReviewLessons: boolean,
    rescheduleBeginDate?: Date,
    rescheduleEndDate?: Date,
  ): Promise<PermanentScheduleChangeReviewDataDto> {
    const course = await this.repository.findCourse(courseId);
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    const enrolment = await this.repository.findEnrolment(courseId);
    if (!enrolment) {
      throw new NotFoundException(`Enrolment for course ${courseId} not found`);
    }

    const lessons = await this.repository.findDraftLessons(
      courseId,
      course.startDate,
      showAllReviewLessons,
      rescheduleBeginDate,
      rescheduleEndDate,
    );

    let excludedConflictLessonIds: number[] = [];
    if (rescheduleBeginDate) {
      const oldLessonCandidates = await this.repository.findEligibleOldLessons(
        courseId,
        rescheduleBeginDate,
      );
      excludedConflictLessonIds = oldLessonCandidates
        .filter(
          (lesson) =>
            !isPermanentScheduleLessonRestored(lesson, rescheduleBeginDate),
        )
        .map(({ id }) => id);

      console.log('[REVIEW] Old lesson IDs to exclude from conflict checks:', {
        count: excludedConflictLessonIds.length,
        lessonIds: excludedConflictLessonIds,
      });
    }

    const reviewDateKeys = Array.from(
      new Set(
        lessons.map(({ date }) => new Date(date).toISOString().split('T')[0]),
      ),
    );
    const holidays = await this.repository.findHolidays(reviewDateKeys);
    const holidayByDate = new Map<string, (typeof holidays)[number]>();
    for (const holiday of holidays) {
      const dateKey = new Date(holiday.date).toISOString().split('T')[0];
      if (!holidayByDate.has(dateKey)) {
        holidayByDate.set(dateKey, holiday);
      }
    }
    const courseConflicts = lessons.length
      ? await this.repository.findCourseDraftLessons(courseId)
      : [];
    const conflictFlagsByLessonId = await this.repository.findConflictFlags(
      lessons,
      enrolment.studentId,
      course.teacherId,
      locationId,
      excludedConflictLessonIds,
    );

    const reviewLessons: PermanentScheduleChangeReviewItemDto[] = [];
    for (const lesson of lessons) {
      const lessonDate = new Date(lesson.date);
      const conflictMessages: string[] = [];
      const holiday = holidayByDate.get(lessonDate.toISOString().split('T')[0]);
      if (holiday) {
        conflictMessages.push(`Holiday: ${holiday.description || 'Holiday'}`);
      }

      const conflictFlags = conflictFlagsByLessonId.get(lesson.id);
      if (conflictFlags?.student) {
        conflictMessages.push(
          "Lesson time conflicts with student's another lesson",
        );
      }

      const courseConflict = courseConflicts.find(
        (candidate) =>
          candidate.id !== lesson.id &&
          new Date(candidate.date).toDateString() ===
            lessonDate.toDateString() &&
          this.isTimeOverlapping(
            lessonDate,
            lesson.duration,
            new Date(candidate.date),
            candidate.duration,
          ),
      );
      if (courseConflict) {
        conflictMessages.push(
          'Lesson time conflicts with same enrolment lesson',
        );
      }
      if (conflictFlags?.teacher) {
        conflictMessages.push(
          "Lesson time conflicts with teacher's another lesson",
        );
      }

      const hasConflict = conflictMessages.length > 0;
      const isHolidayConflict = Boolean(holiday);
      reviewLessons.push({
        id: lesson.id,
        date: lessonDate,
        duration: lesson.duration,
        conflict: hasConflict ? conflictMessages.join('; ') : undefined,
        isHolidayConflict,
        isConflict: hasConflict && !isHolidayConflict,
        isUnscheduled: false,
      });
    }

    const holidayConflicted = reviewLessons.filter(
      ({ isHolidayConflict }) => isHolidayConflict,
    ).length;
    const conflicted = reviewLessons.filter(
      ({ isConflict, isHolidayConflict }) => isConflict && !isHolidayConflict,
    ).length;
    const unscheduled = reviewLessons.filter(
      ({ isUnscheduled, isHolidayConflict, isConflict }) =>
        isUnscheduled && !isHolidayConflict && !isConflict,
    ).length;
    const scheduled =
      reviewLessons.length - holidayConflicted - conflicted - unscheduled;

    let teacherName = '';
    let teacherId: number | undefined;
    if (rescheduleBeginDate && lessons.length > 0) {
      const firstLesson = lessons[0];
      if (firstLesson.teacher?.profile) {
        teacherName =
          `${firstLesson.teacher.profile.firstname || ''} ${firstLesson.teacher.profile.lastname || ''}`.trim();
        teacherId = firstLesson.teacherId ?? undefined;
        console.log('[REVIEW] Using teacher from new lesson:', {
          teacherId: firstLesson.teacherId,
          teacherName,
        });
      }
    }
    if (!teacherName) {
      teacherName = course.teacher?.profile
        ? `${course.teacher.profile.firstname || ''} ${course.teacher.profile.lastname || ''}`.trim()
        : '';
      teacherId = course.teacherId ?? undefined;
      console.log('[REVIEW] Using teacher from course:', {
        teacherId: course.teacherId,
        teacherName,
      });
    }

    const studentName = enrolment.student
      ? `${enrolment.student.firstName || ''} ${enrolment.student.lastName || ''}`.trim()
      : '';

    let startDate: Date;
    let endDate: Date;
    let startTime: string;
    if (rescheduleBeginDate && reviewLessons.length > 0) {
      startDate = new Date(rescheduleBeginDate);
      startDate.setUTCHours(0, 0, 0, 0);
      if (rescheduleEndDate) {
        endDate = new Date(rescheduleEndDate);
      } else {
        endDate = new Date(reviewLessons[reviewLessons.length - 1].date);
      }
      endDate.setUTCHours(23, 59, 59, 999);

      const firstLessonDate = new Date(reviewLessons[0].date);
      startTime = `${String(firstLessonDate.getUTCHours()).padStart(
        2,
        '0',
      )}:${String(firstLessonDate.getUTCMinutes()).padStart(2, '0')}:${String(
        firstLessonDate.getUTCSeconds(),
      ).padStart(2, '0')}`;
    } else {
      startDate = course.startDate;
      endDate = course.endDate;
      const recentSchedule = await this.repository.findRecentSchedule(courseId);
      startTime = recentSchedule?.fromTime || '';
    }

    let unscheduledLessons: PermanentScheduleChangeReviewItemDto[] = [];
    let rescheduledLessons: PermanentScheduleChangeReviewItemDto[] = [];
    if (rescheduleBeginDate) {
      const changedLessons = await this.repository.findChangedLessons(
        courseId,
        rescheduleBeginDate,
      );
      unscheduledLessons = changedLessons.unscheduledLessons.map((lesson) => ({
        id: lesson.id,
        date: new Date(lesson.date),
        duration: lesson.duration,
      }));
      rescheduledLessons = changedLessons.rescheduledLessons.map((lesson) => ({
        id: lesson.id,
        date: new Date(lesson.date),
        duration: lesson.duration,
      }));
    }

    return {
      courseId: course.id,
      programId: course.programId ?? course.program?.id ?? undefined,
      programName: course.program?.name || '',
      teacherId,
      teacherName,
      studentName,
      startDate,
      endDate,
      startTime,
      lessons: reviewLessons,
      unscheduledLessons,
      rescheduledLessons,
      summary: {
        holidayConflicted,
        conflicted,
        unscheduled,
        scheduled,
        total: reviewLessons.length,
      },
    };
  }

  /** Return whether two lesson date-duration ranges overlap. */
  private isTimeOverlapping(
    date1: Date,
    duration1: string,
    date2: Date,
    duration2: string,
  ): boolean {
    const time1 = date1.getTime();
    const [hours1, minutes1, seconds1] = duration1.split(':').map(Number);
    const end1 = time1 + (hours1 * 3600 + minutes1 * 60 + seconds1) * 1000;
    const time2 = date2.getTime();
    const [hours2, minutes2, seconds2] = duration2.split(':').map(Number);
    const end2 = time2 + (hours2 * 3600 + minutes2 * 60 + seconds2) * 1000;
    return time1 < end2 && time2 < end1;
  }
}
