import { Expose } from 'class-transformer';

export class StudentAbsentLessonDto {
  @Expose()
  id: number;

  @Expose()
  date: string;

  @Expose()
  program: string;

  @Expose()
  teacher: string;

  @Expose()
  duration: string;

  @Expose()
  invoiceId: number;

  @Expose()
  invoiceNumber: string;

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

export class StudentAbsentLessonsDataDto {
  @Expose()
  body: StudentAbsentLessonDto[];

  @Expose()
  pagination: PaginationMetaDto;
}
