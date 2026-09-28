import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ReceivePaymentRepository } from '../../../invoice/repositories/receive-payment.repository';
import {
  GroupDistributionWorkItem,
  GroupLessonKey,
  InvoiceCreditWorkItem,
  InvoiceDistributionWorkItem,
  LessonDistributionWorkItem,
  PaymentCreditWorkItem,
  RoyaltyCreditAllocation,
  RoyaltyInvoiceCreditAllocation,
} from './receive-payment.types';
import { RoyaltyTransactionSourceType } from '../../enums/royalty-transaction.enum';
import {
  addGroupLessonKey,
  formatInvoiceReference,
  formatLessonReference,
  roundMoney,
} from './receive-payment.utils';
import { ReceivePaymentPaymentFactoryService } from './receive-payment-payment-factory.service';

@Injectable()
/**
 * Applies credit sources to target work items.
 * Each method applies at most one chunk and returns whether it made progress.
 * The orchestrator loops until no more credit can be consumed.
 */
export class ReceivePaymentCreditApplierService {
  constructor(
    private readonly receivePaymentRepository: ReceivePaymentRepository,
    private readonly paymentFactoryService: ReceivePaymentPaymentFactoryService,
  ) {}

  async applyInvoiceCreditToInvoices(
    manager: EntityManager,
    credit: InvoiceCreditWorkItem,
    invoiceWork: InvoiceDistributionWorkItem[],
    customerId: number,
    currentUserId: number,
    affectedInvoiceIds: Set<number>,
    affectedPaymentIds: Set<number>,
    royaltyAllocations: RoyaltyInvoiceCreditAllocation[] = [],
  ): Promise<boolean> {
    for (const item of invoiceWork) {
      if (credit.remainingCredit <= 0) {
        break;
      }
      if (item.remainingRequest <= 0 || item.remainingBalance <= 0) {
        continue;
      }

      const requested = roundMoney(Math.min(item.remainingRequest, item.remainingBalance));
      const amountToApply = roundMoney(Math.min(requested, credit.remainingCredit));
      if (amountToApply <= 0) {
        continue;
      }

      const sourceReference = formatInvoiceReference(credit.source.invoiceNumber);
      const targetReference = formatInvoiceReference(item.target.invoiceNumber);

      const transfer = await this.paymentFactoryService.createInvoiceCreditTransferPair(
        manager,
        customerId,
        currentUserId,
        credit.source.id,
        sourceReference,
        targetReference,
        amountToApply,
        async (creditAppliedPaymentId) => {
          const invoicePayment = await this.receivePaymentRepository.createInvoicePayment(
            item.target.id,
            creditAppliedPaymentId,
            amountToApply,
            currentUserId,
            manager,
          );
          return invoicePayment.id;
        },
        affectedPaymentIds,
      );
      royaltyAllocations.push({
        invoiceCreditId: credit.source.id,
        sourceType: RoyaltyTransactionSourceType.INVOICE_PAYMENT,
        allocationId: transfer.allocationId,
        amount: amountToApply,
      });

      credit.remainingCredit = roundMoney(credit.remainingCredit - amountToApply);
      item.remainingRequest = roundMoney(item.remainingRequest - amountToApply);
      item.remainingBalance = roundMoney(item.remainingBalance - amountToApply);
      affectedInvoiceIds.add(credit.source.id);
      affectedInvoiceIds.add(item.target.id);
      return true;
    }

    return false;
  }

  async applyInvoiceCreditToLessons(
    manager: EntityManager,
    credit: InvoiceCreditWorkItem,
    lessonWork: LessonDistributionWorkItem[],
    customerId: number,
    currentUserId: number,
    affectedInvoiceIds: Set<number>,
    affectedPrivateLessonIds: Set<number>,
    affectedPaymentIds: Set<number>,
    royaltyAllocations: RoyaltyInvoiceCreditAllocation[] = [],
  ): Promise<boolean> {
    for (const item of lessonWork) {
      if (credit.remainingCredit <= 0) {
        break;
      }
      if (item.remainingRequest <= 0 || item.remainingBalance <= 0) {
        continue;
      }

      const requested = roundMoney(Math.min(item.remainingRequest, item.remainingBalance));
      const amountToApply = roundMoney(Math.min(requested, credit.remainingCredit));
      if (amountToApply <= 0) {
        continue;
      }

      const sourceReference = formatInvoiceReference(credit.source.invoiceNumber);
      const targetReference = formatLessonReference(item.target.lessonId);

      const transfer = await this.paymentFactoryService.createInvoiceCreditTransferPair(
        manager,
        customerId,
        currentUserId,
        credit.source.id,
        sourceReference,
        targetReference,
        amountToApply,
        async (creditAppliedPaymentId) => {
          const lessonPayment = await this.receivePaymentRepository.createLessonPayment(
            item.target.lessonId,
            creditAppliedPaymentId,
            item.target.enrolmentId,
            amountToApply,
            currentUserId,
            manager,
          );
          return lessonPayment.id;
        },
        affectedPaymentIds,
      );
      royaltyAllocations.push({
        invoiceCreditId: credit.source.id,
        sourceType: RoyaltyTransactionSourceType.LESSON_PAYMENT,
        allocationId: transfer.allocationId,
        amount: amountToApply,
      });

      credit.remainingCredit = roundMoney(credit.remainingCredit - amountToApply);
      item.remainingRequest = roundMoney(item.remainingRequest - amountToApply);
      item.remainingBalance = roundMoney(item.remainingBalance - amountToApply);
      affectedInvoiceIds.add(credit.source.id);
      affectedPrivateLessonIds.add(item.target.lessonId);
      return true;
    }

    return false;
  }

  async applyInvoiceCreditToGroupLessons(
    manager: EntityManager,
    credit: InvoiceCreditWorkItem,
    groupWork: GroupDistributionWorkItem[],
    customerId: number,
    currentUserId: number,
    affectedInvoiceIds: Set<number>,
    affectedGroupLessonKeys: Map<string, GroupLessonKey>,
    affectedPaymentIds: Set<number>,
    royaltyAllocations: RoyaltyInvoiceCreditAllocation[] = [],
  ): Promise<boolean> {
    for (const item of groupWork) {
      if (credit.remainingCredit <= 0) {
        break;
      }
      if (item.remainingRequest <= 0 || item.remainingBalance <= 0) {
        continue;
      }

      const requested = roundMoney(Math.min(item.remainingRequest, item.remainingBalance));
      const amountToApply = roundMoney(Math.min(requested, credit.remainingCredit));
      if (amountToApply <= 0) {
        continue;
      }

      const sourceReference = formatInvoiceReference(credit.source.invoiceNumber);
      const targetReference = formatLessonReference(item.target.lessonId);

      const transfer = await this.paymentFactoryService.createInvoiceCreditTransferPair(
        manager,
        customerId,
        currentUserId,
        credit.source.id,
        sourceReference,
        targetReference,
        amountToApply,
        async (creditAppliedPaymentId) => {
          const lessonPayment = await this.receivePaymentRepository.createLessonPayment(
            item.target.lessonId,
            creditAppliedPaymentId,
            item.target.enrolmentId,
            amountToApply,
            currentUserId,
            manager,
          );
          return lessonPayment.id;
        },
        affectedPaymentIds,
      );
      royaltyAllocations.push({
        invoiceCreditId: credit.source.id,
        sourceType: RoyaltyTransactionSourceType.LESSON_PAYMENT,
        allocationId: transfer.allocationId,
        amount: amountToApply,
      });

      credit.remainingCredit = roundMoney(credit.remainingCredit - amountToApply);
      item.remainingRequest = roundMoney(item.remainingRequest - amountToApply);
      item.remainingBalance = roundMoney(item.remainingBalance - amountToApply);
      affectedInvoiceIds.add(credit.source.id);
      addGroupLessonKey(affectedGroupLessonKeys, item.target.lessonId, item.target.enrolmentId);
      return true;
    }

    return false;
  }

  async applyExistingPaymentCreditToInvoices(
    manager: EntityManager,
    credit: PaymentCreditWorkItem,
    invoiceWork: InvoiceDistributionWorkItem[],
    currentUserId: number,
    affectedInvoiceIds: Set<number>,
    royaltyAllocations: RoyaltyCreditAllocation[] = [],
  ): Promise<boolean> {
    for (const item of invoiceWork) {
      if (credit.remainingCredit <= 0) {
        break;
      }
      if (item.remainingRequest <= 0 || item.remainingBalance <= 0) {
        continue;
      }

      const requested = roundMoney(Math.min(item.remainingRequest, item.remainingBalance));
      const amountToApply = roundMoney(Math.min(requested, credit.remainingCredit));
      if (amountToApply <= 0) {
        continue;
      }

      const invoicePayment = await this.receivePaymentRepository.createInvoicePayment(
        item.target.id,
        credit.source.id,
        amountToApply,
        currentUserId,
        manager,
      );
      royaltyAllocations.push({
        originalPaymentId: credit.source.id,
        sourceType: RoyaltyTransactionSourceType.INVOICE_PAYMENT,
        allocationId: invoicePayment.id,
        amount: amountToApply,
      });

      credit.remainingCredit = roundMoney(credit.remainingCredit - amountToApply);
      item.remainingRequest = roundMoney(item.remainingRequest - amountToApply);
      item.remainingBalance = roundMoney(item.remainingBalance - amountToApply);
      affectedInvoiceIds.add(item.target.id);
      return true;
    }

    return false;
  }

  async applyExistingPaymentCreditToLessons(
    manager: EntityManager,
    credit: PaymentCreditWorkItem,
    lessonWork: LessonDistributionWorkItem[],
    currentUserId: number,
    affectedPrivateLessonIds: Set<number>,
    royaltyAllocations: RoyaltyCreditAllocation[] = [],
  ): Promise<boolean> {
    for (const item of lessonWork) {
      if (credit.remainingCredit <= 0) {
        break;
      }
      if (item.remainingRequest <= 0 || item.remainingBalance <= 0) {
        continue;
      }

      const requested = roundMoney(Math.min(item.remainingRequest, item.remainingBalance));
      const amountToApply = roundMoney(Math.min(requested, credit.remainingCredit));
      if (amountToApply <= 0) {
        continue;
      }

      const lessonPayment = await this.receivePaymentRepository.createLessonPayment(
        item.target.lessonId,
        credit.source.id,
        item.target.enrolmentId,
        amountToApply,
        currentUserId,
        manager,
      );
      royaltyAllocations.push({
        originalPaymentId: credit.source.id,
        sourceType: RoyaltyTransactionSourceType.LESSON_PAYMENT,
        allocationId: lessonPayment.id,
        amount: amountToApply,
      });

      credit.remainingCredit = roundMoney(credit.remainingCredit - amountToApply);
      item.remainingRequest = roundMoney(item.remainingRequest - amountToApply);
      item.remainingBalance = roundMoney(item.remainingBalance - amountToApply);
      affectedPrivateLessonIds.add(item.target.lessonId);
      return true;
    }

    return false;
  }

  async applyExistingPaymentCreditToGroupLessons(
    manager: EntityManager,
    credit: PaymentCreditWorkItem,
    groupWork: GroupDistributionWorkItem[],
    currentUserId: number,
    affectedGroupLessonKeys: Map<string, GroupLessonKey>,
    royaltyAllocations: RoyaltyCreditAllocation[] = [],
  ): Promise<boolean> {
    for (const item of groupWork) {
      if (credit.remainingCredit <= 0) {
        break;
      }
      if (item.remainingRequest <= 0 || item.remainingBalance <= 0) {
        continue;
      }

      const requested = roundMoney(Math.min(item.remainingRequest, item.remainingBalance));
      const amountToApply = roundMoney(Math.min(requested, credit.remainingCredit));
      if (amountToApply <= 0) {
        continue;
      }

      const lessonPayment = await this.receivePaymentRepository.createLessonPayment(
        item.target.lessonId,
        credit.source.id,
        item.target.enrolmentId,
        amountToApply,
        currentUserId,
        manager,
      );
      royaltyAllocations.push({
        originalPaymentId: credit.source.id,
        sourceType: RoyaltyTransactionSourceType.LESSON_PAYMENT,
        allocationId: lessonPayment.id,
        amount: amountToApply,
      });

      credit.remainingCredit = roundMoney(credit.remainingCredit - amountToApply);
      item.remainingRequest = roundMoney(item.remainingRequest - amountToApply);
      item.remainingBalance = roundMoney(item.remainingBalance - amountToApply);
      addGroupLessonKey(affectedGroupLessonKeys, item.target.lessonId, item.target.enrolmentId);
      return true;
    }

    return false;
  }
}
