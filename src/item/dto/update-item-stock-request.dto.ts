import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsInt,
  IsOptional,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateItemStockRequestDto {
  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean;

  @ValidateIf(
    (dto: UpdateItemStockRequestDto) =>
      dto.trackInventory === true ||
      (dto.trackInventory == null && dto.stockQuantity != null),
  )
  @IsDefined()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockQuantity?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lowStockQuantity?: number | null;
}
