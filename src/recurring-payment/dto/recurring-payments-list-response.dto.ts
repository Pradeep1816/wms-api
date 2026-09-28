import { Expose, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class RecurringPaymentListItemDto {
  @Expose()
  @IsInt()
  id: number;

  @Expose()
  @IsInt()
  customerId: number;

  @Expose()
  @IsOptional()
  @IsString()
  customer?: string;

  @Expose()
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @Expose()
  @IsOptional()
  @IsString()
  frequency?: string;

  @Expose()
  @IsOptional()
  @IsString()
  nextEntryDate?: string;

  @Expose()
  @IsOptional()
  @IsString()
  nextPaymentDate?: string;

  @Expose()
  @IsOptional()
  @IsString()
  expiryDate?: string;

  @Expose()
  @IsString()
  amount: string;

  @Expose()
  @IsBoolean()
  isEnabled: boolean;

  @Expose()
  @IsBoolean()
  isExpired: boolean;

  @Expose()
  @IsBoolean()
  hasEnrolmentWarning: boolean;
}

export class RecurringPaymentsPaginationDto {
  @Expose()
  @IsInt()
  @Min(1)
  page: number;

  @Expose()
  @IsInt()
  @Min(1)
  limit: number;

  @Expose()
  @IsInt()
  @Min(0)
  total: number;

  @Expose()
  @IsInt()
  @Min(0)
  totalPages: number;
}

export class RecurringPaymentsListResponseDto {
  @Expose()
  @IsArray()
  @Type(() => RecurringPaymentListItemDto)
  body: RecurringPaymentListItemDto[];

  @Expose()
  @ValidateNested()
  @Type(() => RecurringPaymentsPaginationDto)
  pagination: RecurringPaymentsPaginationDto;
}
