import { IsNotEmpty, IsArray, IsString, ArrayMinSize, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { Expose } from 'class-transformer';

/**
 * Valid tax status values — must match exactly with `tax_status.name` in the database.
 * Legacy constants: TaxStatus::STATUS_DEFAULT=1, STATUS_NO_TAX=2, STATUS_GST_ONLY=3
 */
export const VALID_TAX_STATUSES = ['Default', 'No Tax', 'GST Only'] as const;

/**
 * Request DTO for Edit Tax API
 * Matches legacy actionEditTax() — accepts array of line item IDs and a tax status name.
 */
export class EditTaxLineItemRequestDto {
    @IsArray()
    @ArrayMinSize(1, { message: 'At least one line item ID is required' })
    @IsNotEmpty({ each: true })
    @Type(() => Number)
    lineItemIds: number[];

    @IsNotEmpty({ message: 'Tax status is required' })
    @IsString()
    @IsIn(VALID_TAX_STATUSES, {
        message: `Tax status must be one of: ${VALID_TAX_STATUSES.join(', ')}`,
    })
    taxStatus: string;
}

/**
 * Response DTO for Edit Tax API
 */
export class EditTaxLineItemResponseDto {
    @Expose()
    updatedCount: number;

    @Expose()
    taxRate?: number;
}
