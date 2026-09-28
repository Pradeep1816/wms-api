import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsIn, Min } from 'class-validator';

export class CountryRequestDto {
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
  @IsIn(['name'])
  sort?: 'name';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC';
}
