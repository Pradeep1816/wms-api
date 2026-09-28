import { IsString, IsOptional, IsNumber, IsBoolean, IsEmail, MinLength, MaxLength } from 'class-validator';

export class UpdateUserEmailDto {
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
  label?: string;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;
}

