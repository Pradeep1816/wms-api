import { Expose } from 'class-transformer';

export class TeacherUnscheduledLessonDto {
  @Expose()
  id: number;

  @Expose()
  student: string;

  @Expose()
  phone: string;

  @Expose()
  program: string;

  @Expose()
  programId?: number;

  @Expose()
  duration: string;

  @Expose()
  originalDate: string;

  @Expose()
  expiryDate: string;

  @Expose()
  teacher?: {
    id: number;
    title: string;
  };
}

export class TeacherUnscheduledLessonsResponseDto {
  @Expose()
  body: TeacherUnscheduledLessonDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

