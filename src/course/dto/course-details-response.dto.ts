import { Expose, Type } from 'class-transformer';

/**
 * DTO for course schedule information
 */
export class CourseScheduleDto {
  @Expose()
  id: number;

  @Expose()
  duration: string;

  @Expose()
  time: string;

  @Expose()
  period: string;
}

/**
 * DTO for course details response
 * Fields: Program, Teacher, Rate, Online, Schedule
 */
export class CourseDetailsDto {
  @Expose()
  id: number;

  @Expose()
  program: string;

  @Expose()
  teacher: string;

  @Expose()
  rate: string;

  @Expose()
  online: string;
}

export class CourseDetailsData {
  @Expose()
  @Type(() => CourseDetailsDto)
  course: CourseDetailsDto;

  @Expose()
  @Type(() => CourseScheduleDto)
  schedule: CourseScheduleDto;
  
}

/**
 * DTO for course details data wrapper
 */
export class CourseDetailsDataDto {
  @Expose()
  body: CourseDetailsData;
}

/**
 * Full response DTO for course details API
 */
export class CourseDetailsResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Course details retrieved successfully';

  @Expose()
  data: CourseDetailsDataDto;
}
