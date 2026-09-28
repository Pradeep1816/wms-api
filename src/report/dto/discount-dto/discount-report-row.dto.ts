import { Expose } from 'class-transformer';

export class DiscountReportRowDto {
  @Expose()
  id: number;

  @Expose()
  invoiceId: number;

  @Expose()
  customerId: number;

  @Expose()
  customer: string;

  @Expose()
  code: string;

  @Expose()
  description: string;

  @Expose()
  pf: string;

  @Expose()
  qty: number;

  @Expose()
  pfPercent: string;

  @Expose()
  enrolDollar: string;

  @Expose()
  customerPercent: string;

  @Expose()
  itemDollar: string;

  @Expose()
  netDollar: string;

  @Expose()
  price: string;
}

