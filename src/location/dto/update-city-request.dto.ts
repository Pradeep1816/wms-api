
import { IsString, IsNumber, IsOptional } from 'class-validator';

export class UpdateCityRequestDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  provinceId?: number;
}
