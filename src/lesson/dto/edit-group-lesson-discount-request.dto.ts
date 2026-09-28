import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, Max, Min } from 'class-validator';

export class EditGroupLessonDiscountDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  lessonId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  enrolmentId: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  value: number;

  @Type(() => Number)
  @IsNumber()
  @IsIn([0, 1]) // 0 = $, 1 = %
  valueType: number;
}

