import { Expose } from 'class-transformer';

export class CourseStudentItemDto {
  @Expose()
  id: number;

  @Expose()
  studentId: number;

  @Expose()
  customerId: number;

  @Expose()
  studentName: string;

  @Expose()
  customerName: string;

  @Expose()
  discount: string;
}

export class CourseStudentDataDto {
  @Expose()
  body: CourseStudentItemDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class CourseStudentResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Course students retrieved successfully';

  @Expose()
  data: CourseStudentDataDto;
}
