import { IsIn, IsOptional, IsString, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Query params for Invoice Items GET API
 *
 * - enable: boolean - When true, returns all fields; when false, returns basic fields only
 * - sort: 'royaltyFree' | 'taxStatus' - Field to sort by
 * - order: 'ASC' | 'DESC' - Sort order (case-insensitive in query, normalized here)
 */
export class InvoiceItemsRequestDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true || value === '1' || value === 1)
  @IsBoolean()
  enable?: boolean = false;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @Transform(({ value }) => value?.toUpperCase())
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC';
}

