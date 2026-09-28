import { Expose, Type } from 'class-transformer';

/**
 * Response DTO for a single item in the Show Items list.
 * Matches legacy grid columns: code, description, price.
 */
export class ShowInvoiceLineItemResponseDto {
    @Expose()
    @Type(() => Number)
    id: number;

    @Expose()
    code: string;

    @Expose()
    upcCode: string | null;

    @Expose()
    description: string;

    @Expose()
    @Type(() => Number)
    price: number;
}

/**
 * Paginated response DTO for the Show Items API.
 * Matches legacy ActiveDataProvider pagination structure.
 */
export class ShowInvoiceLineItemPaginatedResponseDto {
    @Expose()
    @Type(() => ShowInvoiceLineItemResponseDto)
    body: ShowInvoiceLineItemResponseDto[];

    @Expose()
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}
