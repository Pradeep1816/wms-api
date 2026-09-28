import { Expose } from "class-transformer";

export class CreateReminderNoteResponseDto{
    @Expose()
    id:number;

    @Expose()
    notes:string;

    @Expose()
    createdOn:string;

    @Expose()
    createdByUserId:number;
}