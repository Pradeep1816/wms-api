import { Expose } from 'class-transformer';

export class CourseLessonItemDto {
  @Expose()
  id: number;

  @Expose()
  date: string | null;

  @Expose()
  status: string;

  @Expose()
  teacher: string;

  @Expose()
  online: string;
}

export class CourseLessonDataDto {
  @Expose()
  body: CourseLessonItemDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class CourseLessonResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Course lessons retrieved successfully';

  @Expose()
  data: CourseLessonDataDto;
}
