import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export enum ReportRentalFilterType {
  ALL = 'all',
  ACTIVE_CURRENT = 'active_current',
  ACTIVE_OVERDUE = 'active_overdue',
  ACTIVE_EXPIRING = 'active_expiring',
}

export class ReportRentalReportsRequestDto {
  @IsOptional()
  @IsEnum(ReportRentalFilterType)
  filterType?: ReportRentalFilterType = ReportRentalFilterType.ALL;

  // Optional filter alias used by older clients: '0' | '1' | '2'
  // 0: active/current, 1: overdue, 2: expiring
  @IsOptional()
  @IsString()
  showOptions?: '0' | '1' | '2';

  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  toDate?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value ?? '1'))
  @IsNumber()
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value ?? '20'))
  @IsNumber()
  limit?: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: string = 'startDate';

  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  @IsOptional()
  @IsString()
  search?: string;
}


