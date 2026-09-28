import { Injectable, NotFoundException } from '@nestjs/common';
import { CourseLessonReviewRepository } from '../repositories/course-lesson-review.repository';
import { ProgramTypeEnum } from '../../program/enums/program-type';
import { formatTime } from 'src/utils/formatters';
import { formatDate, formatDateWithTime } from 'src/utils/date-utils';
import {
  LessonReviewItemDto,
  LessonReviewSummaryDto,
  CourseLessonReviewDataDto,
} from '../dto/course-lesson-review-response.dto';

/**
 * Service for reviewing course lessons before confirmation
 */
@Injectable()
export class CourseLessonReviewService {
  constructor(
    private readonly repository: CourseLessonReviewRepository,
  ) {}

  /**
   * Get lesson review data for a course
   * Shows all unconfirmed lessons with conflict detection
   */
  async getLessonReview(
    courseId: number,
    locationId: number,
    showAllReviewLessons: boolean = false,
  ): Promise<CourseLessonReviewDataDto> {
    // Get course with relations
    const course = await this.repository.getCourseWithRelations(courseId);

    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    // Check if group course
    const isGroupCourse = course.program?.type === ProgramTypeEnum.GROUP_PROGRAM;

    // Enrolment is OPTIONAL for group courses
    const enrolment = await this.repository.getEnrolmentWithStudent(courseId);

    // For group courses without enrolment, that's OK
    const studentId = enrolment?.studentId ?? null;

    // Get lessons for the course (status=2 SCHEDULED, isConfirmed=false)
    const lessons = await this.repository.getUnconfirmedLessons(courseId);

    // Filter lessons by date
    const startDate = course.startDate;
    const startDateOnly = new Date(startDate);
    startDateOnly.setHours(0, 0, 0, 0);

    const filteredLessons = showAllReviewLessons
      ? lessons
      : lessons.filter((lesson) => {
          const lessonDate = new Date(lesson.date);
          lessonDate.setHours(0, 0, 0, 0);
          return lessonDate >= startDateOnly;
        });

    // Check conflicts for each lesson
    const reviewLessons: LessonReviewItemDto[] = [];

    for (const lesson of filteredLessons) {
      const lessonDate = new Date(lesson.date);
      const conflictMessages: string[] = [];

      // 1. Check holiday conflict
      const holidayDateStr = lessonDate.toISOString().split('T')[0];
      const holiday = await this.repository.getHolidayByDate(holidayDateStr);

      if (holiday) {
        conflictMessages.push(`Holiday: ${holiday.description || 'Holiday'}`);
      }

      // 2. Check student conflict (ONLY for private programs with enrolled students)
      if (!isGroupCourse && studentId) {
        const hasStudentConflict = await this.repository.checkStudentConflict(
          studentId,
          lessonDate,
          lesson.duration,
          locationId,
          lesson.id,
        );

        if (hasStudentConflict) {
          conflictMessages.push("Lesson time conflicts with student's another lesson");
        }
      }

      // 3. Check teacher conflict
      const hasTeacherConflict = await this.repository.checkTeacherConflict(
        course.teacherId,
        lessonDate,
        lesson.duration,
        locationId,
        lesson.id,
      );

      if (hasTeacherConflict) {
        conflictMessages.push("Lesson time conflicts with teacher's another lesson");
      }

      const hasConflict = conflictMessages.length > 0;
      const isHolidayConflict = !!holiday;

      reviewLessons.push({
        id: lesson.id,
        date: formatDateWithTime(lessonDate) ?? '',
        duration: lesson.duration,
        conflict: hasConflict ? conflictMessages.join('; ') : undefined,
        isHolidayConflict,
        isConflict: hasConflict && !isHolidayConflict,
        isUnscheduled: false,
      });
    }

    // Calculate summary
    const summary = this.calculateSummary(reviewLessons);

    // Get names
    const teacherName = this.getTeacherName(course);

    // Get start time from course schedule
    const courseSchedule = await this.repository.getRecentCourseSchedule(courseId);

    return {
      courseId: course.id,
      program: course.program?.name || '',
      teacher: teacherName,
      period: `${formatDate(course.startDate)} - ${formatDate(course.endDate)}`,
      time: formatTime(courseSchedule?.fromTime || '') ?? '',
      lessons: reviewLessons,
      summary,
    };
  }

  /**
   * Calculate lesson review summary
   */
  private calculateSummary(lessons: LessonReviewItemDto[]): LessonReviewSummaryDto {
    const holidayConflicted = lessons.filter((l) => l.isHolidayConflict).length;
    const conflicted = lessons.filter((l) => l.isConflict && !l.isHolidayConflict).length;
    const unscheduled = lessons.filter((l) => l.isUnscheduled).length;
    const scheduled = lessons.length - holidayConflicted - conflicted - unscheduled;

    return {
      holidayConflicted,
      conflicted,
      unscheduled,
      scheduled,
      total: lessons.length,
    };
  }

  /**
   * Get teacher full name from course
   */
  private getTeacherName(course: any): string {
    if (!course.teacher?.profile) {
      return '';
    }
    const { firstname, lastname } = course.teacher.profile;
    return `${firstname || ''} ${lastname || ''}`.trim();
  }
}
