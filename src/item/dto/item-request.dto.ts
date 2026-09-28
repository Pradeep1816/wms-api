import { Type, Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsIn, Min, IsBoolean } from 'class-validator';

export class GetItemsRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @Transform(({ value }) => value?.toUpperCase())
  @IsIn(['ASC', 'DESC'])
  sortOrder: 'ASC' | 'DESC' = 'ASC';

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  upcCode?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  itemCategory?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') {
        return true;
      }
      if (normalized === 'false' || normalized === '0' || normalized === '') {
        return false;
      }
    }
    // For actual booleans or undefined/null
    return Boolean(value);
  })
  @IsBoolean()
  showAll?: boolean;
}
