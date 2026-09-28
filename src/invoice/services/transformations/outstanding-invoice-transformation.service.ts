import { Injectable } from '@nestjs/common';
import { IOutstandingInvoiceTransformationService } from '../../interfaces/outstanding-invoice-service.interface';
import { OutstandingInvoiceDto } from '../../dto/outstanding-invoice-response.dto';
import { formatDate } from '../../../utils/date-utils';
import { plainToClass } from 'class-transformer';

@Injectable()
export class OutstandingInvoiceTransformationService implements IOutstandingInvoiceTransformationService {
  transformToDto(invoice: any, paymentMap: any = {}, locationSlug: string): OutstandingInvoiceDto {
    // Format invoice date
    const invoiceDate = invoice.date ? new Date(invoice.date) : null;
    
    // Get payment amount from payment map
    const paymentAmount = parseFloat(paymentMap[invoice.id] || '0.0000');
    const balanceAmount = Number(invoice.balance);
    
    // handling small amounts (0.00-0.09 range)
    const displayPayment = (paymentAmount > 0.00 && paymentAmount <= 0.09) || 
                         (paymentAmount < 0.00 && paymentAmount >= -0.09) ? 0.00 : paymentAmount;
    const displayBalance = (balanceAmount > 0.00 && balanceAmount <= 0.09) || 
                          (balanceAmount < 0.00 && balanceAmount >= -0.09) ? 0.00 : balanceAmount;

    const dtoData = {
      id: `I-${invoice.invoiceNumber.toString().padStart(5, '0')}`, // Format as I-43248
      date: invoiceDate ? formatDate(invoiceDate) : '',
      amount: Number(invoice.total),
      payments: displayPayment,
      balanceDue: displayBalance,
      url: `admin/${locationSlug}/invoices/${invoice.id}`,
    };

    return plainToClass(OutstandingInvoiceDto, dtoData);
  }

  transformInvoicesToDtos(invoices: any[], paymentMap: any = {}, locationSlug: string): OutstandingInvoiceDto[] {
    return invoices.map(invoice => this.transformToDto(invoice, paymentMap, locationSlug));
  }
}
