import { IsOptional, IsNumber, Min, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class TeacherUnscheduledLessonsRequestDto {
  
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
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  showAll?: boolean;
}

