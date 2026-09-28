import { Expose, Type } from 'class-transformer';

export class CreateItemCategoryResponseDto{
    @Expose()
    id:number;

    @Expose()
    name:string;

    @Expose()
    description: string | null;

    @Expose()
    @Type(() => Number)
    royality: number;

    @Expose()
    createdByUserId:number;
    
}
