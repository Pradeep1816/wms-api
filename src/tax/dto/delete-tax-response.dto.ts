import { Expose } from "class-transformer";

export class DeleteTaxCodeResponseDto{
    @Expose()
    id:number;


    @Expose()
    deletedByUserId:number;
}