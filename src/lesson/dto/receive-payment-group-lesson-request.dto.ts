import { IsNumber, IsOptional, Min, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class ReceivePaymentGroupLessonRequestDto {
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
   * Optional student ID to filter group lessons for a specific student
   * under the customer account.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  studentId?: number;

  /**
   * Optional start date for filtering group lessons by due date (inclusive).
   * When used together with endDate, the API will return group lessons whose
   * dueDate falls between [startDate, endDate].
   */
  @IsOptional()
  @IsDateString()
  startDate?: string;

  /**
   * Optional end date for filtering group lessons by due date (inclusive).
   */
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
