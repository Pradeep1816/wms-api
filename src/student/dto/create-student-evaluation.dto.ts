import { IsNotEmpty, IsNumber, IsOptional, IsString, Min, Max, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateStudentEvaluationDto {
  @IsOptional()
  @IsDateString()
  date?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  mark?: number;

  @IsNotEmpty()
  @IsString()
  level: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  programId: number;

  @IsOptional()
  @IsString()
  type?: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  teacherId: number;
}
