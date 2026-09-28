import { IsString, IsOptional, IsNumber, IsBoolean, IsIn, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CustomerListNewRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 1000;

  /**
   * Customer status filter
   * 0 = All customers
   * 1 = Active customers
   * 2 = Inactive customers
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsIn([0, 1, 2])
  status?: number = 1;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  })
  @IsBoolean()
  walkinCustomers?: boolean = false; // false = regular customers only, true = include walk-in customers

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  search?: string;       
}
