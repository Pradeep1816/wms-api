import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  PaymentDataDto,
  PaymentMethodOptionDto,
  PaymentFrequencyOptionDto,
  RecurringPaymentEnrolmentDto,
  RecurringPaymentInfoDataDto,
} from '../dto/customer-recurring-payment-info-response.dto';
import { RecurringPaymentEnrolmentWarningDto } from '../dto/recurring-payment-enrolment-warning.dto';
import { CustomerRecurringPayment } from '../entities/customer-recurring-payment.entity';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { PaymentFrequency } from '../../payment/entities/payment-frequency.entity';
import { formatDate } from '../../utils/date-utils';

@Injectable()
export class CustomerRecurringPaymentInfoTransformationService {
  /**
   * Transform recurring payment entity to payment data DTO for form
   * Includes expiryMonth and expiryYear extracted from expiryDate
   */
  transformPaymentToInfoDto(
    payment: CustomerRecurringPayment | null,
    customerId: number,
  ): PaymentDataDto {
    if (!payment) {
      // Create mode: Default values (matching legacy defaults)
      const now = new Date();
      
      return plainToInstance(PaymentDataDto, {
        customerId,
        amount: 115, // DEFAULT_RATE 
        entryDay: 1,
        paymentDay: 1,
        paymentMethodId: 8, // Default Payment Method (Visa)
        paymentFrequencyId: 1, // Default Payment Frequency (Monthly)
        startDate: formatDate(now),
        expiryMonth: null,
        expiryYear: null,
        isEnabled: true,
      });
    }

    let expiryMonth: string | null = null;
    let expiryYear: number | null = null;

    if (payment.expiryDate) {
      const expiryDate = new Date(payment.expiryDate);
      const month = expiryDate.getMonth() + 1;
      expiryMonth = month.toString().padStart(2, '0'); // Format as "07" instead of "7"
      expiryYear = expiryDate.getFullYear();
    }

    // Format startDate for frontend (Dec 15, 2022 format)
    const formattedStartDate = payment.startDate ? formatDate(new Date(payment.startDate)) : undefined;

    return plainToInstance(PaymentDataDto, {
      customerId: payment.customerId,
      customerName: payment.customer && (payment.customer as any).profile
        ? `${(payment.customer as any).profile.firstname || ''} ${(payment.customer as any).profile.lastname || ''}`.trim()
        : undefined,
      amount: Number(payment.amount),
      entryDay: payment.entryDay,
      paymentDay: payment.paymentDay,
      paymentMethodId: payment.paymentMethodId,
      paymentFrequencyId: payment.paymentFrequencyId,
      startDate: formattedStartDate,
      expiryMonth,
      expiryYear,
      isEnabled: payment.isRecurringPaymentEnabled,
    });
  }

  /**
   * Transform payment methods to option DTOs
   */
  transformPaymentMethodsToDtos(paymentMethods: PaymentMethod[]): PaymentMethodOptionDto[] {
    return paymentMethods.map(pm =>
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
    return paymentFrequencies.map(pf =>
      plainToInstance(PaymentFrequencyOptionDto, {
        id: pf.id,
        name: pf.name,
      }),
    );
  }

  /**
   * Transform enrolments to form DTOs
   * Note: Enrolments are already transformed by EnrolmentService, so we just map them
   */
  transformEnrolmentsToFormDtos(enrolments: any[]): RecurringPaymentEnrolmentDto[] {
    return enrolments.map(enrolment =>
      plainToInstance(RecurringPaymentEnrolmentDto, {
        id: enrolment.id,
        programName: enrolment.programName || '',
        // Support both nested entity shape and raw query alias from repository
        paymentFrequency:
          (enrolment.paymentFrequency && enrolment.paymentFrequency.name) ||
          enrolment.paymentFrequency ||
          enrolment.paymentFrequencyName ||
          '',
        studentName: enrolment.studentName || '',
        teacherName: enrolment.teacherName || '',
        dueAmount: enrolment.dueAmount || 0,
        isSelected: Boolean(enrolment.isSelected),
      }),
    );
  }

  /**
   * Transform all form data components to info data DTO
   */
  transformInfoDataToDto(
    paymentData: PaymentDataDto,
    enrolments: RecurringPaymentEnrolmentDto[],
    paymentMethods: PaymentMethodOptionDto[],
    paymentFrequencies: PaymentFrequencyOptionDto[],
    enrolmentWarnings: RecurringPaymentEnrolmentWarningDto[] = [],
  ): RecurringPaymentInfoDataDto {
    return plainToInstance(RecurringPaymentInfoDataDto, {
      payment: paymentData,
      enrolments,
      paymentMethods,
      paymentFrequencies,
      enrolmentWarnings,
    });
  }
}
