import { Expose, Type } from 'class-transformer';

export class CustomerInvoicePrintItemDto {
  @Expose()
  invoiceNumber: string;

  @Expose()
  date: string;

  @Expose()
  status: string;

  @Expose()
  total: string;

  @Expose()
  studentName: string;
}

export class CustomerInvoicePrintDataDto {
  @Expose()
  @Type(() => CustomerInvoicePrintItemDto)
  body: CustomerInvoicePrintItemDto[];

  @Expose()
  hstRegistrationNo: string;
}
