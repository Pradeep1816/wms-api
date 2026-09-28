import { IsDate, IsDateString, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { BadRequestException } from '@nestjs/common';

export class ScheduleDetailsRequestDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    // Validate and transform the date
    if (!value) return '';
    const dateStr = String(value);
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    
    if (!dateRegex.test(dateStr)) {
      throw new BadRequestException('Date must be in YYYY-MM-DD format');
    }
    return dateStr;
  })
  
  date?: Date;
}
