import { Expose, Type } from 'class-transformer';

/**
 * Tax status option for dropdown
 */
export class TaxStatusOption {
    @Expose()
    id: number;

    @Expose()
    name: string;

    @Expose()
    rate: number;
}

/**
 * Response DTO for GET Edit Tax API
 * Returns current tax status/rate and available options
 */
export class EditTaxLineItemGetResponseDto {
    @Expose()
    currentTaxStatus: string | null;  // null if mixed statuses

    @Expose()
    currentTaxRate: number | null;    // null if mixed statuses

    @Expose()
    @Type(() => TaxStatusOption)
    availableTaxStatuses: TaxStatusOption[];
}
