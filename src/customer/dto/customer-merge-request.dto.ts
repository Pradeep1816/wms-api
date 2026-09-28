import { Transform, Type } from "class-transformer";
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from "class-validator";

export class MergeCustomerListRequestDto {
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
    phone?: string;

    @IsOptional()
    @IsIn(['firstName', 'lastName', 'email', 'phone'])
    sort?: 'firstName' | 'lastName' | 'email' | 'phone' = 'lastName';

    @IsOptional()
    @IsIn(['asc', 'desc'])
    order?: 'asc' | 'desc' = 'asc';
}

export class MergeCustomerRequestDto {
    @IsNotEmpty()
    @IsNumber()
    @IsPositive()
    @Type(() => Number)
    sourceCustomerId: number;
  }
  

