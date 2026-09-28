import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Invoice } from '../../entities/invoice.entity';
import { InvoiceLineItem } from '../../entities/invoice-line-item.entity';
import { InvoiceType } from '../../enums/invoice-type.enum';
import { formatDate } from '../../../utils/date-utils';
import { formatCurrency } from '../../../utils/formatters';
import { RoundingUtils } from '../../../utils/rounding.utils';
import { getInvoiceStatus } from '../../../utils/helper';
import {
  InvoicePrintInvoiceDto,
  InvoicePrintCustomerDto,
  InvoicePrintLocationDto,
  InvoicePrintLineItemDto,
  InvoicePrintPaymentDto,
  InvoicePrintTotalsDto,
  InvoicePrintResponseDto,
} from '../../dto/invoice-print-response.dto';

/**
 * Transformation service for invoice print data
 * Handles conversion of raw entities to print-ready DTOs
 */
@Injectable()
export class InvoicePrintTransformationService {
  /**
   * Transform all invoice print data to response DTO
   * 
   * @param invoice - Invoice entity
   * @param locationData - Raw location data from repository
   * @param customerData - Raw customer data from repository (null if walk-in)
   * @param lineItems - Invoice line item entities
   * @param payments - Raw payment data from repository
   * @param totals - Calculated totals object
   * @param reminderNotes - Reminder notes text
   * @returns Complete print response DTO
   */
  transformToResponse(
    invoice: Invoice,
    locationData: any,
    customerData: any | null,
    lineItems: InvoiceLineItem[],
    payments: any[],
    totals: { discount: number; paid: number },
    reminderNotes: string,
  ): InvoicePrintResponseDto {
    const invoiceNumber = this.formatInvoiceNumber(
      invoice.invoiceNumber,
      invoice.type,
    );

    const responseData = {
      invoice: this.transformInvoice(invoice, invoiceNumber, reminderNotes),
      customer: customerData ? this.transformCustomer(customerData) : null,
      location: this.transformLocation(locationData),
      lineItems: this.transformLineItems(lineItems),
      payments: this.transformPayments(payments),
      totals: this.transformTotals(invoice, totals.discount, totals.paid),
    };

    return plainToInstance(InvoicePrintResponseDto, responseData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform invoice entity to print DTO
   */
  private transformInvoice(
    invoice: Invoice,
    invoiceNumber: string,
    reminderNotes: string,
  ): InvoicePrintInvoiceDto {
    const dtoData = {
      id: invoice.id,
      number: invoiceNumber,
      date: invoice.date ? formatDate(new Date(invoice.date)) : '',
      dueDate: invoice.dueDate
        ? formatDate(new Date(invoice.dueDate))
        : undefined,
      status: getInvoiceStatus(
        invoice.status,
        invoice.type,
        Number(invoice.balance),
        Boolean(invoice.isVoid),
      ),
      type:
        invoice.type === InvoiceType.PRO_FORMA_INVOICE
          ? 'Pro-Forma'
          : 'Invoice',
      notes: invoice.notes || '',
      reminderNotes: reminderNotes,
    };

    return plainToInstance(InvoicePrintInvoiceDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform location raw data to DTO
   */
  private transformLocation(locationData: any): InvoicePrintLocationDto {
    const dtoData = {
      name: locationData?.name || '',
      address: locationData?.address || '',
      city: locationData?.city || '',
      province: locationData?.province || '',
      postalCode: locationData?.postalCode || '',
      phone: locationData?.phone || '',
      email: locationData?.email || '',
      hstRegistrationNo: locationData?.hstRegistrationNo || '',
    };

    return plainToInstance(InvoicePrintLocationDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform customer raw data to DTO
   */
  private transformCustomer(customerData: any): InvoicePrintCustomerDto {
    const dtoData = {
      id: customerData.id,
      name: customerData.name || '',
      address: customerData.address || '',
      city: customerData.city || '',
      province: customerData.province || '',
      postalCode: customerData.postalCode || '',
      phone: customerData.phone || '',
      email: customerData.email || '',
    };

    return plainToInstance(InvoicePrintCustomerDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform line items to DTOs
   */
  private transformLineItems(
    lineItems: InvoiceLineItem[],
  ): InvoicePrintLineItemDto[] {
    return lineItems.map((li) => {
      const dtoData = {
        id: li.id,
        code: li.code || li.item?.code || '',
        description: li.description || li.item?.description || '',
        qty: li.unit || 1,
        price: formatCurrency(Number(li.netTotal) || 0),
        unitPrice: li.amount ? formatCurrency(Number(li.amount)) : undefined,
        tax: li.taxRate ? formatCurrency(Number(li.taxRate)) : undefined,
        discount: undefined, // Calculated separately from discounts array
      };

      return plainToInstance(InvoicePrintLineItemDto, dtoData, {
        excludeExtraneousValues: true,
      });
    });
  }

  /**
   * Transform payments to DTOs
   */
  private transformPayments(payments: any[]): InvoicePrintPaymentDto[] {
    return payments.map((payment) => {
      const dtoData = {
        date: payment.date ? formatDate(new Date(payment.date)) : '',
        type: payment.type || '',
        reference: payment.reference || '',
        notes: payment.notes || '',
        amount: formatCurrency(Number(payment.amount) || 0),
      };

      return plainToInstance(InvoicePrintPaymentDto, dtoData, {
        excludeExtraneousValues: true,
      });
    });
  }

  /**
   * Transform totals to DTO with balance tolerance
   */
  private transformTotals(
    invoice: Invoice,
    totalDiscount: number,
    paid: number,
  ): InvoicePrintTotalsDto {
    const balance = this.calculateBalance(invoice.total, paid);
    const adjustedBalance = this.applyBalanceTolerance(balance);

    const dtoData = {
      discount: formatCurrency(totalDiscount),
      subTotal: formatCurrency(Number(invoice.subTotal) || 0),
      tax: formatCurrency(Number(invoice.tax) || 0),
      total: formatCurrency(Number(invoice.total) || 0),
      paid: formatCurrency(paid),
      balance: formatCurrency(adjustedBalance),
    };

    return plainToInstance(InvoicePrintTotalsDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Format invoice number with prefix (I-XXXXX or P-XXXXX)
   */
  private formatInvoiceNumber(invoiceNumber: number, type: number): string {
    const paddedNumber = String(invoiceNumber).padStart(5, '0');
    const prefix = type === InvoiceType.INVOICE ? 'I' : 'P';
    return `${prefix}-${paddedNumber}`;
  }

  /**
   * Calculate balance based on total and paid
   */
  private calculateBalance(total: number, paid: number): number {
    const roundedTotal = RoundingUtils.roundHalfUp(total || 0, 2);
    const roundedPaid = RoundingUtils.roundHalfUp(paid, 2);

    if (roundedPaid === roundedTotal) {
      return 0;
    }

    return roundedTotal - roundedPaid;
  }

  /**
   * Apply balance tolerance
   * If balance is between -0.09 and +0.09, treat as 0.00
   */
  private applyBalanceTolerance(balance: number): number {
    const rounded = RoundingUtils.roundHalfUp(balance, 2);

    if (rounded > -0.09 && rounded < 0.09) {
      return 0.0;
    }

    return rounded;
  }

}
