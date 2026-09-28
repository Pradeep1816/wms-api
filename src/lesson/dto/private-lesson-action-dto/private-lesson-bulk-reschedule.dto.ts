import { IsArray, IsDateString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class PrivateLessonBulkRescheduleDto {
  @IsArray()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  lessonIds: number[];

  /**
   * New date (YYYY-MM-DD), like legacy bulkRescheduleDate.
   */
  @IsDateString()
  newDate: string;
}

