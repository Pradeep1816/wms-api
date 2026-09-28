import { Expose } from 'class-transformer';

/**
 * DTO for both GET and PUT /edit-tax endpoints - formats response with tax value
 */
export class EditTaxResponseDto {
  @Expose()
  tax: string;
}

export interface EditTaxResponse {
  body: EditTaxResponseDto;
}
