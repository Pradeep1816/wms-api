import { Expose } from 'class-transformer';

export class CustomerStudentDto {
  @Expose()
  id: number;

  @Expose()
  fullName: string;

  @Expose()
  birthDate: string;

  @Expose()
  customerName: string;
}

export class CustomerStudentsDataDto {
  @Expose()
  body: CustomerStudentDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class CustomerStudentsResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Customer students retrieved successfully';

  @Expose()
  data: CustomerStudentsDataDto;
}
