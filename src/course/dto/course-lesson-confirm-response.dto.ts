import { Expose } from 'class-transformer';

/**
 * DTO for confirm response data
 */
export class CourseLessonConfirmDataDto {
  @Expose()
  courseId: number;

  @Expose()
  confirmedLessons: number;

  @Expose()
  url: string;
}

/**
 * Full response DTO for course lesson confirm API
 */
export class CourseLessonConfirmResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Lessons confirmed successfully';

  @Expose()
  data: CourseLessonConfirmDataDto;
}
