import { Expose } from 'class-transformer';

export class ProFormaInvoiceDto {
  @Expose()
  id: number;

  @Expose()
  studentName: string;

  @Expose()
  date: string;

  @Expose()
  status: string;

  @Expose()
  paymentFrequency: string;

  @Expose()
  total: number;
}

export class ProFormaInvoicesDataDto {
  @Expose()
  body: ProFormaInvoiceDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class ProFormaInvoicesResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Pro-forma invoices retrieved successfully';

  @Expose()
  data: ProFormaInvoicesDataDto;
}
