import { Expose } from "class-transformer"

export class UpdateCityResponseDto{
    @Expose()
    id:number

    @Expose()
    name:string
    
    @Expose()
    provinceId:number

    @Expose()
    updatedOn:string
    
    @Expose()
    updatedByUserId:number
}