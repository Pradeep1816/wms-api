import { Transform, Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ItemCategoryRequestDto {

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    limit?: number;

    @IsOptional()
    @IsString()
    sort?: string;

    @IsOptional()
    @IsIn(['ASC', 'DESC'])
    @Transform(({ value }) => value?.toUpperCase())
    order?: string;
}

