import { IsNotEmpty, IsArray, ArrayMinSize, IsNumber, IsOptional, IsBoolean, IsDateString, Validate, IsString } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class SubstituteTeacherLessonRequestDto {
  @IsNotEmpty({ message: 'Lesson IDs are required' })
  @IsArray({ message: 'IDs must be an array' })
  @ArrayMinSize(1, { message: 'At least one lesson ID must be provided' })
  @IsNumber({}, { each: true, message: 'Each ID must be a number' })
  @Transform(({ value }) => {
    // Handle comma-separated string: "1,2,3" -> [1, 2, 3]
    if (typeof value === 'string') {
      return value.split(',').map(v => parseInt(v.trim(), 10)).filter(v => !isNaN(v));
    }
    // Handle array: [1, 2, 3] or ["1", "2", "3"]
    if (Array.isArray(value)) {
      return value.map(v => (typeof v === 'string' ? parseInt(v, 10) : v));
    }
    return value;
  })
  ids: number[];

  @IsOptional()
  @IsNumber({}, { message: 'Teacher ID must be a number' })
  @Type(() => Number)
  teacherId?: number;

  @IsOptional()
  @IsBoolean({ message: 'resolvingConflicts must be a boolean' })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  })
  resolvingConflicts?: boolean;
}

export class SubstituteLessonDto {
  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  teacherId?: number;
}