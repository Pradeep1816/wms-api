import { Expose, Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class PaymentListItemDto {
  @Expose()
  @IsInt()
  id: number;

  @Expose()
  @IsString()
  number?: string;

  @Expose()
  @IsString()
  date?: string;

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
  notes?: string;

  @Expose()
  @IsOptional()
  @IsString()
  reference?: string;

  @Expose()
  @IsString()
  amount: string;
}

export class PaginationDto {
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

export class PaymentsListResponseDto {
  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentListItemDto)
  body: PaymentListItemDto[];

  @Expose()
  @ValidateNested()
  @Type(() => PaginationDto)
  pagination: PaginationDto;
}


