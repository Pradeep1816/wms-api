import { Expose } from 'class-transformer';

export class UnscheduledLessonListItemDto {
  @Expose()
  id: number;

  @Expose()
  status: string;

  @Expose()
  student: string | null;

  @Expose()
  program: string | null;

  @Expose()
  teacher: string | null;

  @Expose()
  duration: string;

  @Expose()
  date: string | null;

  @Expose()
  expiryDate: string | null;

  @Expose()
  type: number;
}

export class UnscheduledLessonListDataDto {
  @Expose()
  body: UnscheduledLessonListItemDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class UnscheduledLessonListResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Unscheduled lessons retrieved successfully';

  @Expose()
  data: UnscheduledLessonListDataDto;
}

