import { IsInt, IsString, IsDateString, Matches, IsOptional } from 'class-validator';

export class ValidateLessonUpdateRequestDto {
  @IsInt()
  id: number; // Lesson ID to update

  @IsInt()
  teacherId: number;

  @IsDateString()
  date: string; // ISO date string (YYYY-MM-DDTHH:mm:ss.sssZ)

  @IsString()
  @Matches(/^\d{2}:\d{2}:\d{2}$/, { message: 'Duration must be in HH:mm:ss format' })
  duration: string;

  @IsOptional()
  @IsString()
  applyContext?: string; // Optional context (e.g., '1' for apply all)
}

