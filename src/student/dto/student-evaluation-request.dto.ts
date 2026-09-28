import { IsOptional, IsNumber, Min, IsString, IsIn } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class StudentEvaluationRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  @IsIn(['mark', 'level'])
  sort?: string = 'mark';

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.toUpperCase())
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC' = 'DESC';
}
