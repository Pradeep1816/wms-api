import { IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Request DTO for confirming course lessons
 */
export class CourseLessonConfirmRequestDto {
  @IsNumber()
  @Type(() => Number)
  courseId: number;
}
