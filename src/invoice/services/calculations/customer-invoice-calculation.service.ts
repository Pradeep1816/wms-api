import { Injectable } from '@nestjs/common';
import { ICustomerInvoiceCalculationService } from '../../interfaces/customer-invoice-service.interface';

@Injectable()
export class CustomerInvoiceCalculationService implements ICustomerInvoiceCalculationService {
  calculateInvoiceAmount(invoice: any): number {
    return parseFloat(invoice.total?.toString() || '0');
  }

  calculateTotalAmount(invoices: any[]): number {
    return invoices.reduce((total, invoice) => {
      return total + this.calculateInvoiceAmount(invoice);
    }, 0);
  }

  calculatePagination(total: number, page: number, limit: number): {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  } {
    const totalPages = Math.ceil(total / limit);
    return {
      page,
      limit,
      total,
      totalPages,
    };
  }
}
