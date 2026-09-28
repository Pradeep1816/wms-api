import { Injectable } from '@nestjs/common';
import { ReceivePaymentInvoiceResponseDto } from '../../dto/receive-payment-invoice-response.dto';
import { formatDate } from '../../../utils/date-utils';
import { plainToInstance } from 'class-transformer';
import { getInvoiceStatus } from '../../../utils/helper';

@Injectable()
export class ReceivePaymentInvoiceTransformationService {
  transformToDto(invoice: any, paymentMap: any = {}): ReceivePaymentInvoiceResponseDto {
    // Format invoice date
    const invoiceDate = invoice.date ? new Date(invoice.date) : null;
    
    // Get payment amount from payment map
    const paymentAmount = parseFloat(paymentMap[invoice.id] || '0.0000');
    const balanceAmount = Number(invoice.balance);
    const totalAmount = Number(invoice.total);
    
    // handling small amounts (0.00-0.09 range)
    const displayBalance = (balanceAmount > 0.00 && balanceAmount <= 0.09) || 
                          (balanceAmount < 0.00 && balanceAmount >= -0.09) ? 0.00 : balanceAmount;

    const dtoData = {
      id: invoice.id,
      number: `I-${invoice.invoiceNumber.toString().padStart(5, '0')}`, // Format as I-43248
      date: invoiceDate ? formatDate(invoiceDate) : '',
      status: getInvoiceStatus(invoice.status, invoice.type, invoice.balance, invoice.isVoid),
      total: totalAmount,
      balance: displayBalance,
      payments: paymentAmount,
    };

    return plainToInstance(ReceivePaymentInvoiceResponseDto, dtoData);
  }

  transformInvoicesToDtos(invoices: any[], paymentMap: any = {}): ReceivePaymentInvoiceResponseDto[] {
    return invoices.map(invoice => this.transformToDto(invoice, paymentMap));
  }
}
