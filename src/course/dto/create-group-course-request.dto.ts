import { IsNumber, IsString, IsOptional, IsArray, ValidateNested, IsBoolean, Min, Max, Matches, ArrayMinSize } from 'class-validator';
import { Type, Transform } from 'class-transformer';

/**
 * DTO for individual schedule entry
 * Represents a weekly schedule (day + time)
 */
export class CourseScheduleDto {
  @IsString()
  @Matches(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|[1-7])$/i, {
    message: 'day must be a valid day name (Monday-Sunday) or number (1-7)',
  })
  day: string; 

  @IsString()
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/, { message: 'fromTime must be in HH:mm or HH:mm:ss format' })
  fromTime: string; 
}

/**
 * DTO for creating a group course
 * Matches legacy: Course::SCENARIO_GROUP_COURSE
 */
export class CreateGroupCourseRequestDto {
  @IsNumber()
  @Type(() => Number)
  programId: number;

  @IsNumber()
  @Type(() => Number)
  teacherId: number;

  @IsString()
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/, { message: 'duration must be in HH:mm or HH:mm:ss format' })
  duration: string; // Lesson duration (e.g., "01:00:00" for 1 hour)

  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(52)
  weeksCount: number; 

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Transform(({ value }) => value ?? 0)
  isOnline?: number; // 1 = online, 0 = in-person

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be in YYYY-MM-DD format' })
  startDate?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one schedule is required' })
  @ValidateNested({ each: true })
  @Type(() => CourseScheduleDto)
  schedules: CourseScheduleDto[]; 
}
