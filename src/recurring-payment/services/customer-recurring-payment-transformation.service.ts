import { Injectable } from '@nestjs/common';
import { CustomerRecurringPaymentDto } from '../dto/customer-recurring-payment-response.dto';
import { IRecurringPaymentTransformationService } from '../interfaces/customer-recurring-payment-service.interface';
import { formatDate } from '../../utils/date-utils';
import { calculateNextPaymentDate } from '../../utils/date-utils';
import { formatCurrency } from '../../utils/formatters';
import { plainToClass, plainToInstance } from 'class-transformer';

@Injectable()
export class CustomerRecurringPaymentTransformationService implements IRecurringPaymentTransformationService {
  /**
   * Transform recurring payment to DTO
   */
  transformToDto(
    recurringPayment: any,
    hasEnrolmentWarning = false,
  ): CustomerRecurringPaymentDto {
    // Format next entry date (using nextEntryDay)
    const nextEntryDate = recurringPayment.nextEntryDay 
      ? formatDate(recurringPayment.nextEntryDay) 
      : '';

    // Calculate next payment date using the utility function
    const nextPaymentDate = recurringPayment.nextEntryDay
      ? new Date(
          calculateNextPaymentDate(
            recurringPayment.paymentDay || 1,
            recurringPayment.nextEntryDay
          )
        ).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
        })
      : '';

    // Format expiry date
    const expiryDate = recurringPayment.expiryDate 
      ? formatDate(recurringPayment.expiryDate) 
      : '';

    const dtoData = {
      id: recurringPayment.id,
      nextEntryDate: nextEntryDate,
      nextPaymentDate: nextPaymentDate,
      frequency: recurringPayment.paymentFrequency?.name || '',
      expiryDate: expiryDate,
      methodName: recurringPayment.paymentMethod?.name || '',
      amount: Number(recurringPayment.amount),
      hasEnrolmentWarning,
    };

    return plainToInstance(CustomerRecurringPaymentDto, dtoData);
  }

  /**
   * Transform multiple recurring payments to DTOs
   */
  transformRecurringPaymentsToDtos(
    recurringPayments: any[],
    warningPaymentIds: Set<number> = new Set<number>(),
  ): CustomerRecurringPaymentDto[] {
    return recurringPayments.map((recurringPayment) =>
      this.transformToDto(
        recurringPayment,
        warningPaymentIds.has(Number(recurringPayment.id)),
      ),
    );
  }
}
