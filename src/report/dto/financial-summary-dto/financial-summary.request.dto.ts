import { Expose, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class FinancialSummaryRequestDto {
  @IsOptional()
  @IsString()
  @Expose()
  goToDate?: string;

  // Global pagination
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Expose()
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Expose()
  limit: number = 5;
}


