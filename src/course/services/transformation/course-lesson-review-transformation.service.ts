import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Course } from '../../entities/course.entity';
import { CourseSchedule } from '../../entities/course-schedule.entity';
import { Lesson } from '../../../lesson/entities/lesson.entity';
import { Holiday } from '../../../holiday/entities/holiday.entity';
import {
  CourseLessonReviewDataDto,
  LessonReviewItemDto,
  LessonReviewSummaryDto,
} from '../../dto/course-lesson-review-response.dto';
import { formatTime, formatDuration } from '../../../utils/formatters';
import { formatDate, formatDateWithTime } from '../../../utils/date-utils';

/**
 * Raw lesson data with conflict info
 */
export interface RawLessonReviewItem {
  lesson: Lesson;
  holiday: Holiday | null;
  hasTeacherConflict: boolean;
  hasStudentConflict: boolean;
}

/**
 * Transformation service for course lesson review
 * Transforms raw data to DTOs
 */
@Injectable()
export class CourseLessonReviewTransformationService {
  /**
   * Transform course and lessons to review data DTO
   */
  transformToDto(
    course: Course,
    courseSchedule: CourseSchedule | null,
    rawLessons: RawLessonReviewItem[],
  ): CourseLessonReviewDataDto {
    const lessons = this.transformLessons(rawLessons);
    const summary = this.calculateSummary(lessons);

    return plainToInstance(
      CourseLessonReviewDataDto,
      {
        courseId: course.id,
        program: course.program?.name || '',
        teacher: this.getTeacherName(course),
        period: this.formatPeriod(course.startDate, course.endDate),
        time: formatTime(courseSchedule?.fromTime || '') ?? '',
        lessons,
        summary,
      },
      { excludeExtraneousValues: true },
    );
  }

  /**
   * Transform raw lessons to DTOs
   */
  private transformLessons(rawLessons: RawLessonReviewItem[]): LessonReviewItemDto[] {
    return rawLessons.map((item) => {
      const lessonDate = new Date(item.lesson.date);
      const conflictMessages: string[] = [];

      // Holiday conflict
      if (item.holiday) {
        conflictMessages.push(`Holiday: ${item.holiday.description || 'Holiday'}`);
      }

      // Student conflict
      if (item.hasStudentConflict) {
        conflictMessages.push("Lesson time conflicts with student's another lesson");
      }

      // Teacher conflict
      if (item.hasTeacherConflict) {
        conflictMessages.push("Lesson time conflicts with teacher's another lesson");
      }

      const hasConflict = conflictMessages.length > 0;
      const isHolidayConflict = !!item.holiday;

      return plainToInstance(
        LessonReviewItemDto,
        {
          id: item.lesson.id,
          date: formatDateWithTime(lessonDate) ?? '',
          duration: formatDuration(item.lesson.duration) || item.lesson.duration,
          conflict: hasConflict ? conflictMessages.join('; ') : undefined,
          isHolidayConflict,
          isConflict: hasConflict && !isHolidayConflict,
          isUnscheduled: false,
        },
        { excludeExtraneousValues: true },
      );
    });
  }

  /**
   * Calculate lesson review summary
   */
  private calculateSummary(lessons: LessonReviewItemDto[]): LessonReviewSummaryDto {
    const holidayConflicted = lessons.filter((l) => l.isHolidayConflict).length;
    const conflicted = lessons.filter((l) => l.isConflict && !l.isHolidayConflict).length;
    const unscheduled = lessons.filter((l) => l.isUnscheduled).length;
    const scheduled = lessons.length - holidayConflicted - conflicted - unscheduled;

    return plainToInstance(
      LessonReviewSummaryDto,
      {
        holidayConflicted,
        conflicted,
        unscheduled,
        scheduled,
        total: lessons.length,
      },
      { excludeExtraneousValues: true },
    );
  }

  /**
   * Get teacher full name from course
   */
  private getTeacherName(course: Course): string {
    const profile = course.teacher?.profile;
    if (!profile) {
      return '';
    }
    const { firstname, lastname } = profile;
    return `${firstname || ''} ${lastname || ''}`.trim();
  }

  /**
   * Format period as "MMM DD, YYYY - MMM DD, YYYY"
   */
  private formatPeriod(startDate: Date | null, endDate: Date | null): string {
    if (!startDate || !endDate) {
      return '';
    }
    const startFormatted = formatDate(new Date(startDate));
    const endFormatted = formatDate(new Date(endDate));
    return `${startFormatted} - ${endFormatted}`;
  }
}
