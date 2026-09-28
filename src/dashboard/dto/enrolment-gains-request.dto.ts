import { IsOptional, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class EnrolmentGainsRequestDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}\s*-\s*\d{4}-\d{2}-\d{2}$/, {
    message: 'dateRange must be in format "YYYY-MM-DD - YYYY-MM-DD"',
  })
  dateRange?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fromDate must be in format "YYYY-MM-DD"',
  })
  fromDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'toDate must be in format "YYYY-MM-DD"',
  })
  toDate?: string;
}
