import { IsNotEmpty, IsNumber, Min } from 'class-validator';

/**
 * DTO for editing a lesson's cost (teacherRate).
 */
export class EditLessonCostDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(0, { message: 'teacherRate must be a non-negative number' })
  teacherRate: number;
}
