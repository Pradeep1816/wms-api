import { Expose } from 'class-transformer';
import { RecurringPaymentEnrolmentWarningDto } from './recurring-payment-enrolment-warning.dto';

export class PaymentDataDto {
  @Expose()
  customerId: number;

  @Expose()
  customerName?: string;

  @Expose()
  amount: number;

  @Expose()
  entryDay: number;

  @Expose()
  paymentDay: number;

  @Expose()
  paymentMethodId: number;

  @Expose()
  paymentFrequencyId: number;

  @Expose()
  startDate?: string;

  @Expose()
  expiryMonth?: string;

  @Expose()
  expiryYear?: number;

  @Expose()
  isEnabled: boolean;
}

export class PaymentMethodOptionDto {
  @Expose()
  id: number;

  @Expose()
  name: string;
}

export class PaymentFrequencyOptionDto {
  @Expose()
  id: number;

  @Expose()
  name: string;
}

export class RecurringPaymentEnrolmentDto {
  @Expose()
  id: number;

  @Expose()
  programName: string;

  @Expose()
  paymentFrequency: string;

  @Expose()
  studentName: string;

  @Expose()
  teacherName: string;

  @Expose()
  dueAmount: number;

  @Expose()
  isSelected: boolean;
}

export class RecurringPaymentInfoDataDto {
  @Expose()
  payment: PaymentDataDto;

  @Expose()
  enrolments: RecurringPaymentEnrolmentDto[];

  @Expose()
  paymentMethods: PaymentMethodOptionDto[];

  @Expose()
  paymentFrequencies: PaymentFrequencyOptionDto[];

  @Expose()
  enrolmentWarnings: RecurringPaymentEnrolmentWarningDto[];
}

export class RecurringPaymentInfoResponseDto {
  @Expose()
  body: RecurringPaymentInfoDataDto;
}
