import { Expose } from 'class-transformer';

export class EnrolmentListItemDto {
  @Expose()
  id: number;

  @Expose()
  studentId: number;

  @Expose()
  student: string;

  @Expose()
  program: string;

  @Expose()
  programType: string;

  @Expose()
  teacher: string;

  @Expose()
  startDate: string;

  @Expose()
  endDate: string;

  @Expose()
  autoRenewal: string;

  @Expose()
  lessonsRemaining: number;
}

export class EnrolmentListDataDto {
  @Expose()
  body: EnrolmentListItemDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class EnrolmentListResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Enrolments retrieved successfully';

  @Expose()
  data: EnrolmentListDataDto;
}
