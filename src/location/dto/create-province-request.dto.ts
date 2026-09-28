import { IsNotEmpty, IsNumber, IsString } from "class-validator";

export class CreateProvinceRequestDto{
    @IsString()
    @IsNotEmpty({message:'Name is required'})
    name:string

    @IsNumber()
    @IsNotEmpty({message:'TaxRate is required'})
    taxRate:number
    
    @IsNumber()
    @IsNotEmpty({message:'countryId is required'})
    countryId:number
}