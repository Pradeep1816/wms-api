import { IsOptional, IsNumber, Min, IsBoolean, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class EquipmentRentalRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  showAll?: boolean;
}
