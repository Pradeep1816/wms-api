import { IsString, IsOptional, IsNumber, MinLength, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  @IsOptional()
  firstname?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  @IsOptional()
  lastname?: string;

  @IsNumber()
  @IsOptional()
  referralSourceId?: number;

  @IsString()
  @IsOptional()
  referralSourceDescription?: string;
}
