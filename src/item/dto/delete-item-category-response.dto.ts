import { Expose } from "class-transformer";

export class DeleteItemCategoryResponseDto{
   
    @Expose()
    id:number;

    @Expose()
    deletedByUserId:number;
}