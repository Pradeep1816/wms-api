import { IsOptional, IsString } from 'class-validator';

export class UserInfoRequestDto {
  @IsOptional()
  @IsString()
  role?: string;
}

