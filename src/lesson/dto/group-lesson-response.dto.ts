import { Expose } from 'class-transformer';

export class GroupLessonDto {
  @Expose()
  dueDate: string;

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

export class GroupLessonsDataDto {
  @Expose()
  body: GroupLessonDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class GroupLessonsResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Group lessons retrieved successfully';

  @Expose()
  data: GroupLessonsDataDto;
}
