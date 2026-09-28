import { Injectable } from '@nestjs/common';
import { DiscountReportRowDto } from '../../dto/discount-dto/discount-report-row.dto';
import { formatCurrency } from '../../../utils/formatters';

@Injectable()
export class DiscountsReportTransformationService {
  /**
   * Formats a value based on its type (percent, currency, or number)
   * Returns empty string for 0 or missing values
   */


  formatValue(value: number | null | undefined, type: 'percent' | 'currency' | 'number'): string {
    const numValue = typeof value === 'number' ? value : parseFloat(value || '0');
    if (isNaN(numValue) || numValue === 0) {
      return '';
    }
    if (type === 'percent') {
      return numValue.toString();
    }
    if (type === 'currency') {
      return formatCurrency(numValue);
    }
    return formatCurrency(numValue);
  }

  /**
   * Transforms raw database rows into discount report data format
   * Handles customer name formatting, description truncation, and value formatting
   */
  transformRowsToReportData(rows: any[]): DiscountReportRowDto[] {
    return rows.map((r: any) => {
      const studentCount = parseInt(r.studentCount || '0', 10);
      const customerNameBase = r.customerNameBase || '';
      const customerName = studentCount > 0
        ? `${customerNameBase} (has ${studentCount} ${studentCount === 1 ? 'student' : 'students'} enrolled)`
        : customerNameBase;
      
      const description = r.description || '';
      const truncatedDescription = description.length > 35 
        ? description.substring(0, 35) + ' ...'
        : description;
      
      return {
        id: Number(r.id),
        invoiceId: Number(r.invoiceId),
        customerId: Number(r.customerId),
        customer: customerName,
        code: r.code || '',
        description: truncatedDescription,
        pf: r.paymentFrequency || '',
        qty: Number(r.qty || 0),
        pfPercent: this.formatValue(r.pfPercent, 'percent'),
        enrolDollar: r.enrolDollar ? formatCurrency(parseFloat(r.enrolDollar)) : '',
        customerPercent: this.formatValue(r.customerPercent, 'percent'),
        itemDollar: r.itemDollar ? formatCurrency(parseFloat(r.itemDollar)) : '',
        netDollar: r.netDiscount ? formatCurrency(parseFloat(r.netDiscount)) : '',
        price: r.price ? formatCurrency(parseFloat(r.price)) : '',
      };
    });
  }
}


