import { IsNumber, IsOptional, Min, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class ReceivePaymentLessonRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;

  /**
   * Optional student ID to filter lessons for a specific student
   * under the customer account.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  studentId?: number;

  /**
   * Optional start date for filtering lessons by due date (inclusive).
   * When used together with endDate, the API will return lessons whose
   * dueDate falls between [startDate, endDate], including future lessons.
   *
   * Format: ISO date string (e.g. "2025-01-31" or full ISO timestamp).
   */
  @IsOptional()
  @IsDateString()
  startDate?: string;

  /**
   * Optional end date for filtering lessons by due date (inclusive).
   * See startDate documentation for behaviour details.
   */
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

