import { Injectable } from '@nestjs/common';
import { LessonPaymentItemDto } from '../../dto/lesson-payment-response.dto';
import { formatDate } from '../../../utils/date-utils';
import { formatCurrency } from '../../../utils/formatters';

interface RawLessonPayment {
  id: number;
  date: Date | string;
  paymentMethod: string;
  number: string;
  amount: number | string;
}

@Injectable()
export class LessonPaymentTransformationService {
  transformRawToPaymentInfo(raw: RawLessonPayment): LessonPaymentItemDto {
    const paymentDate = raw.date ? new Date(raw.date) : null;

    return {
      id: raw.id,
      date: paymentDate ? formatDate(paymentDate) : '',
      paymentMethod: raw.paymentMethod || 'Unknown',
      number: raw.number || '',
      amount: formatCurrency(Number(raw.amount) || 0),
    };
  }

  transformRawPaymentsToDtos(rawPayments: RawLessonPayment[]): LessonPaymentItemDto[] {
    return rawPayments.map((raw) => this.transformRawToPaymentInfo(raw));
  }
}
