import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { InvoicePayment } from '../../entities/invoice-payment.entity';
import { Invoice } from '../../entities/invoice.entity';
import {
  InvoicePaymentsResponse,
  InvoicePaymentInfo,
} from '../../dto/invoice-payments-response.dto';
import { DeletePaymentResponseDto } from '../../dto/delete-payment-response.dto';
import { formatCurrency } from '../../../utils/formatters';
import { formatDate } from '../../../utils/date-utils';
import { RoundingUtils } from '../../../utils/rounding.utils';

@Injectable()
export class InvoicePaymentsTransformationService {
  /**
   * Transform invoice payments to response DTO
   */
  transformToResponse(
    invoicePayments: InvoicePayment[],
  ): InvoicePaymentsResponse {
    const payments = invoicePayments.map((ip) => this.transformPayment(ip));

    const responseData = {
        body: payments,
    };

    return plainToInstance(InvoicePaymentsResponse, responseData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform single invoice payment to DTO
   */
  private transformPayment(invoicePayment: InvoicePayment): InvoicePaymentInfo {
    const payment = invoicePayment.payment;

    const dtoData = {
      id: payment?.id || invoicePayment.paymentId,
      date: payment?.date ? formatDate(new Date(payment.date)) : '',
      type: payment?.paymentMethod?.name || '',
      ref: payment?.reference || '',
      notes: payment?.notes || '',
      amount: formatCurrency(Number(invoicePayment.amount) || 0),
    };

    return plainToInstance(InvoicePaymentInfo, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  // ─── DELETE PAYMENT TRANSFORMS ────────────────────────────────────

  /**
   * Calculate invoice totals after a payment is deleted.
   * Mirrors legacy Invoice::beforeSave() recalculation.
   *
   *   subTotal = SUM of remaining line items' netTotal
   *   tax = SUM of line items' tax_rate (unless isTaxAdjusted)
   *   total = subTotal + tax
   *   status = computed from total vs paymentTotal
   *   balance = total - paymentTotal
   */
  calculateInvoiceTotals(
    invoice: Invoice,
    netSubtotal: number,
    lineItemTaxSum: number,
    paymentTotal: number,
    appliedTotal: number,
    creditUsedTotal: number,
  ): {
    subTotal: number;
    tax: number;
    total: number;
    balance: number;
    status: number;
  } {
    const tax = invoice.isTaxAdjusted
      ? (invoice.tax ? Number(invoice.tax) : 0)
      : lineItemTaxSum;

    const total = netSubtotal + tax;

    let balance: number;
    const roundedTotal = RoundingUtils.roundHalfUp(total);
    const roundedPaymentTotal = RoundingUtils.roundHalfUp(paymentTotal);

    if (invoice.type === Invoice.TYPE_INVOICE) {
      balance = roundedTotal - (roundedPaymentTotal === roundedTotal ? roundedTotal : roundedPaymentTotal);
    } else {
      const roundedApplied = RoundingUtils.roundHalfUp(appliedTotal);
      const roundedCreditUsed = RoundingUtils.roundHalfUp(creditUsedTotal);
      balance = -roundedApplied - roundedCreditUsed;
    }

    let status: number;
    if (invoice.type === Invoice.TYPE_INVOICE) {
      if (roundedTotal === roundedPaymentTotal) {
        status = Invoice.STATUS_PAID;
      } else if (roundedTotal > roundedPaymentTotal) {
        status = Invoice.STATUS_OWING;
      } else {
        status = Invoice.STATUS_CREDIT;
      }
    } else {
      const roundedApplied = RoundingUtils.roundHalfUp(appliedTotal);
      status = roundedApplied >= roundedTotal
        ? Invoice.STATUS_PAID
        : Invoice.STATUS_OWING;
    }

    return { subTotal: netSubtotal, tax, total, balance, status };
  }

  /**
   * Calculate customer account balance.
   * Formula: balance = lessonsDue + invoiceOwing - totalCredits
   */
  calculateCustomerBalance(
    lessonsDue: number,
    invoiceOwingTotal: number,
    invoiceCredits: number,
    rentalInvoiceCredits: number,
    paymentCredits: number,
  ): number {
    const totalCredits = invoiceCredits + paymentCredits + rentalInvoiceCredits;
    const balance = lessonsDue + invoiceOwingTotal - totalCredits;
    return RoundingUtils.roundHalfUp(balance);
  }

  /**
   * Transform into the delete payment response DTO.
   */
  transformDeletePaymentResponse(paymentId: number): DeletePaymentResponseDto {
    return plainToInstance(DeletePaymentResponseDto, { id: paymentId }, {
      excludeExtraneousValues: true,
    });
  }
}
