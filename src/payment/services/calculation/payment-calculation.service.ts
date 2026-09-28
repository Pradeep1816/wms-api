import { Injectable } from '@nestjs/common';
import { RoundingUtils } from '../../../utils/rounding.utils';

@Injectable()
export class PaymentCalculationService {
  /**
   * Calculate used amount from payment amount and balance
   */
  calculateUsedAmount(amount: number, balance: number): number {
    return RoundingUtils.calculateBalance(amount, balance, 2);
  }

  /**
   * Calculate total amount from payments
   */
  calculateTotalAmount(payments: any[]): number {
    return payments.reduce((total, payment) => {
      return total + Number(payment.amount);
    }, 0);
  }

  /**
   * Calculate pagination details
   */
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

  /**
   * Apply pagination to payments array
   */
  applyPagination(payments: any[], page: number, limit: number): any[] {
    const offset = (page - 1) * limit;
    return payments.slice(offset, offset + limit);
  }

  /**
   * Calculate total remaining amount from payment DTOs
   */
  calculateTotalRemaining(paymentDtos: any[]): number {
    return paymentDtos.reduce((total, payment) => {
      return total + Number(payment.remaining || 0);
    }, 0);
  }
}
