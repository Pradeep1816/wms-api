import { IsNotEmpty, IsNumber } from 'class-validator';
import { Expose, Type } from 'class-transformer';

/**
 * Request DTO for Adjust Tax API
 */
export class AdjustTaxRequestDto {
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  taxAdjusted: number;
}

/**
 * Response body info for Adjust Tax API
 */
export class AdjustTaxInfo {
  @Expose()
  id: number;

  @Expose()
  tax: string;

  @Expose()
  total: string;

  @Expose()
  balance: string;
}

export class AdjustTaxResponseDto {
  @Expose()
  body: AdjustTaxInfo;
}
