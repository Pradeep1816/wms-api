
import { IsString, IsOptional, IsNumber, IsBoolean, IsIn, Min, Max, IsEmail } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CustomerListRequestDto {

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

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  })
  @IsBoolean()
  showInActive?: boolean = false;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  })
  @IsBoolean()
  showActive?: boolean = false;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  firstName?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  lastName?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  email?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  student?: string;

  @IsOptional()
  @IsIn(['all', 'credit', 'owing'])
  balance?: 'all' | 'credit' | 'owing' = 'all';

  @IsOptional()
  @IsIn(['firstName', 'lastName'])
  sort?: 'firstName' | 'lastName' = 'lastName';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'asc';

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  })
  @IsBoolean()
  showAll?: boolean = false;
}

export class CreateCustomerRequestDto {
  @IsString()
  @Transform(({ value }) => value?.trim())
  firstname: string;

  @IsString()
  @Transform(({ value }) => value?.trim())
  lastname: string;

  @IsEmail()
  @Transform(({ value }) => value?.trim())
  email: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  referralSourceId?: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  description?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  phoneNumber?: string;
}
