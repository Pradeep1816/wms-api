import { Expose, Transform } from 'class-transformer';
import { formatCurrency } from '../../utils/formatters';

export class ReceivePaymentInvoiceResponseDto {
  @Expose()
  id: number;

  @Expose()
  number: string;

  @Expose()
  date: string;

  @Expose()
  status: string;

  @Expose()
  @Transform(({ value }) => formatCurrency(value))
  total: number;

  @Expose()
  @Transform(({ value }) => formatCurrency(value))
  balance: number;
  
  @Expose()
  @Transform(({ value }) => formatCurrency(value))
  payments: number;
}

export class ReceivePaymentInvoiceDataDto {
  @Expose()
  body: ReceivePaymentInvoiceResponseDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
