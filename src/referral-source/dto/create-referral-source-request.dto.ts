import { IsNotEmpty, IsString } from "class-validator";

export class CreateReferralSourceRequestDto{
    @IsString()
    @IsNotEmpty({message:'Name is required'})
    name:string
}