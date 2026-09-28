import { Expose } from 'class-transformer';

export class CustomerEnrolmentDto {
  @Expose()
  id: number;

  @Expose()
  studentName: string;

  @Expose()
  programName: string;

  @Expose()
  teacherName: string;

  @Expose()
  day: string;

  @Expose()
  fromTime: string;

  @Expose()
  duration: string;

  @Expose()
  startDate: string;

  @Expose()
  renewalDate: string;
}

export class CustomerEnrolmentsDataDto {
  @Expose()
  body: CustomerEnrolmentDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class CustomerEnrolmentsResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Customer enrolments retrieved successfully';

  @Expose()
  data: CustomerEnrolmentsDataDto;
}
