import { IsOptional, IsString, IsNumber, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class LocationRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit: number = 20;

  @IsOptional()
  @IsString()
  @IsIn(['name', 'address', 'email'])
  sort: 'name' | 'address' | 'email';

  @IsOptional()
  @IsString()
  @IsIn(['ASC', 'DESC'])
  order: 'ASC' | 'DESC';
}
