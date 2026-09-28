import { IsString, IsEmail, IsOptional, IsInt, Min, Max, MinLength, MaxLength, Matches } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(2, { message: 'First name must be at least 2 characters' })
  @MaxLength(255, { message: 'First name must not exceed 255 characters' })
  firstname: string;

  @IsString()
  @MinLength(2, { message: 'Last name must be at least 2 characters' })
  @MaxLength(255, { message: 'Last name must not exceed 255 characters' })
  lastname: string;

  @IsEmail({}, { message: 'Email must be a valid email address' })
  @IsOptional()
  @MaxLength(255, { message: 'Email must not exceed 255 characters' })
  email?: string;

  @IsString()
  @IsOptional()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password?: string;

  @IsString()
  @IsOptional()
  @MinLength(6, { message: 'Confirm password must be at least 6 characters' })
  confirmPassword?: string;

  @IsInt()
  @IsOptional()
  @Min(1111, { message: 'PIN must be at least 1111' })
  @Max(9999, { message: 'PIN must not exceed 9999' })
  pin?: number;

  @IsString()
  @IsOptional()
  username?: string;

  @IsOptional()
  canMerge?: boolean;
}

