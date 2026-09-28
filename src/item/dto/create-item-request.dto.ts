import { IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';

/**
 * Request DTO for creating an Item.
 * Mirrors legacy Item fields used on create.
 */
export class CreateItemRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  itemCategoryId: number;

  

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  code: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  })
  @IsString()
  @MaxLength(150)
  upcCode?: string | null;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  description: string;

  @Type(() => Number)
  @IsNumber()
  price: number;

  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  royaltyFree: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3])
  taxStatusId?: number;

  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  status: number;
}

