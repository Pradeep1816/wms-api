import { Expose } from 'class-transformer';

export class EnrolmentLessonDto {
  @Expose()
  id: number;

  @Expose()
  dueDate: string;

  @Expose()
  date: string;

  @Expose()
  duration: string;

  @Expose()
  status: string;

  @Expose()
  price: string;

  @Expose()
  owing: string;

  @Expose()
  online: string;
}

export class PaginationDto {
  @Expose()
  page: number;

  @Expose()
  limit: number;

  @Expose()
  total: number;

  @Expose()
  totalPages: number;
}

export class EnrolmentLessonsDataDto {
  @Expose()
  body: EnrolmentLessonDto[];

  @Expose()
  pagination?: PaginationDto;
}

export class EnrolmentLessonsResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Enrolment lessons retrieved successfully';

  @Expose()
  data: EnrolmentLessonsDataDto;
}
