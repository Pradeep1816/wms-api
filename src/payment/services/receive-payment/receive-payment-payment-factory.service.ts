import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { PaymentMethodType } from '../../../payment/enums/payment-method-type.enum';
import { getCurrentESTDate } from '../../../utils/date-utils';
import { ReceivePaymentRepository } from '../../../invoice/repositories/receive-payment.repository';
import { roundMoney } from './receive-payment.utils';

@Injectable()
/**
 * Creates payment records used during receive-payment processing.
 * Also builds the legacy-style credit transfer pair:
 * CREDIT_APPLIED + CREDIT_USED linked through credit_usage.
 */
export class ReceivePaymentPaymentFactoryService {
  constructor(
    private readonly receivePaymentRepository: ReceivePaymentRepository,
  ) {}

  async createPaymentWithTransaction(
    manager: EntityManager,
    currentUserId: number,
    customerId: number,
    paymentMethodId: number,
    amount: number,
    balance: number,
    date: Date,
    reference: string,
    notes: string,
  ) {
    const transactionId = await this.receivePaymentRepository.createTransaction(
      currentUserId,
      manager,
    );

    return this.receivePaymentRepository.createPayment(
      {
        transactionId,
        userId: customerId,
        paymentMethodId,
        amount: roundMoney(amount),
        balance: roundMoney(balance),
        date,
        reference,
        notes,
        createdByUserId: currentUserId,
        updatedByUserId: currentUserId,
      },
      manager,
    );
  }

  async createInvoiceCreditTransferPair(
    manager: EntityManager,
    customerId: number,
    currentUserId: number,
    sourceInvoiceId: number,
    sourceReference: string,
    targetReference: string,
    amount: number,
    applyCreditPayment: (creditAppliedPaymentId: number) => Promise<number>,
    affectedPaymentIds: Set<number>,
  ): Promise<{ allocationId: number; creditUsedPaymentId: number }> {
    const autoDate = getCurrentESTDate();

    const creditApplied = await this.createPaymentWithTransaction(
      manager,
      currentUserId,
      customerId,
      PaymentMethodType.CREDIT_APPLIED,
      amount,
      amount,
      autoDate,
      sourceReference,
      '',
    );

    const allocationId = await applyCreditPayment(creditApplied.id);

    const creditUsedAmount = -Math.abs(amount);
    const creditUsed = await this.createPaymentWithTransaction(
      manager,
      currentUserId,
      customerId,
      PaymentMethodType.CREDIT_USED,
      creditUsedAmount,
      creditUsedAmount,
      autoDate,
      targetReference,
      '',
    );

    await this.receivePaymentRepository.createInvoicePayment(
      sourceInvoiceId,
      creditUsed.id,
      creditUsedAmount,
      currentUserId,
      manager,
    );

    await this.receivePaymentRepository.createCreditUsage(
      creditApplied.id,
      creditUsed.id,
      manager,
    );

    affectedPaymentIds.add(creditApplied.id);
    affectedPaymentIds.add(creditUsed.id);

    return {
      allocationId,
      creditUsedPaymentId: creditUsed.id,
    };
  }
}
