import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * DTO for program list search parameters
 */
export class ProgramListRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  /**
   * Program type filter
   * Supports both uppercase ('PRIVATE'/'GROUP') and lowercase ('private'/'group')
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase();
    }
    return value;
  })
  @IsString()
  @IsIn(['private', 'group'])
  type?: 'private' | 'group';

  /**
   * Filter by program name (LIKE search)
   */
  @IsOptional()
  @IsString()
  name?: string;

  /**
   * Filter by rate (LIKE search)
   */
  @IsOptional()
  @IsString()
  rate?: string;

  /**
   * Show only active programs
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  })
  @IsBoolean()
  showActive?: boolean = false;

  /**
   * Show only inactive programs
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  })
  @IsBoolean()
  showInActive?: boolean = false;

  /**
   * Show all programs (both active and inactive)
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  })
  @IsBoolean()
  showAll?: boolean = false;

  /**
   * Sort field
   */
  @IsOptional()
  @IsString()
  @IsIn(['name', 'rate'])
  sort?: 'name' | 'rate' = 'name';

  /**
   * Sort field 
   * Maps to 'sort' internally
   */
  @IsOptional()
  @IsString()
  @IsIn(['name', 'rate'])
  sortBy?: 'name' | 'rate';

  /**
   * Sort order
   * Supports both 'order' and 'sortOrder'
   */
  @IsOptional()
  @Transform(({ value }) => value?.toUpperCase())
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC' = 'ASC';

  /**
   * Sort order 
   * Maps to 'order' internally
   */
  @IsOptional()
  @Transform(({ value }) => value?.toUpperCase())
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
