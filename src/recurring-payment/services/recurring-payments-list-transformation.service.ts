import { Injectable } from '@nestjs/common';
import { RecurringPaymentListItemDto } from '../dto/recurring-payments-list-response.dto';
import { CustomerRecurringPayment } from '../entities/customer-recurring-payment.entity';
import { formatDate } from '../../utils/date-utils';
import { calculateNextPaymentDate } from '../../utils/date-utils';
import { formatCurrency } from '../../utils/formatters';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class RecurringPaymentsListTransformationService {
  /**
   * Transform a single CustomerRecurringPayment entity to DTO format
   * @param recurringPayment - CustomerRecurringPayment entity with relations
   * @returns RecurringPaymentListItemDto
   */
  transformRecurringPaymentListItem(
    recurringPayment: CustomerRecurringPayment,
    hasEnrolmentWarning = false,
  ): RecurringPaymentListItemDto {
    let customerName: string | undefined = undefined;
    if (recurringPayment.customer?.profile) {
      const firstName = recurringPayment.customer.profile.firstname || '';
      const lastName = recurringPayment.customer.profile.lastname || '';
      customerName = `${firstName} ${lastName}`.trim() || undefined;
    }
    if (!customerName && recurringPayment.customer?.username) {
      customerName = recurringPayment.customer.username;
    }

    // Format next entry date (using nextEntryDay)
    const nextEntryDate = recurringPayment.nextEntryDay
      ? formatDate(new Date(recurringPayment.nextEntryDay))
      : '';

    // Calculate next payment date using the utility function
    const nextPaymentDate = recurringPayment.nextEntryDay
      ? new Date(
          calculateNextPaymentDate(
            recurringPayment.paymentDay || 1,
            recurringPayment.nextEntryDay,
          ),
        ).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
        })
      : '';

    // Format expiry date
    const expiryDate = recurringPayment.expiryDate
      ? formatDate(new Date(recurringPayment.expiryDate))
      : '';

    // Calculate if expired: check if expiryDate exists and is before today 
    let isExpired = false;
    if (recurringPayment.expiryDate) {
      const expiry = new Date(recurringPayment.expiryDate);
      expiry.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      isExpired = expiry < today;
    }

    const dtoData = {
      id: recurringPayment.id,
      customerId: recurringPayment.customerId,
      customer: customerName ?? '',
      paymentMethod: recurringPayment.paymentMethod?.name ?? '',
      frequency: recurringPayment.paymentFrequency?.name ?? '',
      nextEntryDate: nextEntryDate,
      nextPaymentDate: nextPaymentDate,
      expiryDate: expiryDate,
      amount: formatCurrency(recurringPayment.amount || 0),
      isEnabled: recurringPayment.isRecurringPaymentEnabled ?? false,
      isExpired: isExpired,
      hasEnrolmentWarning,
    };

    return plainToInstance(RecurringPaymentListItemDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform multiple CustomerRecurringPayment entities to DTO format
   * @param recurringPayments - Array of CustomerRecurringPayment entities
   * @returns Array of RecurringPaymentListItemDto
   */
  transformRecurringPaymentsList(
    recurringPayments: CustomerRecurringPayment[],
    warningPaymentIds: Set<number> = new Set<number>(),
  ): RecurringPaymentListItemDto[] {
    return recurringPayments.map((recurringPayment) =>
      this.transformRecurringPaymentListItem(
        recurringPayment,
        warningPaymentIds.has(recurringPayment.id),
      ),
    );
  }
}
