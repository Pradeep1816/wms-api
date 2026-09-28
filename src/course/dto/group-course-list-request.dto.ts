import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * DTO for group course list search parameters
 * Based on legacy CourseSearch.php
 */
export class GroupCourseSearchDto {
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

  @IsOptional()
  @IsString()
  query?: string;


  /**
   * When false (default): Shows only active courses (endDate >= today)
   * When true: Shows all courses including inactive/past ones
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true || value === '1' || value === 1)
  @IsBoolean()
  showAllCourses?: boolean = false;

  @IsOptional()
  @IsString()
  @IsIn(['course', 'teacher', 'rate', 'startDate', 'endDate'])
  sort?: 'course' | 'teacher' | 'rate' | 'startDate' | 'endDate' = 'course';

  @IsOptional()
  @Transform(({ value }) => value?.toUpperCase())
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC' = 'ASC';

  /**
   * When true: Returns all items without pagination
   * When false (default): Returns paginated data
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true || value === '1' || value === 1)
  @IsBoolean()
  showAll?: boolean = false;
}

