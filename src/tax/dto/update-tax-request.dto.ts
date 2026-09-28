import { IsNumber, IsOptional, IsString } from "class-validator";

export class UpdateTaxCodeRequestDto {
  @IsNumber()
  @IsOptional()
  taxTypeId: number;

  @IsNumber()
  @IsOptional()
  provinceId: number;

  @IsNumber()
  @IsOptional()
  rate: number;

  @IsString()
  @IsOptional()
  startDate: string;

  @IsString()
  @IsOptional()
  code: string;
}
