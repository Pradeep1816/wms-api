import { IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from "class-validator";

export class LocationHstRequestDto {
    @IsOptional()
    @IsString()
    @MaxLength(20, {message:'HST registration number must be at most 20 characters'})
    hst: string;
}   