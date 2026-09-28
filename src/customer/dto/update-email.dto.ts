import { IsString, IsOptional, IsNumber, IsBoolean, IsEmail, MinLength, MaxLength } from 'class-validator';

export class UpdateEmailDto {
  @IsNumber()
  @IsOptional()
  id?: number;

  @IsEmail()
  @IsOptional()
  email?: string;

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

