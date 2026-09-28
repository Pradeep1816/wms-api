import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Invoice } from '../../entities/invoice.entity';
import { InvoiceTotalsDto } from '../../dto/invoice-totals-response.dto';
import { RoundingUtils } from '../../../utils/rounding.utils';
import { formatCurrency } from '../../../utils/formatters';

/**
 * Transformation service for invoice totals
 * Formats totals data for API response
 */
@Injectable()
export class InvoiceTotalsTransformationService {
  /**
   * Transform invoice totals to DTO
   * @param invoice - Invoice entity
   * @param discounts - Calculated total discounts
   * @param paid - Calculated paid amount
   * @returns InvoiceTotalsDto
   */
  transformToDto(
    invoice: Invoice,
    discounts: number,
    paid: number,
  ): InvoiceTotalsDto {
    // Calculate balance
    const balance = this.calculateBalance(invoice, paid);

    // Apply balance tolerance
    const adjustedBalance = this.applyBalanceTolerance(balance);

    const dtoData = {
      discounts: formatCurrency(discounts),
      subTotal: formatCurrency(invoice.subTotal || 0),
      tax: formatCurrency(invoice.tax || 0),
      total: formatCurrency(invoice.total || 0),
      paid: formatCurrency(paid),
      balance: formatCurrency(adjustedBalance),
    };

    return plainToInstance(InvoiceTotalsDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Calculate balance based on invoice type
   * @param invoice - Invoice entity
   * @param paid - Paid amount
   * @returns Balance
   */
  private calculateBalance(invoice: Invoice, paid: number): number {
    const total = invoice.total || 0;
    
    // For regular invoices: balance = total - paid
    // Future note: if pro-forma / non-regular invoices are needed later,
    // add the legacy balance branch here instead of changing the regular path.
    // With rounding guard to prevent floating-point residuals
    const roundedTotal = RoundingUtils.roundHalfUp(total, 2);
    const roundedPaid = RoundingUtils.roundHalfUp(paid, 2);
    
    if (roundedPaid === roundedTotal) {
      return 0;
    }
    
    return roundedTotal - roundedPaid;
  }

  /**
   * Apply balance tolerance
   * If balance is between -0.09 and +0.09, treat as 0.00
   * This prevents showing tiny rounding residuals
   * 
   * @param balance - Balance amount
   * @returns Adjusted balance
   */
  applyBalanceTolerance(balance: number): number {
    const rounded = RoundingUtils.roundHalfUp(balance, 2);
    
    if (rounded > -0.09 && rounded < 0.09) {
      return 0.0;
    }
    
    return rounded;
  }
}
