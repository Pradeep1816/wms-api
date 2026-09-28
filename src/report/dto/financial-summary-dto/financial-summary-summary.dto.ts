import { Expose } from 'class-transformer';
import { IsArray, IsInt, IsString, ValidateNested } from 'class-validator';

export class FinancialSummarySummaryItemDto {
  @IsString()
  @Expose()
  particulars: string;

  @IsInt()
  @Expose()
  count: number;

  @IsString()
  @Expose()
  total: string;
}

export class FinancialSummarySummaryResponseDto {
  @IsArray()
  @Expose()
  body: FinancialSummarySummaryItemDto[];
}
