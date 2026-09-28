import { Expose } from 'class-transformer';

export class StudentUnscheduledLessonDto {
  @Expose()
  id: number;

  @Expose()
  program: string;

  @Expose()
  phone: string;

  @Expose()
  duration: string;

  @Expose()
  originalDate: string;

  @Expose()
  expiryDate: string;

  @Expose()
  online: string;

  @Expose()
  url: string;
}

export class PaginationMetaDto {
  @Expose()
  page: number;

  @Expose()
  limit: number;

  @Expose()
  total: number;

  @Expose()
  totalPages: number;
}

export class StudentUnscheduledLessonsDataDto {
  @Expose()
  body: StudentUnscheduledLessonDto[];

  @Expose()
  pagination: PaginationMetaDto;
}

