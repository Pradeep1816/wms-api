import { Expose, Transform, Type } from 'class-transformer';
import { IsArray, IsNumber, IsString, ValidateNested } from 'class-validator';
import { formatCurrency } from 'src/utils/formatters';

export class CustomerItemPurchasedReportRowDto {
  @Expose()
  @IsNumber()
  id: number;

  @Expose()
  @IsString()
  category_name: string;

  @Expose()
  @IsString()
  description: string;

  @Expose()
  @IsString()
  price: string;
}

export class CustomerItemPurchasedReportDataDto {
  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomerItemPurchasedReportRowDto)
  body: CustomerItemPurchasedReportRowDto[];

  @Expose()
  footer: { totalAmount: string };


  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

