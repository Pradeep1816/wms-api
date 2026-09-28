import { BadRequestException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsDateString, IsOptional } from 'class-validator';

export class DailyScheduleRequestDto {
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => {
    if (!value) return undefined;
    const dateStr = String(value);
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    if (!dateRegex.test(dateStr)) {
      throw new BadRequestException('Date must be in YYYY-MM-DD format');
    }
    return dateStr;
  })
  date?: string;
}
