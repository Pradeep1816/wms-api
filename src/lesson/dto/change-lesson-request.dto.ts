import { IsNotEmpty, IsInt, IsArray, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class ChangeLessonRequestDto {
  @IsNotEmpty({ message: 'Program ID is required' })
  @IsInt({ message: 'Program ID must be an integer' })
  @Type(() => Number)
  programId: number;

  @IsNotEmpty({ message: 'Teacher ID is required' })
  @IsInt({ message: 'Teacher ID must be an integer' })
  @Type(() => Number)
  teacherId: number;

  @IsNotEmpty({ message: 'Lesson IDs are required' })
  @IsArray({ message: 'Lesson IDs must be an array' })
  @ArrayMinSize(1, { message: 'At least one lesson ID is required' })
  @IsInt({ each: true, message: 'Each lesson ID must be an integer' })
  @Type(() => Number)
  lessonIds: number[];
}

