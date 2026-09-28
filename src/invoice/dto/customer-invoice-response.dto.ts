import { Expose } from 'class-transformer';

export class CustomerInvoiceDto {

  @Expose()
  invoiceId: number;

  @Expose()
  id: number;

  @Expose()
  date: string;

  @Expose()
  status: string;

  @Expose()
  total: number;

  @Expose()
  balance: number;

  @Expose()
  studentName: string;

  @Expose()
  url: string;
}

export class CustomerInvoicesDataDto {
  @Expose()
  body: CustomerInvoiceDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
