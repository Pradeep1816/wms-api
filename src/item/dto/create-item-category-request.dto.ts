import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateItemCategoryRequestDto {

    @IsString()
    @IsNotEmpty({ message: 'Name is required' })
    name: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string | null;

    @Type(() => Number)
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(100)
    royality?: number;

}
