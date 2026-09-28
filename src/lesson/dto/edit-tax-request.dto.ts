import { Type } from 'class-transformer';
import { IsNumber, IsInt, Min } from 'class-validator';

/**
 * DTO for PUT /edit-tax endpoint - validates request body with lesson ID and tax amount
 */
export class EditTaxRequestDto {
  @Type(() => Number)
  @IsInt()
  id: number;

  @IsNumber()
  @Min(0, { message: 'Tax must be a positive number' })
  @Type(() => Number)
  tax: number;
}
