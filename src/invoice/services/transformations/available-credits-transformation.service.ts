import { Injectable } from '@nestjs/common';
import { AvailableCreditItemDto } from '../../dto/available-credits-response.dto';
import { formatCurrency } from '../../../utils/formatters';
import { RoundingUtils } from '../../../utils/rounding.utils';

@Injectable()
export class AvailableCreditsTransformationService {
  /**
   * Transform raw credit data from repository to DTOs
   * Combines invoice credits and payment credits, filters, and formats
   */
  transformCreditsToDtos(
    invoiceCredits: any[] = [],
    paymentCredits: any[] = [],
  ): { credits: AvailableCreditItemDto[]; totalCredits: number } {
    const credits: AvailableCreditItemDto[] = [];
    let totalCredits = 0;
  
    // Invoice credits (negative balances => positive credit amounts)
    for (const inv of invoiceCredits) {
      const rawAmount = Math.abs(Number(inv?.balance ?? 0));
      if (rawAmount > 0.09) {
        const amountRounded = RoundingUtils.roundDecimal(rawAmount, 2);
        totalCredits += amountRounded;
  
        credits.push({
          id: Number(inv?.id),
          date: inv?.date ?? '',
          amount: formatCurrency(amountRounded),
          reference:
            inv?.invoiceNumber != null
              ? `I-${String(inv.invoiceNumber).padStart(5, '0')}`
              : inv?.reference ?? '',
          type: 'Invoice Credit',
        } as any);
      }
    }
  
    // Payment credits (positive balances)
    for (const p of paymentCredits) {
      const balance = Number(p?.balance ?? 0);
      if (balance > 0.09) {
        const amountRounded = RoundingUtils.roundDecimal(balance, 2);
        totalCredits += amountRounded;
  
        credits.push({
          id: Number(p?.id),
          date: p?.date ?? '',
          amount: formatCurrency(amountRounded),
          reference: p?.reference ?? '',
          type: 'Payment Credit',
        } as any);
      }
    }
  
    credits.sort((a, b) => Number(a.id) - Number(b.id));
  
    // Keep total numeric; round to cents
    const total = RoundingUtils.roundDecimal(totalCredits, 2);
    return { credits, totalCredits: total };
  }
}

