import { Expose, Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class FinancialSummaryDataDto {
  @IsString()
  @Expose()
  id?: string;

  @IsString()
  @Expose()
  customerId?: string;

  @IsString()
  @Expose()
  studentName?: string;

  @IsString()
  @Expose()
  customerName: string;

  @IsString()
  @Expose()
  date?: string;

  @IsString()
  @Expose()
  duration?: string;

  @IsString()
  @Expose()
  amount?: string;

  @IsString()
  @Expose()
  paidAmount?: string;

  @IsString()
  @Expose()
  balance: string;
}


export class FinancialSummarySectionPaginationDto {
  @IsInt()
  @Min(1)
  @Expose()
  page: number;

  @IsInt()
  @Min(1)
  @Expose()
  limit: number;

  @IsInt()
  @Min(0)
  @Expose()
  total: number;

  @IsInt()
  @Min(1)
  @Expose()
  totalPages: number;
}

export class FinancialSummaryResponseDto {
  @IsString()
  @Expose()
  title: string;

  @IsArray()
  @Expose()
  body: FinancialSummaryDataDto[];

  @Expose()
  @Type(() => FinancialSummarySectionPaginationDto)
  @ValidateNested()
  pagination: FinancialSummarySectionPaginationDto;
}



