import { Expose } from "class-transformer"

export class UpdateProvinceResponseDto{
    @Expose()
    id:number

    @Expose()
    name:string

    @Expose()
    taxRate:number

    @Expose()
    countryId:number

    @Expose()
    updatedOn:string

    @Expose()
    updatedByUserId:number
}