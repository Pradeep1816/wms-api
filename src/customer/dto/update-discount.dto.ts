import { IsNumber, IsOptional, Min, Max } from 'class-validator';

export class UpdateDiscountDto {
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  value?: number; // Discount percentage (0-100)
}
