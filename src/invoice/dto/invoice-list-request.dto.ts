import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class InvoiceListRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  // Date range filter (default: This Month)
  @IsOptional()
  @IsString()
  fromDate?: string; // Format: YYYY-MM-DD

  @IsOptional()
  @IsString()
  toDate?: string; // Format: YYYY-MM-DD

  @IsOptional()
  @IsString()
  number?: string;

  @IsOptional()
  @IsString()
  customer?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  customerId?: number;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  student?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsIn([1, 2, 3, 5, 6]) // 1=Owing, 2=Paid, 3=Credit, 5=Void, 6=All
  status?: number;

  @IsOptional()
  @IsString()
  @IsIn(['number', 'customer', 'student', 'date'])
  sort?: string = 'date';

  @IsOptional()
  @Transform(({ value }) => value?.toUpperCase())
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC' = 'DESC';

  // When true: Returns all items without pagination
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true || value === '1' || value === 1)
  @IsBoolean()
  showAll?: boolean = false;
}
