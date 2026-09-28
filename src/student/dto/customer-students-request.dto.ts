import { IsOptional, IsNumber, Min, IsBoolean } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CustomerStudentsRequestDto {
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
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  })
  @IsBoolean()
  showActive?: boolean = false;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  excludeStudentId?: number;
}
