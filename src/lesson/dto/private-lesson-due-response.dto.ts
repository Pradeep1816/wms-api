import { Expose } from 'class-transformer';

export class PrivateLessonDueDto {
  @Expose()
  id: number;

  @Expose()
  lessonDate: string;

  @Expose()
  studentName: string;

  @Expose()
  programName: string;

  @Expose()
  teacherName: string;

  @Expose()
  amount: string;

  @Expose()
  url: string;
}

export class PrivateLessonDueDataDto {
  @Expose()
  body: PrivateLessonDueDto[];

  @Expose()
  footer: { totalAmount: string }[];

  @Expose()
  pagination: { 
    page: number; 
    limit: number; 
    total: number; 
    totalPages: number;
  };
}

export class PrivateLessonDueResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Private lesson dues retrieved successfully';

  @Expose()
  data: PrivateLessonDueDataDto;
}
