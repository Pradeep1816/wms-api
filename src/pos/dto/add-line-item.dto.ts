import { IsNotEmpty, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class AddLineItemDto {
  @IsNotEmpty()
  @IsNumber()
  itemId: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(999)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  overridePrice?: number;
}


