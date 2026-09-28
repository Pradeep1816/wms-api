import { Expose } from "class-transformer"

export class DeleteProvinceResponseDto{
    @Expose()
    id:number
    
    @Expose()
    deletedByUserId:number
}