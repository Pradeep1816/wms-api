import { Expose, Type } from 'class-transformer';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

export class AvailableCreditItemDto {
  @Expose()
  @IsNumber()
  id: number;

  @Expose()
  @IsDateString()
  date?: string; // ISO or formatted date string

  @Expose()
  @IsString()
  amount: string;
}

export class AvailableCreditsDataDto {
  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AvailableCreditItemDto)
  body: AvailableCreditItemDto[];

  @Expose()
  footer: { totalAmount: number };

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}


