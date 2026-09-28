import { IsNotEmpty, IsNumber, IsString } from "class-validator";

export class CreateCityRequestDto{
    @IsString()
    @IsNotEmpty({message:'city name is required'})
    name:string

    @IsNotEmpty({message:'provinceId is required'})
    @IsNumber()
    provinceId:number
}