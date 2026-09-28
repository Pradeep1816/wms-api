import { Expose, Type } from 'class-transformer';

export class ReturnedInvoiceInfo {
  @Expose()
  id: number;

  @Expose()
  number: string;
}

export class InvoiceInfo {
  @Expose()
  id: number;

  @Expose()
  number: string;

  @Expose()
  date: string; 

  @Expose()
  status: string;

  @Expose()
  isCanceled: boolean;

  @Expose()
  canRevert: boolean;

  @Expose()
  canAddItem: boolean;

  @Expose()
  canEditTax: boolean;

  @Expose()
  canEditDiscount: boolean;

  @Expose()
  isReversedInvoice: boolean;

  @Expose()
  @Type(() => ReturnedInvoiceInfo)
  returnedInvoice: ReturnedInvoiceInfo | null;
}

export class CustomerInfo {
  @Expose()
  customerId: number;

  @Expose()
  customerName: string;

  @Expose()
  phoneNumber: string | null;

  @Expose()
  email: string | null;

  @Expose()
  type: number;
}

export class InvoiceDetails {
  @Expose()
  @Type(() => InvoiceInfo)
  invoice: InvoiceInfo;

  @Expose()
  @Type(() => CustomerInfo)
  customer: CustomerInfo | null;
}

export class InvoiceDetailsResponse {
  @Expose()
  @Type(() => InvoiceDetails)
  body: InvoiceDetails;
}
