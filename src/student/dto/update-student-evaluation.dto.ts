import { IsOptional, IsNumber, IsString, Min, Max, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateStudentEvaluationDto {
  @IsOptional()
  @IsDateString()
  date?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  mark?: number;

  @IsOptional()
  @IsString()
  level?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  programId?: number;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  teacherId?: number;
}
