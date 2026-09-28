import { Expose } from 'class-transformer';

/**
 * Response DTO for Delete Line Item API
 * body contains only id
 */
export class DeleteLineItemResponseDto {
    @Expose()
    id: number;
}
