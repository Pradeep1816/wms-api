import { Injectable } from '@nestjs/common';
import { IRecurringPaymentCalculationService } from '../interfaces/customer-recurring-payment-service.interface';
import { calculateNextPaymentDate } from '../../utils/date-utils';

@Injectable()
export class CustomerRecurringPaymentCalculationService implements IRecurringPaymentCalculationService {
  /**
   * Calculate next payment date
   */
  calculateNextPaymentDate(paymentDay: number, nextEntryDay: Date): string {
    return calculateNextPaymentDate(paymentDay, nextEntryDay);
  }

  /**
   * Calculate pagination metadata
   */
  calculatePagination(total: number, page: number, limit: number): {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  } {
    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }
}
