import { IsOptional, IsString, IsInt, IsDateString, Matches } from 'class-validator';

export class UpdateLessonRequestDto {
  @IsOptional()
  @IsDateString()
  date?: string; // ISO date string (YYYY-MM-DDTHH:mm:ss.sssZ)

  @IsOptional()
  @IsInt()
  teacherId?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}:\d{2}$/, { message: 'Duration must be in HH:mm:ss format' })
  duration?: string;
}