import { Expose } from 'class-transformer';

/**
 * DTO for individual invoice item in list
 * Columns: Number, Date, Customer, Student, Phone, Status, Total
 */
export class InvoiceListItemDto {
  @Expose()
  id: number;

  @Expose()
  number: string; // I-{invoice_number} padded to 5 digits

  @Expose()
  date: string;

  @Expose()
  customer: string;

  @Expose()
  student: string;

  @Expose()
  phone: string;

  @Expose()
  status: string;

  @Expose()
  total: string;
}

/**
 * DTO for invoice list data with pagination
 */
export class InvoiceListDataDto {
  @Expose()
  body: InvoiceListItemDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Full response DTO for invoice list API
 */
export class InvoiceListResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Invoices retrieved successfully';

  @Expose()
  data: InvoiceListDataDto;
}
