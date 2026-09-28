import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator"

export class UpdateProvinceRequestDto{
    @IsString()
    @IsOptional()
    name:string
    
    @IsNumber()
    @IsOptional()
    taxRate:number
    
    @IsNumber()
    @IsOptional()
    countryId:number
}