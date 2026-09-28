import { IsOptional, IsString } from "class-validator";

export class UpdateReferralSourceRequestDto{
    @IsString()
    @IsOptional()
    name:string;
}