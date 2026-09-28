import { IsOptional, IsNumber, Min } from 'class-validator';

export class UpdateLineItemDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  overridePrice?: number;
}
