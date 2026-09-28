import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class GroupLessonDiscountQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  lessonId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  enrolmentId: number;
}

