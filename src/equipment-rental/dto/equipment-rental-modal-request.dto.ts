import { IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class EquipmentRentalModalRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  id?: number;
}

