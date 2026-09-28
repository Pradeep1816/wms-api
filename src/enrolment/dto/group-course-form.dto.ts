import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GroupCourseFormDto {
  @IsNumber()
  @Type(() => Number)
  studentId: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  courseId?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  enrolmentId?: number;

  @IsOptional()
  @IsString()
  discount?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  discountType?: number;
}

