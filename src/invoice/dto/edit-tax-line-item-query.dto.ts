import { Type, Transform } from 'class-transformer';
import { IsArray, ArrayMinSize, IsInt } from 'class-validator';

/**
 * Request DTO for GET Edit Tax API
 * Query parameters to fetch current tax status and available options
 */
export class EditTaxLineItemQueryDto {
    @Transform(({ value }) => {
        if (!value) return [];
        
        const values = Array.isArray(value) ? value : [value];
        
        return values
            .flatMap(v => String(v).split(','))
            .map(v => parseInt(v.trim(), 10))
            .filter(v => !isNaN(v) && v > 0);
    })
    @IsArray()
    @ArrayMinSize(1, { message: 'At least one line item ID is required' })
    @IsInt({ each: true })
    lineItemIds: number[];
}
