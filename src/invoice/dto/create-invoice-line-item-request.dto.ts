import { Expose } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsInt, Min } from 'class-validator';

/**
 * Request DTO for Create Line Item (Add Misc) API
 */
export class CreateLineItemRequestDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    quantity?: number;

    @IsNotEmpty()
    @IsNumber()
    itemId: number;
}

/**
 * Response DTO for Create Line Item API
 * body contains only id
 */
export class CreateLineItemResponseDto {
    @Expose()
    id: number;
}
