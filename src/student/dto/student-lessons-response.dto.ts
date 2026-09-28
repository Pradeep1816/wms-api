import { Expose } from 'class-transformer';

export class StudentLessonDto {
  @Expose()
  id: number;

  @Expose()
  courseId?: number;

  @Expose()
  programId?: number;

  @Expose()
  teacherId?: number;

  @Expose()
  programName: string;

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
  isOnline: string;

  @Expose()
  url: string;
}

export class StudentPrivateLessonsGroupedByDueDateDto {
  @Expose()
  dueDate: string;

  @Expose()
  lessons: StudentLessonDto[];
}

export class StudentPrivateLessonsDataDto {
  @Expose()
  body: StudentPrivateLessonsGroupedByDueDateDto[];
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

export class StudentGroupLessonsDataDto {
  @Expose()
  body: StudentPrivateLessonsGroupedByDueDateDto[];

  @Expose()
  pagination: PaginationMetaDto;
}

export class StudentPrivateLessonsResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Student private lessons retrieved successfully';

  @Expose()
  data: StudentPrivateLessonsDataDto;
}
