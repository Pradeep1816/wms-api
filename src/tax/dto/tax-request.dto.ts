import { Type } from 'class-transformer';
import { IsOptional, IsNumber, Min, IsIn } from 'class-validator';

export class TaxCodeRequestDto {
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
  @IsIn(['taxName', 'provinceName', 'startDate', 'code'])
  sort?: 'taxName' | 'provinceName' | 'startDate' | 'code';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC';
}
