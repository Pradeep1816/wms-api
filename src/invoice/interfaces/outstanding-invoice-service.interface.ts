import { OutstandingInvoiceRequestDto } from '../dto/outstanding-invoice-request.dto';
import { OutstandingInvoicesDataDto } from '../dto/outstanding-invoice-response.dto';

export interface IOutstandingInvoiceQueryService {
  getOutstandingInvoicesByCustomerId(
    locationSlug: string,
    customerId: number,
    query: OutstandingInvoiceRequestDto,
  ): Promise<OutstandingInvoicesDataDto>;
}

export interface IOutstandingInvoiceTransformationService {
  transformToDto(invoice: any, paymentMap: any, locationSlug: string): any;
  transformInvoicesToDtos(invoices: any[], paymentMap: any, locationSlug: string): any[];
}

export interface IOutstandingInvoiceCalculationService {
  calculateInvoiceAmount(invoice: any): number;
  calculateTotalAmount(invoices: any[]): number;
  calculatePagination(total: number, page: number, limit: number): {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
