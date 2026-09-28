import { IsString, IsOptional, IsNumber, IsBoolean, MinLength, MaxLength } from 'class-validator';

export class UpdatePhoneDto {
  @IsNumber()
  @IsOptional()
  id?: number;

  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(15)
  number?: string;

  @IsNumber()
  @IsOptional()
  extension?: number;

  @IsString()
  @IsOptional()
  note?: string;

  @IsString()
  @IsOptional()
  label?: string; // Can be "Home", "Work", "Other" or a custom label name

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;
}
