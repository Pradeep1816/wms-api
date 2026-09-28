import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { BadRequestException } from '@nestjs/common';

export class TeacherScheduleDetailsRequestDto {
  @IsOptional()
  @IsString()
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
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true' || value === '1';
    }
    return Boolean(value);
  })
  showAll?: boolean;
}

