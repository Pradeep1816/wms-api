import { Expose } from 'class-transformer';

/**
 * DTO for invoice totals data
 * Represents the financial summary of an invoice
 */
export class InvoiceTotalsDto {
  @Expose()
  discounts: string;

  @Expose()
  subTotal: string;

  @Expose()
  tax: string;

  @Expose()
  total: string;

  @Expose()
  paid: string;

  @Expose()
  balance: string;
}
