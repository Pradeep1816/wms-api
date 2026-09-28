import { Expose, Type } from 'class-transformer';

export class InvoicePrintLineItemDto {
  @Expose()
  id: number;

  @Expose()
  code: string;

  @Expose()
  description: string;

  @Expose()
  qty: number;

  @Expose()
  price: string;

  @Expose()
  unitPrice?: string;

  @Expose()
  tax?: string;

  @Expose()
  discount?: string;
}

export class InvoicePrintPaymentDto {
  @Expose()
  date: string;

  @Expose()
  type: string;

  @Expose()
  reference: string;

  @Expose()
  notes: string;

  @Expose()
  amount: string;
}

export class InvoicePrintLocationDto {
  @Expose()
  name: string;

  @Expose()
  address: string;

  @Expose()
  city: string;

  @Expose()
  province: string;

  @Expose()
  postalCode: string;

  @Expose()
  phone: string;

  @Expose()
  email: string;

  @Expose()
  hstRegistrationNo: string;
}

export class InvoicePrintCustomerDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  address: string;

  @Expose()
  city: string;

  @Expose()
  province: string;

  @Expose()
  postalCode: string;

  @Expose()
  phone: string;

  @Expose()
  email: string;
}

export class InvoicePrintInvoiceDto {
  @Expose()
  id: number;

  @Expose()
  number: string;

  @Expose()
  date: string;

  @Expose()
  dueDate?: string;

  @Expose()
  status: string;

  @Expose()
  type: string;

  @Expose()
  notes: string;

  @Expose()
  reminderNotes: string;
}

export class InvoicePrintTotalsDto {
  @Expose()
  discount: string;

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

export class InvoicePrintResponseDto {
  @Expose()
  @Type(() => InvoicePrintInvoiceDto)
  invoice: InvoicePrintInvoiceDto;

  @Expose()
  @Type(() => InvoicePrintCustomerDto)
  customer: InvoicePrintCustomerDto | null;

  @Expose()
  @Type(() => InvoicePrintLocationDto)
  location: InvoicePrintLocationDto;

  @Expose()
  @Type(() => InvoicePrintLineItemDto)
  lineItems: InvoicePrintLineItemDto[];

  @Expose()
  @Type(() => InvoicePrintPaymentDto)
  payments: InvoicePrintPaymentDto[];

  @Expose()
  @Type(() => InvoicePrintTotalsDto)
  totals: InvoicePrintTotalsDto;
}

export class InvoicePrintResponse {
  @Expose()
  @Type(() => InvoicePrintResponseDto)
  body: InvoicePrintResponseDto;
}
