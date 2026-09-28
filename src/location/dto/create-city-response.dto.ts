import { Expose } from "class-transformer"

export class CreateCityResponseDto{
    @Expose()
    id:number

    @Expose()
    name:string
    
    @Expose()
    provinceId:number

    @Expose()
    createdOn:string
    
    @Expose()
    createdByUserId:number
}