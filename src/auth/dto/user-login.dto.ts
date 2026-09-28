import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UserLoginDto {
  @IsString()
  @MinLength(1)
  identity: string;

  @IsString()
  @MinLength(1)
  password: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
