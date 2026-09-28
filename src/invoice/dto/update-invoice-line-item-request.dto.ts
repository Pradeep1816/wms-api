import { IsNotEmpty, IsNumber, IsOptional, IsString, IsIn } from 'class-validator';
import { Expose, Type } from 'class-transformer';

/**
 * Request DTO for Update Line Item API
 */
export class UpdateLineItemRequestDto {
    @IsNotEmpty({ message: 'Description is required' })
    @IsString()
    description: string;

    @IsNotEmpty({ message: 'Amount is required' })
    @IsNumber()
    @Type(() => Number)
    amount: number;

    @IsNotEmpty({ message: 'Unit is required' })
    @IsNumber()
    @Type(() => Number)
    unit: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    cost?: number;

    @IsOptional()
    @IsIn([0, 1], { message: 'royaltyFree must be either 0 or 1' })
    @Type(() => Number)
    royaltyFree?: number;
}

/**
 * Response DTO for Update Line Item API
 * body contains only id
 */
export class UpdateLineItemResponseDto {
    @Expose()
    id: number;
}
