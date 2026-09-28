import { IsString, IsOptional, IsNumber, IsBoolean, MinLength, MaxLength } from 'class-validator';

export class UpdateAddressDto {
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
  city?: string; // Can be city name or city ID

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
  label?: string; // Can be "Home", "Work", "Other" or a custom label name

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;
}
