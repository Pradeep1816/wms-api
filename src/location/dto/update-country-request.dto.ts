import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateCountryRequestDto {
  @IsNotEmpty()
  @IsString()
  name: string;
}
