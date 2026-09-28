import { IsBoolean, IsDateString, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class DiscountRequestDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['true', '1', 'yes'].includes(value.toLowerCase());
    return false;
  })
  @IsBoolean()
  summaryOnly?: boolean = false;
}
