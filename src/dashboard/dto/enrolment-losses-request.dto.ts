import { IsOptional, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class EnrolmentLossesRequestDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  dateRange?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fromDate must be in YYYY-MM-DD format',
  })
  fromDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'toDate must be in YYYY-MM-DD format',
  })
  toDate?: string;
}
