import { Expose } from 'class-transformer';

/**
 * DTO for both GET and PUT /edit-price endpoints - formats response with program rate
 */
export class EditPriceResponseDto {
  @Expose()
  programRate: number;
}

export interface EditPriceResponse {
  body: EditPriceResponseDto;
}
