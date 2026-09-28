import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateLessonFieldRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  id?: number; // Lesson ID (can be in body or query)

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  teacherId?: number; // Lesson[teacherId]

  @IsOptional()
  @IsString()
  date?: string; // Lesson[date] - can be in various formats (legacy: "MMM dd, yyyy HH:mm AM/PM" or ISO)

  @IsOptional()
  @IsString()
  duration?: string; // Lesson[duration] - HH:mm:ss format

  @IsOptional()
  @IsString()
  hour?: string; // hour field (00-23)

  @IsOptional()
  @IsString()
  minute?: string; // minute field (00-59)

  @IsOptional()
  @IsString()
  goToDate?: string; // goToDate field - can be in various formats (legacy: "MMM dd, yyyy" or ISO)

  @IsOptional()
  @IsString()
  applyContext?: string; // Lesson[applyContext] - '2' for apply all, '1' for apply single
}

