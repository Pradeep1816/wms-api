import { Expose } from 'class-transformer';

export class CustomerListNewItemDto {
  @Expose()
  id: number;

  @Expose()
  firstName: string;

  @Expose()
  lastName: string;

  @Expose()
  fullName: string;
}

export class CustomerListNewPaginationDto {
  @Expose()
  page: number;

  @Expose()
  limit: number;

  @Expose()
  total: number;

  @Expose()
  totalPages: number;
}

export class CustomerListNewDataDto {
  @Expose()
  body: CustomerListNewItemDto[];

  @Expose()
  pagination: CustomerListNewPaginationDto;
}

export class CustomerListNewResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Customers list retrieved successfully';

  @Expose()
  data: CustomerListNewDataDto;
}
