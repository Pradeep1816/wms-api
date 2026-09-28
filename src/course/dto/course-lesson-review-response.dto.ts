import { Expose, Type } from 'class-transformer';

/**
 * DTO for individual lesson review item
 */
export class LessonReviewItemDto {
  @Expose()
  id: number;

  @Expose()
  date: string;

  @Expose()
  duration: string;

  @Expose()
  conflict?: string;

  @Expose()
  isHolidayConflict: boolean;

  @Expose()
  isConflict: boolean;

  @Expose()
  isUnscheduled: boolean;
}

/**
 * DTO for lesson review summary
 */
export class LessonReviewSummaryDto {
  @Expose()
  holidayConflicted: number;

  @Expose()
  conflicted: number;

  @Expose()
  unscheduled: number;

  @Expose()
  scheduled: number;

  @Expose()
  total: number;
}

/**
 * DTO for complete lesson review data (flat structure)
 */
export class CourseLessonReviewDataDto {
  @Expose()
  courseId: number;

  @Expose()
  program: string;

  @Expose()
  teacher: string;

  @Expose()
  period: string;

  @Expose()
  time: string;

  @Expose()
  @Type(() => LessonReviewItemDto)
  lessons: LessonReviewItemDto[];

  @Expose()
  @Type(() => LessonReviewSummaryDto)
  summary: LessonReviewSummaryDto;
}

/**
 * Full response DTO for course lesson review API
 */
export class CourseLessonReviewResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Lesson review data retrieved successfully';

  @Expose()
  @Type(() => CourseLessonReviewDataDto)
  data: CourseLessonReviewDataDto;
}
