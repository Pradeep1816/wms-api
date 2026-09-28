import { IsOptional, IsString, IsNumber, Matches } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Request DTO for editing lesson schedule.
 * Works for both private and group lessons.
 *
 * Legacy compatible with PHP LessonController::actionUpdate()
 */
export class LessonEditScheduleRequestDto {
  /**
   * Teacher ID for the lesson
   * Optional - if not provided, keeps existing teacher
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  teacherId?: number;

  /**
   * Lesson date/time in format: 'yyyy-MM-dd h:mm a'
   * Example: "2025-02-25 3:30 PM"
   * Optional - if not provided, keeps existing date
   */
  @IsOptional()
  @IsString()
  date?: string;

  /**
   * Duration in HH:MM:SS format
   * Example: "01:00:00" for 1 hour
   * Optional - if not provided, keeps existing duration
   */
  @IsOptional()
  @IsString()
  @Matches(/^([0-9]{2}):([0-5][0-9]):([0-5][0-9])$/, {
    message: 'duration must be in HH:MM:SS format',
  })
  duration?: string;

  /**
   * Expiry date for private lessons only
   * After this date, lesson cannot be booked
   * Format: legacy "MMM D, YYYY" or ISO 8601
   * Optional - only applies to private lessons
   */
  @IsOptional()
  @IsString()
  expiryDate?: string;
}
