import { IsString, IsOptional, IsNumber, IsBoolean, MinLength, MaxLength } from 'class-validator';

export class UpdateUserAddressDto {
  @IsNumber()
  @IsOptional()
  id?: number;

  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(64)
  address?: string;

  @IsString()
  @IsOptional()
  @MaxLength(16)
  postalCode?: string;

  @IsString()
  @IsOptional()
  city?: string; 

  @IsNumber()
  @IsOptional()
  cityId?: number;

  @IsNumber()
  @IsOptional()
  provinceId?: number;

  @IsNumber()
  @IsOptional()
  countryId?: number;

  @IsString()
  @IsOptional()
  label?: string;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;
}

