import { IsOptional, IsNumber, Min, IsString, IsBoolean, IsIn, IsDateString } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class EnrolmentSearchDto {
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
  program?: string;

  @IsOptional()
  @IsString()
  student?: string;

  @IsOptional()
  @IsString()
  teacher?: string;

  @IsOptional()
  @IsString()
  startFrom?: string;

  @IsOptional()
  @IsString()
  startTo?: string;

  @IsOptional()
  @IsString()
  endFrom?: string;

  @IsOptional()
  @IsString()
  endTo?: string;

  @IsOptional()
  @Transform(({ value }) => value?.toLowerCase())
  @IsIn(['enabled', 'disabled', 'all'])
  isAutoRenewal?: 'enabled' | 'disabled' | 'all';

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true || value === undefined)
  @IsBoolean()
  showActive?: boolean = true;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  showInActive?: boolean = false;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  showAll?: boolean = false;

  @IsOptional()
  @IsString()
  lessonsRemaining?: string;

  @IsOptional()
  @IsIn(['program', 'student', 'teacher', 'startDate', 'endDate'])
  sort?: 'program' | 'student' | 'teacher' | 'startDate' | 'endDate' = 'program';

  @IsOptional()
  @Transform(({ value }) => value?.toUpperCase())
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC' = 'ASC';
}
