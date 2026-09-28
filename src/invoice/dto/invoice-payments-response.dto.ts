import { Expose, Type } from 'class-transformer';

export class InvoicePaymentInfo {
  @Expose()
  id: number;

  @Expose()
  date: string;

  @Expose()
  type: string;

  @Expose()
  ref: string;

  @Expose()
  notes: string;

  @Expose()
  amount: string;
}

export class InvoicePaymentsResponse {
  @Expose()
  @Type(() => InvoicePaymentInfo)
  body: InvoicePaymentInfo[];
}
