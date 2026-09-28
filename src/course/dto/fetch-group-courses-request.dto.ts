import { IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class FetchGroupCoursesRequestDto {
  @IsNumber()
  @Type(() => Number)
  studentId: number;

  @IsOptional()
  @IsString()
  courseName?: string;
}

