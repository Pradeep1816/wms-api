import { Expose } from 'class-transformer';

export class PrivateLessonDto {
  @Expose()
  dueDate: string;

  @Expose()
  studentId: number | null;

  @Expose()
  studentName: string;

  @Expose()
  lessonId: number | null;

  @Expose()
  url: string;

  @Expose()
  programName: string;

  @Expose()
  date: string;

  @Expose()
  duration: string;

  @Expose()
  status: string;

  @Expose()
  price: number;

  @Expose()
  owing: number;
}

export class PrivateLessonsDataDto {
  @Expose()
  body: PrivateLessonDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class PrivateLessonsResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Private lessons retrieved successfully';

  @Expose()
  data: PrivateLessonsDataDto;
}
