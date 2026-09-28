import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class PrivateLessonListRequestDto {

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
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  student?: string;

  @IsOptional()
  @IsString()
  program?: string;

  @IsOptional()
  @IsString()
  teacher?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return value === 'true' || value === true || value === '1' || value === 1;
  })
  @IsBoolean()
  isOnline?: boolean;

  @IsOptional()
  @IsString()
  lessonStatus?: string; // Scheduled=2, Completed=3, Rescheduled=1, Unscheduled=5 . No=absent

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  owingStatus?: number; // 3 = Owing, 1 = Paid



  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  showAll?: boolean;

  @IsOptional()
  @IsString()
  sort?: 'student' | 'teacher' | 'program' | 'date' | 'dueDate';

  @IsOptional()
  @Transform(({ value }) => value?.toUpperCase())
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC' = 'ASC';
}
