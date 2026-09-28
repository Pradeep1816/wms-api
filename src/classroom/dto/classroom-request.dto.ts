import { Transform, Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsIn, Min } from 'class-validator';

export class ClassroomRequestDto {
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
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['name', 'description'])
  sort: 'name' | 'description' = 'name';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  @Transform(({ value }) => value?.toUpperCase())
  order: 'ASC' | 'DESC' = 'ASC';
}
