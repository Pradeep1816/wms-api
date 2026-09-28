import { IsNotEmpty, IsString } from "class-validator";

export class CreateHolidayRequestDto{
    @IsString()
    @IsNotEmpty({message:'Date is required'})
    date:string;

    @IsString()
    @IsNotEmpty({message:'Description is required'})
    description:string

}