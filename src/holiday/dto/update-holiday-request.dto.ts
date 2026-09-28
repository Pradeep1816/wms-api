import { IsOptional, IsString } from "class-validator";

export class UpdateHolidayRequestDto{
    @IsString()
    @IsOptional()
    date:string;
    
    @IsString()
    @IsOptional()
    description:string
}