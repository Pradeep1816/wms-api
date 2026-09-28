import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class CreateTaxCodeRequestDto {
  @IsNumber()
  @IsNotEmpty({ message: "taxTypeId is required" })
  taxTypeId: number;

  @IsNumber()
  @IsNotEmpty({ message: "provinceId is required" })
  provinceId: number;

  @IsNumber()
  @IsNotEmpty({ message: "rate is required" })
  rate: number;

  @IsOptional()
  @IsString()
  startDate: string;  

  @IsNotEmpty({ message: "code is required" })
  @IsString()          
  code: string;
}
