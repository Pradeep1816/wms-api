import { Expose } from 'class-transformer';

export class PrivateLessonListItemDto {
  @Expose()
  id: number;

  @Expose()
  courseId: number;

  @Expose()
  date: string | null;

  @Expose()
  student: string | null;

  @Expose()
  program: string | null;

  @Expose()
  teacher: string | null;

  @Expose()
  duration: string;

  @Expose()
  online: string;

  @Expose()
  status: string;

  @Expose()
  payment: string;

  @Expose()
  price: number;

  @Expose()
  customerEmail?: string | null;

  @Expose()
  customerEmails?: string | null;
}

export class PrivateLessonListDataDto {
  @Expose()
  body: PrivateLessonListItemDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class PrivateLessonListResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Private lessons retrieved successfully';

  @Expose()
  data: PrivateLessonListDataDto;
}
