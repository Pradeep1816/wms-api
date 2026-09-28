import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { getCurrentESTDate, parseDateFromIso } from '../../../utils/date-utils';
import {
  CreditWorkItem,
  DistributionWorkItem,
} from './receive-payment.types';
import { roundMoney, sumValues } from './receive-payment.utils';
import { Lesson } from '../../../lesson/entities/lesson.entity';
import { LessonStatusEnum } from '../../../lesson/enums/lesson-status';

@Injectable()
/**
 * Holds request validation and policy checks for receive-payment.
 * Keeping these rules centralized makes easier to audit.
 */
export class ReceivePaymentValidationService {
  // Basic input rules for amount/method combinations.
  validateAmountAndMethod(amountReceived: number, paymentMethodId?: number): void {
    if (!Number.isFinite(amountReceived)) {
      throw new BadRequestException('Amount must be number');
    }

    if (amountReceived !== 0 && !paymentMethodId) {
      throw new BadRequestException('Payment Method cannot be blank.');
    }
  }

  // negative-payment guards: no distributions, credits required.
  validateNegativeFlowSelections(
    invoiceDistributions: DistributionWorkItem[],
    lessonDistributions: DistributionWorkItem[],
    groupDistributions: DistributionWorkItem[],
    invoiceCredits: CreditWorkItem[],
    paymentCredits: CreditWorkItem[],
  ): void {
    if (
      invoiceDistributions.length > 0 ||
      lessonDistributions.length > 0 ||
      groupDistributions.length > 0
    ) {
      throw new BadRequestException('Negative Payment can be applied to only invoice credits.');
    }

    if (invoiceCredits.length === 0 && paymentCredits.length === 0) {
      throw new BadRequestException('Select Any Invoice credits to apply negative payment');
    }
  }

  /**
   * Validates that none of the requested lessons are canceled.
   * Legacy: PaymentForm::validateLessonPayment()
   */
  async validateCanceledLessons(
    manager: EntityManager,
    lessonIds: number[],
  ): Promise<void> {
    if (lessonIds.length === 0) return;

    const canceledLessons = await manager.find(Lesson, {
      where: {
        id: In(lessonIds),
        status: LessonStatusEnum.CANCELED,
      },
    });

    if (canceledLessons.length > 0) {
      throw new BadRequestException(
        'One of the choosen lesson is canceled so please cancel the payment and retry',
      );
    }
  }

  parsePaymentDate(dateValue: string): Date {
    const parsed = parseDateFromIso(dateValue);
    if (!parsed || Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid payment date format');
    }
    return parsed;
  }

  validateCreateDate(paymentDate: Date, isAdmin: boolean): void {
    if (isAdmin) {
      return;
    }

    const paymentDateKey = paymentDate.toISOString().slice(0, 10);
    const currentEst = getCurrentESTDate();
    const monthStartUtc = new Date(
      Date.UTC(currentEst.getUTCFullYear(), currentEst.getUTCMonth(), 1),
    );
    const monthStartKey = monthStartUtc.toISOString().slice(0, 10);

    if (paymentDateKey < monthStartKey) {
      throw new BadRequestException(
        'Payment Date cannot be set prior to first day of current month',
      );
    }
  }

  validateRequestedDistributionTotals(
    amountReceived: number,
    invoiceDistributions: DistributionWorkItem[],
    lessonDistributions: DistributionWorkItem[],
    groupDistributions: DistributionWorkItem[],
    invoiceCredits: CreditWorkItem[],
    paymentCredits: CreditWorkItem[],
  ): void {
    const invoiceDistSum = sumValues(invoiceDistributions.map((item) => item.requested));
    const lessonDistSum = sumValues(lessonDistributions.map((item) => item.requested));
    const groupDistSum = sumValues(groupDistributions.map((item) => item.requested));
    
    const amountToDistribute = roundMoney(invoiceDistSum + lessonDistSum + groupDistSum);

    const invoiceCreditSum = sumValues(invoiceCredits.map((item) => item.requested));
    const paymentCreditSum = sumValues(paymentCredits.map((item) => item.requested));
    const selectedCredits = roundMoney(invoiceCreditSum + paymentCreditSum);

    if (amountToDistribute > roundMoney(amountReceived + selectedCredits + 0.009)) {
      throw new BadRequestException('Amount mismatched with distributions');
    }
  }
}
