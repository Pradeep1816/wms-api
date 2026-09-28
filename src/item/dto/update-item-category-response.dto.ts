import { Expose, Type } from 'class-transformer';

export class UpdateItemCategoryResponseDto {
    @Expose()
    id: number;   

    @Expose()
    name: string;

    @Expose()
    description: string | null;

    @Expose()
    @Type(() => Number)
    royality: number;

    @Expose()
    updatedByUserId: number;
}
