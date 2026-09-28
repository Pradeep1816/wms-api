import { Injectable } from '@nestjs/common';
import { CustomerPaymentResponseDto } from '../../dto/payment-response.dto';
import { formatDate } from '../../../utils/date-utils';
import { RoundingUtils } from '../../../utils/rounding.utils';

@Injectable()
export class PaymentTransformationService {
  /**
   * Transform a single payment to DTO
   */
  transformPaymentToDto(payment: any): CustomerPaymentResponseDto {
    const dto = new CustomerPaymentResponseDto();
    dto.id = payment.id;
    dto.date = formatDate(payment.date);
    dto.notes = payment.notes || '';
    dto.amount = Number(payment.amount);
    dto.used = this.calculateUsedAmount(payment.amount, payment.balance);
    dto.remaining = Number(payment.balance);
    return dto;
  }

  /**
   * Transform multiple payments to DTOs
   */
  transformPaymentsToDtos(payments: any[]): CustomerPaymentResponseDto[] {
    return payments.map(payment => this.transformPaymentToDto(payment));
  }

  /**
   * Calculate used amount from payment amount and balance
   */
  private calculateUsedAmount(amount: number, balance: number): number {
    return RoundingUtils.calculateBalance(amount, balance, 2);
  }
}
