import { Expose } from 'class-transformer';

/**
 * DTO for individual group course item in list
 * Columns: Course, Teacher, Rate, From Time, Duration, Start Date, End Date
 */
export class GroupCourseListItemDto {
  @Expose()
  id: number;

  @Expose()
  course: string;

  @Expose()
  teacher: string;

  @Expose()
  rate: string;

  @Expose()
  fromTime: string;

  @Expose()
  duration: string;

  @Expose()
  startDate: string;

  @Expose()
  endDate: string;
}

/**
 * DTO for group course list data with pagination
 */
export class GroupCourseListDataDto {
  @Expose()
  body: GroupCourseListItemDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Full response DTO for group course list API
 */
export class GroupCourseListResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Group courses retrieved successfully';

  @Expose()
  data: GroupCourseListDataDto;
}

