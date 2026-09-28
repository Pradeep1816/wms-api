import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class PaymentsListRequestDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 20;

  // Filters
  @IsOptional()
  @IsString()
  number?: string; // supports id like P-123 or reference substring

  @IsOptional()
  @IsString()
  customer?: string; // firstname/lastname contains search

  @IsOptional()
  @IsString()
  paymentMethod?: string; // name contains

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amount?: number;

  // Sorting
  @IsOptional()
  @IsString()
  sortBy?: 'number' | 'date' | 'customer' | 'paymentMethod' | 'amount';

  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}


