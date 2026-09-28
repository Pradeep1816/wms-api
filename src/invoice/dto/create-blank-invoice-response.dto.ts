import { Expose } from 'class-transformer';

export class CreateBlankInvoiceResponseDto {
  @Expose()
  id: number;

  @Expose()
  invoiceNumber: string;

  @Expose()
  date: string;

  @Expose()
  status: number;

  @Expose()
  type: number;

  @Expose()
  total: string;

  @Expose()
  balance: string;

  @Expose()
  userId: number;

  @Expose()
  locationId: number;
}
