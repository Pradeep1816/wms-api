import { Expose } from "class-transformer";

export class UpdateReminderNoteResponseDto{
    @Expose()
    id:number;
    @Expose()
    notes:string;
    @Expose()
    updatedByUserId:number;
    @Expose()
    updatedOn:string;
}