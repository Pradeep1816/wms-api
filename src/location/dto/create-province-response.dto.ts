import { Expose } from "class-transformer"

export class CreateProvinceResponseDto{
    
    @Expose()
    id:number

    @Expose()
    name:string

    @Expose()
    taxRate:number

    @Expose()
    countryId:number

    @Expose()
    createdOn:string
    
    @Expose()
    createdByUserId:number
}