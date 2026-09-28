import { IsOptional, IsString, IsBoolean, IsNumber, IsDateString } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { BadRequestException } from '@nestjs/common';

export class ScheduleSearchDto {
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

  @IsOptional()
  @Transform(({ value }) => {
    if (value === '0' || value === 0) return false;
    if (value === '1' || value === 1) return true;
    return Boolean(value);
  })
  @Type(() => Boolean)
  showAll?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  programId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  teacherId?: number;
}

export class RenderDayEventsRequestDto {
  // ScheduleSearch parameters (nested object)
  @IsOptional()
  @Type(() => ScheduleSearchDto)
  ScheduleSearch?: ScheduleSearchDto;
}
