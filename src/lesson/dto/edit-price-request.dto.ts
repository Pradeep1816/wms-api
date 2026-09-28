import { Type } from 'class-transformer';
import { IsNumber, IsInt, Min } from 'class-validator';

/**
 * DTO for PUT /edit-price endpoint - validates request body with program rate
 */
export class EditPriceRequestDto {
  @Type(() => Number)
  @IsInt()
  id: number;

  @IsNumber()
  @Min(0, { message: 'Program Rate must be a positive number' })
  @Type(() => Number)
  programRate: number;
}
