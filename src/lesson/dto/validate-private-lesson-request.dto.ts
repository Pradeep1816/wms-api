import { IsNotEmpty, IsNumber, IsString, IsOptional, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class ValidatePrivateLessonRequestDto {
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  programId: number;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  teacherId: number;

  @IsNotEmpty()
  @IsString()
  date: string; // Format: 'YYYY-MM-DD HH:mm:ss'

  @IsNotEmpty()
  @IsString()
  duration: string; // Format: 'HH:mm:ss'

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isOnline?: boolean;
}

