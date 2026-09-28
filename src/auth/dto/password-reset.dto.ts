import { IsOptional, IsString, MinLength } from 'class-validator';

export class PasswordResetDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  confirmPassword?: string;

  @IsOptional()
  @IsString()
  reenterpassword?: string;
}
