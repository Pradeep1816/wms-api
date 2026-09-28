import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsIn, Min } from 'class-validator';

export class CityRequestDto {
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
  province?: string; 

  @IsOptional()
  @IsIn(['name', 'province'])
  sort?: 'province' | 'name';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order?: 'DESC' | 'ASC';
}
