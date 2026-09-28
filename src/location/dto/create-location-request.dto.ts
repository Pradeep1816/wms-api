import {
  IsString,
  IsNumber,
  IsOptional,
  IsEmail,
  Min,
  MaxLength,
  IsDateString,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for creating a location (Step 1 validation).
 * Send as application/json. Numbers can be sent as numbers or numeric strings.
 */
export class CreateLocationRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  legal_corporate_name?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  address: string;

  @IsString()
  @MinLength(1)
  @MaxLength(16)
  phone_number: string;

  @IsEmail()
  email: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  city_id: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  province_id: number;

  @IsString()
  @MinLength(1)
  @MaxLength(16)
  postal_code: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  royaltyValue: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  advertisementValue: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  country_id?: number;

  @IsOptional()
  @IsDateString()
  conversionDate?: string;
}
