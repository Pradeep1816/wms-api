import { Expose, Transform } from 'class-transformer';
import { formatCurrency } from '../../utils/formatters';

export class OutstandingInvoiceDto {
  @Expose()
  id: string;

  @Expose()
  date: string; 

  @Expose()
  @Transform(({ value }) => formatCurrency(value))
  amount: number;

  @Expose()
  @Transform(({ value }) => formatCurrency(value))
  payments: number;

  @Expose()
  @Transform(({ value }) => formatCurrency(value))
  balanceDue: number;

  @Expose()
  url: string;
}

export class OutstandingInvoicesDataDto {
  @Expose()
  body: OutstandingInvoiceDto[];

  @Expose()
  footer: Array<{ totalAmount: string }>;

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class OutstandingInvoicesResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Outstanding invoices retrieved successfully';

  @Expose()
  data: OutstandingInvoicesDataDto;
}
