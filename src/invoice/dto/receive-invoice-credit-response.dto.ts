import { Expose, Transform } from 'class-transformer';
import { formatCurrency } from '../../utils/formatters';

export class ReceiceInvoiceCreditDataDto {
  @Expose()
  id: number;

  @Expose()
  type: string;

  @Expose()
  reference: string;

  @Expose()
  @Transform(({ value }) => formatCurrency(value))
  amount: number;

  @Expose()
  @Transform(({ value }) => formatCurrency(value))
  payment: number;
}

export class ReceiceInvoiceCreditsResponseDto {
  @Expose()
  body: ReceiceInvoiceCreditDataDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

