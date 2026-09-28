import { CustomerInvoiceRequestDto } from '../dto/customer-invoice-request.dto';
import { CustomerInvoicesDataDto } from '../dto/customer-invoice-response.dto';

export interface ICustomerInvoiceQueryService {
  getInvoicesByCustomerId(
    locationSlug: string,
    customerId: number,
    query: CustomerInvoiceRequestDto,
  ): Promise<CustomerInvoicesDataDto>;
}

export interface ICustomerInvoiceTransformationService {
  transformToDto(invoice: any, locationSlug: string): any;
  transformInvoicesToDtos(invoices: any[], locationSlug: string): any[];
}

export interface ICustomerInvoiceCalculationService {
  calculateInvoiceAmount(invoice: any): number;
  calculateTotalAmount(invoices: any[]): number;
  calculatePagination(total: number, page: number, limit: number): {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
