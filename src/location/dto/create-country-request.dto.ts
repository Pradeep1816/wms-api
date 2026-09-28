import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';


 export class CreateCountryRequestDto {
  @IsNotEmpty({ message: 'Country name is required' })
  @IsString()
  name: string;
}

