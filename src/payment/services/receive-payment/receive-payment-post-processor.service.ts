import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CustomerBalanceRecalculatorService } from '../../../shared/services/customer-balance-recalculator.service';
import { ReceivePaymentRepository } from '../../../invoice/repositories/receive-payment.repository';
import { GroupLessonKey } from './receive-payment.types';

interface ReceivePaymentPostProcessInput {
  manager: EntityManager;
  locationSlug: string;
  customerId: number;
  currentUserId: number;
  paymentId: number | null;
  affectedInvoiceIds: Set<number>;
  affectedPrivateLessonIds: Set<number>;
  affectedGroupLessonKeys: Map<string, GroupLessonKey>;
  affectedPaymentIds: Set<number>;
}

@Injectable()
/**
 * Recalculates and persists balances/statuses for all entities touched
 * by receive-payment allocations, then recalculates customer balance.
 */
export class ReceivePaymentPostProcessorService {
  constructor(
    private readonly receivePaymentRepository: ReceivePaymentRepository,
    private readonly customerBalanceRecalculatorService: CustomerBalanceRecalculatorService,
  ) {}

  async recalculateAndPersist(input: ReceivePaymentPostProcessInput): Promise<number> {
    for (const id of input.affectedPaymentIds) {
      await this.receivePaymentRepository.recalculatePaymentBalance(
        id,
        input.currentUserId,
        input.manager,
      );
    }

    for (const invoiceId of input.affectedInvoiceIds) {
      await this.receivePaymentRepository.recalculateInvoiceBalance(
        invoiceId,
        input.currentUserId,
        input.manager,
      );
    }

    for (const lessonId of input.affectedPrivateLessonIds) {
      await this.receivePaymentRepository.recalculatePrivateLessonBalance(lessonId, input.manager);
    }

    for (const key of input.affectedGroupLessonKeys.values()) {
      await this.receivePaymentRepository.recalculateGroupLessonBalance(
        key.lessonId,
        key.enrolmentId,
        input.currentUserId,
        input.manager,
      );
    }

    await this.customerBalanceRecalculatorService.recalculateAndPersist(input.customerId, {
      manager: input.manager,
      updatedByUserId: input.currentUserId,
      locationSlug: input.locationSlug,
    });

    if (!input.paymentId) {
      return 0;
    }

    return this.receivePaymentRepository.recalculatePaymentBalance(
      input.paymentId,
      input.currentUserId,
      input.manager,
    );
  }
}
