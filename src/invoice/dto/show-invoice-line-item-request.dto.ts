import { Type } from 'class-transformer';
import {
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';

/**
 * Request DTO for Show Items GET API (Add Line Items modal)
 * Matches legacy InvoiceController::actionShowItems
 *
 * Filtering: code, description (LIKE '%value%')
 * Sorting: sort = 'code' | 'description', order = 'ASC' | 'DESC'
 * Pagination: page (1-indexed, default 1), limit (default 20)
 * By default no sorting is applied.
 */
export class ShowInvoiceLineItemRequestDto {
    @IsOptional()
    @IsString()
    code?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    @IsIn(['code', 'description'], { message: 'sort must be code or description' })
    sort?: string;

    @IsOptional()
    @IsString()
    @IsIn(['ASC', 'DESC', 'asc', 'desc'], { message: 'order must be ASC or DESC' })
    order?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    limit?: number = 20;
}
