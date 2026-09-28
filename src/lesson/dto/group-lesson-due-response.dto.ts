import { Expose } from 'class-transformer';

export class GroupLessonDueDto {
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

export class GroupLessonDueDataDto {
  @Expose()
  body: GroupLessonDueDto[];

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

export class GroupLessonDueResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Group lesson dues retrieved successfully';

  @Expose()
  data: GroupLessonDueDataDto;
}
