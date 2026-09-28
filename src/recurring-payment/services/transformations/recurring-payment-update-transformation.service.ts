import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import dayjs from 'dayjs';
import {
  RecurringPaymentUpdateInfoDto,
  RecurringPaymentUpdateInfoResponseDto,
  RecurringPaymentUpdateResponseDto,
  PaymentMethodOptionDto,
  PaymentFrequencyOptionDto,
} from '../../dto/recurring-payment-update-info-response.dto';
import { CustomerRecurringPayment } from '../../entities/customer-recurring-payment.entity';
import { PaymentMethod } from '../../../payment/entities/payment-method.entity';
import { PaymentFrequency } from '../../../payment/entities/payment-frequency.entity';
import { RecurringPaymentEnrolmentWarningDto } from '../../dto/recurring-payment-enrolment-warning.dto';

@Injectable()
export class RecurringPaymentUpdateTransformationService {

  transformPaymentToUpdateDto(
    payment: CustomerRecurringPayment,
    selectedEnrolmentIds: number[],
  ): RecurringPaymentUpdateInfoResponseDto {

    // Legacy: years list is 2024-2035 only
    // If expiry year < 2024, default to 2024 (first year in list)
    // If expiryDate is null, use current month/year
    let expiryMonth: string;
    let expiryYear: number;

    if (payment.expiryDate) {
      // Handle both string (YYYY-MM-DD) and Date object from database
      const expiryDateStr = typeof payment.expiryDate === 'string' 
        ? payment.expiryDate 
        : dayjs(payment.expiryDate).format('YYYY-MM-DD');
      
      const expiry = dayjs(expiryDateStr, 'YYYY-MM-DD');
      
      if (expiry.isValid()) {
        expiryMonth = String(expiry.month() + 1);
        let rawYear = expiry.year();
        expiryYear = rawYear < 2024 ? 2024 : rawYear;
      } else {
        // Fallback to current date if parsing fails
        expiryMonth = String(dayjs().month() + 1);
        expiryYear = dayjs().year();
      }
    } else {
      
      expiryMonth = String(dayjs().month() + 1);
      expiryYear = dayjs().year();
    }

    const formattedStartDate = payment.startDate
      ? dayjs(payment.startDate).format('MMM D, YYYY')
      : '';

    return plainToInstance(RecurringPaymentUpdateInfoResponseDto, {
      id: payment.id,
      customerId: payment.customerId,
      startDate: formattedStartDate,
      paymentDay: payment.paymentDay,
      paymentMethodId: payment.paymentMethodId,
      paymentFrequencyId: payment.paymentFrequencyId,
      expiryMonth,
      expiryYear,
      amount: Number(payment.amount),
      isEnabled: payment.isRecurringPaymentEnabled ? 1 : 0,
      selectedEnrolmentIds,
    });
  }

  /**
   * Transform payment methods to option DTOs
   */
  transformPaymentMethodsToDtos(
    paymentMethods: PaymentMethod[],
  ): PaymentMethodOptionDto[] {
    return paymentMethods.map((pm) =>
      plainToInstance(PaymentMethodOptionDto, {
        id: pm.id,
        name: pm.name,
      }),
    );
  }

  /**
   * Transform payment frequencies to option DTOs
   */
  transformPaymentFrequenciesToDtos(
    paymentFrequencies: PaymentFrequency[],
  ): PaymentFrequencyOptionDto[] {
    return paymentFrequencies.map((pf) =>
      plainToInstance(PaymentFrequencyOptionDto, {
        id: pf.id,
        name: pf.name,
      }),
    );
  }

  /**
   * Build days list (1-28) 
   */
  buildDaysList(): Record<number, number> {
    const days: Record<number, number> = {};
    for (let i = 1; i <= 28; i++) {
      days[i] = i;
    }
    return days;
  }

  /**
   * Build months list (1-12) 
   */
  buildMonthsList(): Record<number, string> {
    const months: Record<number, string> = {};
    for (let i = 1; i <= 12; i++) {
      months[i] = i < 10 ? `0${i}` : String(i);
    }
    return months;
  }

  /**
   * Build years list (2024-2035)
   */
  buildYearsList(): Record<number, number> {
    const years: Record<number, number> = {};
    for (let i = 2024; i <= 2035; i++) {
      years[i] = i;
    }
    return years;
  }

  /**
   * Transform enrolment details to form DTOs with selection status
   */
  transformEnrolmentsToFormDtos(
    enrolments: Array<{
      id: number;
      studentName: string;
      programName: string;
      paymentFrequency: string;
      teacherName: string;
      dueAmount: number;
    }>,
    selectedEnrolmentIds: number[],
  ): Array<{
    id: number;
    studentName: string;
    programName: string;
    paymentFrequency: string;
    teacherName: string;
    dueAmount: number;
    isSelected: boolean;
  }> {
    const selectedSet = new Set(selectedEnrolmentIds);

    return enrolments.map((enrolment) => ({
      id: enrolment.id,
      studentName: enrolment.studentName,
      programName: enrolment.programName,
      paymentFrequency: enrolment.paymentFrequency,
      teacherName: enrolment.teacherName,
      dueAmount: enrolment.dueAmount,
      isSelected: selectedSet.has(enrolment.id),
    }));
  }

  /**
   * Transform all form data components to complete form data DTO
   * Wraps in body to match existing module pattern
   */
  transformFormDataToDto(
    payment: RecurringPaymentUpdateInfoResponseDto,
    paymentMethods: PaymentMethodOptionDto[],
    paymentFrequencies: PaymentFrequencyOptionDto[],
    enrolments: Array<{
      id: number;
      studentName: string;
      programName: string;
      paymentFrequency: string;
      teacherName: string;
      dueAmount: number;
      isSelected: boolean;
    }>,
    enrolmentWarnings: RecurringPaymentEnrolmentWarningDto[] = [],
  ): RecurringPaymentUpdateResponseDto {
    const infoData = plainToInstance(RecurringPaymentUpdateInfoDto, {
      recurringPayment: payment,
      paymentMethods,
      paymentFrequencies,
      days: this.buildDaysList(),
      months: this.buildMonthsList(),
      years: this.buildYearsList(),
      enrolments,
      enrolmentWarnings,
    });

    return plainToInstance(RecurringPaymentUpdateResponseDto, {
      body: infoData,
    });
  }
}
