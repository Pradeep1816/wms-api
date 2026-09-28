import { Expose } from "class-transformer";

export class DeleteReminderNoteResponseDto{
    @Expose()
    id:number;

    @Expose()
    notes:string;

    @Expose()
    deletedByUserId:number;
   
}