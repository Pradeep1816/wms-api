import { Injectable } from '@nestjs/common';
import { Invoice } from '../../entities/invoice.entity';
import { UpdateInvoiceDetailResponseDto } from '../../dto/update-invoice-detail.dto';
import { AdjustTaxResponseDto, AdjustTaxRequestDto } from '../../dto/adjust-tax.dto';
import { formatDate } from '../../../utils/date-utils';
import { formatCurrency } from '../../../utils/formatters';
import { RoundingUtils } from '../../../utils/rounding.utils';

@Injectable()
export class InvoiceDetailsEditTransformationService {

  transformUpdateDateResponse(updatedInvoice: Invoice): UpdateInvoiceDetailResponseDto {
    return {
      body: {
        id: updatedInvoice.id,
        date: updatedInvoice.date ? formatDate(new Date(updatedInvoice.date)) : '',
      },
    } as UpdateInvoiceDetailResponseDto;
  }

  /**
   * Transform updated invoice to adjust tax response DTO
   */
  transformAdjustTaxResponse(updatedInvoice: Invoice): AdjustTaxResponseDto {
    return {
      body: {
        id: updatedInvoice.id,
        tax: formatCurrency(updatedInvoice.tax || 0),
        total: formatCurrency(updatedInvoice.total || 0),
        balance: formatCurrency(updatedInvoice.balance || 0),
      },
    } as AdjustTaxResponseDto;
  }

  /**
   * Format invoice date
   */
  formatInvoiceDate(date: Date | string): string {
    if (typeof date === 'string') {
      return formatDate(new Date(date));
    }
    return formatDate(date);
  }

  /**
   * Format currency value
   */
  formatTaxValue(value: number): string {
    return formatCurrency(value || 0);
  }

  /**
   * Format total value
   */
  formatTotalValue(value: number): string {
    return formatCurrency(value || 0);
  }

  /**
   * Format balance value
   */
  formatBalanceValue(value: number): string {
    return formatCurrency(value || 0);
  }

  /**
   * Calculate new tax value with adjustment
   * Simple addition: newTax = currentTax + adjustment (no rounding — matches legacy)
   */
  private calculateNewTax(currentTax: number, adjustment: number): number {
    return parseFloat(String(currentTax)) + adjustment;
  }

  /**
   * Determine if tax is adjusted
   * Tax is considered adjusted if newTax !== lineItemTax
   */
  private determineTaxAdjusted(newTax: number, lineItemTax: number): boolean {
    return newTax !== lineItemTax;
  }

  /**
   * Apply tax reset protection
   * If not adjusted, revert tax to lineItemTax
   */
  private applyTaxResetProtection(
    newTax: number,
    isTaxAdjusted: boolean,
    lineItemTax: number,
  ): number {
    if (!isTaxAdjusted) {
      return lineItemTax || 0.0;
    }
    return newTax;
  }

  /**
   * Calculate new total
   * Matches Invoice::beforeSave() → total = subTotal + tax
   */
  private calculateNewTotal(subTotal: number, newTax: number): number {
    return parseFloat(String(subTotal)) + newTax;
  }

  /**
   * Calculate new balance
   * Matches Invoice::getInvoiceBalance() (Invoice.php Lines 704-713)
   */
  private calculateNewBalance(newTotal: number, paidAmount: number): number {
    const roundedTotal = RoundingUtils.roundHalfUp(newTotal, 2);
    const roundedPaid = RoundingUtils.roundHalfUp(paidAmount, 2);
    return roundedPaid === roundedTotal ? 0 : roundedTotal - roundedPaid;
  }

  private calculateNewStatus(newTotal: number, paidAmount: number): number {
    const roundedTotal = RoundingUtils.roundHalfUp(newTotal, 2);
    const roundedPaid = RoundingUtils.roundHalfUp(paidAmount, 2);

    if (roundedTotal === roundedPaid) {
      return Invoice.STATUS_PAID;
    } else if (roundedTotal > roundedPaid) {
      return Invoice.STATUS_OWING;
    } else {
      return Invoice.STATUS_CREDIT;
    }
  }

  /**
   * Full tax adjustment calculation pipeline
   * Runs all calculations in sequence and returns updated values
   */
  transformTaxAdjustment(
    invoice: Invoice,
    lineItemTax: number,
    paidAmount: number,
    requestDto: AdjustTaxRequestDto,
  ): {
    newTax: number;
    isTaxAdjusted: boolean;
    newTotal: number;
    newBalance: number;
    newStatus: number;
  } {
    // Step 1: Calculate new tax
    const currentTax = parseFloat(String(invoice.tax)) || 0;
    let newTax = this.calculateNewTax(currentTax, requestDto.taxAdjusted);

    // Step 2: Determine if tax is adjusted
    const isTaxAdjusted = this.determineTaxAdjusted(newTax, lineItemTax);

    // Step 3: Apply tax reset protection
    newTax = this.applyTaxResetProtection(newTax, isTaxAdjusted, lineItemTax);

    // Step 4: Calculate new total
    const subTotal = parseFloat(String(invoice.subTotal)) || 0;
    const newTotal = this.calculateNewTotal(subTotal, newTax);

    // Step 5: Calculate new balance
    const newBalance = this.calculateNewBalance(newTotal, paidAmount);

    // Step 6: Calculate new status
    const newStatus = this.calculateNewStatus(newTotal, paidAmount);

    return {
      newTax,
      isTaxAdjusted,
      newTotal,
      newBalance,
      newStatus,
    };
  }
}

