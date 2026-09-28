import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ReceivePaymentRepository } from '../../../invoice/repositories/receive-payment.repository';
import {
  GroupDistributionWorkItem,
  GroupLessonKey,
  InvoiceDistributionWorkItem,
  LessonDistributionWorkItem,
} from './receive-payment.types';
import { addGroupLessonKey, roundMoney } from './receive-payment.utils';

@Injectable()
/**
 * Applies the actual received payment amount (cash/card/etc.) to targets.
 * Allocation order is controlled by the orchestrator service.
 */
export class ReceivePaymentCashApplierService {
  constructor(
    private readonly receivePaymentRepository: ReceivePaymentRepository,
  ) {}

  async applyCashToInvoiceTargets(
    manager: EntityManager,
    paymentId: number,
    amountRemaining: number,
    invoiceWork: InvoiceDistributionWorkItem[],
    currentUserId: number,
    affectedInvoiceIds: Set<number>,
  ): Promise<number> {
    let remaining = amountRemaining;

    for (const item of invoiceWork) {
      if (remaining <= 0) {
        break;
      }
      if (item.remainingRequest <= 0 || item.remainingBalance <= 0) {
        continue;
      }

      const requested = roundMoney(Math.min(item.remainingRequest, item.remainingBalance));
      const amountToApply = roundMoney(Math.min(requested, remaining));
      if (amountToApply <= 0) {
        continue;
      }

      await this.receivePaymentRepository.createInvoicePayment(
        item.target.id,
        paymentId,
        amountToApply,
        currentUserId,
        manager,
      );

      remaining = roundMoney(remaining - amountToApply);
      item.remainingRequest = roundMoney(item.remainingRequest - amountToApply);
      item.remainingBalance = roundMoney(item.remainingBalance - amountToApply);
      affectedInvoiceIds.add(item.target.id);
    }

    return remaining;
  }

  async applyCashToLessonTargets(
    manager: EntityManager,
    paymentId: number,
    amountRemaining: number,
    lessonWork: LessonDistributionWorkItem[],
    currentUserId: number,
    affectedPrivateLessonIds: Set<number>,
  ): Promise<number> {
    let remaining = amountRemaining;

    for (const item of lessonWork) {
      if (remaining <= 0) {
        break;
      }
      if (item.remainingRequest <= 0 || item.remainingBalance <= 0) {
        continue;
      }

      const requested = roundMoney(Math.min(item.remainingRequest, item.remainingBalance));
      const amountToApply = roundMoney(Math.min(requested, remaining));
      if (amountToApply <= 0) {
        continue;
      }

      await this.receivePaymentRepository.createLessonPayment(
        item.target.lessonId,
        paymentId,
        item.target.enrolmentId,
        amountToApply,
        currentUserId,
        manager,
      );

      remaining = roundMoney(remaining - amountToApply);
      item.remainingRequest = roundMoney(item.remainingRequest - amountToApply);
      item.remainingBalance = roundMoney(item.remainingBalance - amountToApply);
      affectedPrivateLessonIds.add(item.target.lessonId);
    }

    return remaining;
  }

  async applyCashToGroupTargets(
    manager: EntityManager,
    paymentId: number,
    amountRemaining: number,
    groupWork: GroupDistributionWorkItem[],
    currentUserId: number,
    affectedGroupLessonKeys: Map<string, GroupLessonKey>,
  ): Promise<number> {
    let remaining = amountRemaining;

    for (const item of groupWork) {
      if (remaining <= 0) {
        break;
      }
      if (item.remainingRequest <= 0 || item.remainingBalance <= 0) {
        continue;
      }

      const requested = roundMoney(Math.min(item.remainingRequest, item.remainingBalance));
      const amountToApply = roundMoney(Math.min(requested, remaining));
      if (amountToApply <= 0) {
        continue;
      }

      await this.receivePaymentRepository.createLessonPayment(
        item.target.lessonId,
        paymentId,
        item.target.enrolmentId,
        amountToApply,
        currentUserId,
        manager,
      );

      remaining = roundMoney(remaining - amountToApply);
      item.remainingRequest = roundMoney(item.remainingRequest - amountToApply);
      item.remainingBalance = roundMoney(item.remainingBalance - amountToApply);
      addGroupLessonKey(affectedGroupLessonKeys, item.target.lessonId, item.target.enrolmentId);
    }

    return remaining;
  }
}
