import { Injectable } from '@nestjs/common';
import { PaymentListItemDto } from '../../dto/payments-list-response.dto';
import { Payment } from '../../entities/payment.entity';
import { formatLegacyDate } from '../../../utils/date-utils';
import { formatCurrency } from 'src/utils/formatters';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class PaymentListTransformation {
  /**
   * Transform a single Payment entity to DTO format
   * @param payment - Payment entity with relations (user, user.profile, paymentMethod)
   * @returns PaymentListItemDto
   */
  transformPaymentListItem(payment: Payment): PaymentListItemDto {
  
    let customerName: string | undefined = undefined;
    if (payment.user?.profile) {
      const firstName = payment.user.profile.firstname || '';
      const lastName = payment.user.profile.lastname || '';
      customerName = `${firstName} ${lastName}`.trim() || undefined;
    }
    if (!customerName && payment.user?.username) {
      customerName = payment.user.username;
    }

    const dtoData = {
      id: payment.id,
      number: `P-${payment.id.toString().padStart(5, '0')}`,
      date: payment.date ? formatLegacyDate(new Date(payment.date)) : '',
      customer: customerName ?? '',
      paymentMethod: payment.paymentMethod?.name ?? '',
      notes: payment.notes ?? '',
      reference: payment.reference ?? '',
      amount: formatCurrency(payment.amount || 0),
    };

    return plainToInstance(PaymentListItemDto, dtoData, { excludeExtraneousValues: true });
  }

  /**
   * Transform multiple Payment entities to DTO format
   * @param payments - Array of Payment entities
   * @returns Array of PaymentListItemDto
   */
  transformPaymentList(payments: Payment[]): PaymentListItemDto[] {
    return payments.map(payment => this.transformPaymentListItem(payment));
  }
}

