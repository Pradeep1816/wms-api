import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CustomerInvoicePrintRequestDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsIn([1, 2, 3, 4, 5, 6])
  invoiceStatus?: number = 6;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  studentId?: number;
}
