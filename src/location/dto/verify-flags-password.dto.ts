import { IsString, MinLength } from 'class-validator';

export class VerifyFlagsPasswordDto {
  @IsString()
  @MinLength(1)
  password: string;
}
