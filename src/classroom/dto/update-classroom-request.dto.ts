import { IsOptional, IsString } from "class-validator";

export class UpdateClassroomRequestDto{
    @IsOptional()
    @IsString()
    name:string;

    @IsOptional()
    @IsString()
    description:string;
}