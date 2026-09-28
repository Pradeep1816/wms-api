import { IsNotEmpty, IsString } from "class-validator";

export class CreateReminderNoteRequestDto{
    @IsString()
    @IsNotEmpty({message:'Notes is required'})
    notes:string;
}