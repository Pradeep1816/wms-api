import { IsArray, IsBoolean, IsInt, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';
import { RecurringPaymentEnrolmentWarningDto } from './recurring-payment-enrolment-warning.dto';

export class RecurringPaymentUpdateInfoResponseDto {
  @IsInt()
  id: number;

  @IsInt()
  customerId: number;

  @IsString()
  startDate: string;

  @IsInt()
  paymentDay: number;

  @IsInt()
  paymentMethodId: number;

  @IsInt()
  paymentFrequencyId: number;

  @IsString()
  expiryMonth: string;

  @IsInt()
  expiryYear: number;

  @IsNumber()
  amount: number;

  @IsBoolean()
  isEnabled: boolean;

  @IsArray()
  selectedEnrolmentIds: number[];
}

export class PaymentMethodOptionDto {
  @IsInt()
  id: number;

  @IsString()
  name: string;
}

export class PaymentFrequencyOptionDto {
  @IsInt()
  id: number;

  @IsString()
  name: string;
}

export class RecurringPaymentUpdateInfoDto {
  @IsObject()
  recurringPayment: RecurringPaymentUpdateInfoResponseDto;

  @IsArray()
  paymentMethods: PaymentMethodOptionDto[];

  @IsArray()
  paymentFrequencies: PaymentFrequencyOptionDto[];

  @IsObject()
  days: Record<number, number>;

  @IsObject()
  months: Record<number, string>;

  @IsObject()
  years: Record<number, number>;

  @IsArray()
  enrolments: {
    id: number;
    studentName: string;
    programName: string;
    paymentFrequency: string;
    teacherName: string;
    dueAmount: number;
    isSelected: boolean;
  }[];

  @IsArray()
  enrolmentWarnings: RecurringPaymentEnrolmentWarningDto[];
}

export class RecurringPaymentUpdateResponseDto {
  @IsObject()
  body: RecurringPaymentUpdateInfoDto;
}
