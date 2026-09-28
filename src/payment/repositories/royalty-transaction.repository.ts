import { Injectable } from '@nestjs/common';
import { EntityManager, FindManyOptions, In } from 'typeorm';
import { RoyaltyTransaction } from '../entities/royalty-transaction.entity';
import {
  RoyaltyTransactionEventType,
  RoyaltyTransactionSourceType,
} from '../enums/royalty-transaction.enum';

export interface RoyaltyRecognitionBalance {
  transaction: RoyaltyTransaction;
  remainingPaymentAmount: number;
  remainingRevenueAmount: number;
  remainingTaxAmount: number;
  activeRevenueAmount: number;
  activeTaxAmount: number;
  activeRoyaltyAmount: number;
  activeAdvertisementAmount?: number;
}

@Injectable()
export class RoyaltyTransactionRepository {
  async findPaymentRecognitions(
    manager: EntityManager,
    paymentId: number,
  ): Promise<RoyaltyTransaction[]> {
    return manager.getRepository(RoyaltyTransaction).find({
      where: {
        originalPaymentId: paymentId,
        eventType: In([
          RoyaltyTransactionEventType.PAYMENT_RECEIVED,
          RoyaltyTransactionEventType.OPENING_CREDIT,
        ]),
      },
      order: { id: 'ASC' },
    });
  }

  async findReportablePaymentEvents(
    manager: EntityManager,
    paymentId: number,
  ): Promise<RoyaltyTransaction[]> {
    return manager
      .getRepository(RoyaltyTransaction)
      .createQueryBuilder('royaltyTransaction')
      .where('royaltyTransaction.originalPaymentId = :paymentId', {
        paymentId,
      })
      .andWhere('royaltyTransaction.eventType <> :allocationEvent', {
        allocationEvent: RoyaltyTransactionEventType.ALLOCATION,
      })
      .orderBy('royaltyTransaction.id', 'ASC')
      .getMany();
  }

  async hasPaymentRecognition(
    manager: EntityManager,
    paymentId: number,
  ): Promise<boolean> {
    const count = await manager.getRepository(RoyaltyTransaction).count({
      where: {
        originalPaymentId: paymentId,
        eventType: In([
          RoyaltyTransactionEventType.PAYMENT_RECEIVED,
          RoyaltyTransactionEventType.OPENING_CREDIT,
        ]),
      },
    });
    return count > 0;
  }

  async hasProcessedAllocation(
    manager: EntityManager,
    sourceType: RoyaltyTransactionSourceType,
    sourceId: number,
  ): Promise<boolean> {
    const count = await manager.getRepository(RoyaltyTransaction).count({
      where: {
        sourceType,
        sourceId,
        eventType: In([
          RoyaltyTransactionEventType.ALLOCATION,
          RoyaltyTransactionEventType.TRANSFER_OUT,
        ]),
      },
    });
    return count > 0;
  }

  async findRecognitionBalances(
    manager: EntityManager,
    originalPaymentId: number,
    locationId?: number,
  ): Promise<RoyaltyRecognitionBalance[]> {
    return this.loadRecognitionBalances(
      manager,
      originalPaymentId,
      locationId,
      true,
    );
  }

  async findRecognitionBalancesReadOnly(
    manager: EntityManager,
    originalPaymentId: number,
    locationId?: number,
  ): Promise<RoyaltyRecognitionBalance[]> {
    return this.loadRecognitionBalances(
      manager,
      originalPaymentId,
      locationId,
      false,
    );
  }

  async findInvoiceCreditBalances(
    manager: EntityManager,
    invoiceCreditId: number,
    locationId?: number,
  ): Promise<RoyaltyRecognitionBalance[]> {
    return this.loadBalances(
      manager,
      {
        ...(locationId === undefined ? {} : { locationId }),
        eventType: RoyaltyTransactionEventType.TRANSFER_IN,
        sourceType: RoyaltyTransactionSourceType.INVOICE_RETURN,
        sourceId: invoiceCreditId,
      },
      true,
    );
  }

  private async loadRecognitionBalances(
    manager: EntityManager,
    originalPaymentId: number,
    locationId: number | undefined,
    lockRows: boolean,
  ): Promise<RoyaltyRecognitionBalance[]> {
    return this.loadBalances(
      manager,
      {
        originalPaymentId,
        ...(locationId === undefined ? {} : { locationId }),
        eventType: In([
          RoyaltyTransactionEventType.PAYMENT_RECEIVED,
          RoyaltyTransactionEventType.OPENING_CREDIT,
        ]),
        sourceType: In([
          RoyaltyTransactionSourceType.PAYMENT,
          RoyaltyTransactionSourceType.RECURRING_PAYMENT,
          RoyaltyTransactionSourceType.MIGRATION,
        ]),
      },
      lockRows,
    );
  }

  private async loadBalances(
    manager: EntityManager,
    where: FindManyOptions<RoyaltyTransaction>['where'],
    lockRows: boolean,
  ): Promise<RoyaltyRecognitionBalance[]> {
    const repository = manager.getRepository(RoyaltyTransaction);
    const recognitionOptions: FindManyOptions<RoyaltyTransaction> = {
      where,
      order: { id: 'ASC' },
    };
    if (lockRows) {
      recognitionOptions.lock = { mode: 'pessimistic_write' };
    }
    const recognitions = await repository.find(recognitionOptions);
    if (recognitions.length === 0) {
      return [];
    }

    const adjustments = await repository.find({
      where: {
        relatedRoyaltyTransactionId: In(
          recognitions.map((recognition) => recognition.id),
        ),
        eventType: In([
          RoyaltyTransactionEventType.ALLOCATION,
          RoyaltyTransactionEventType.REFUND,
          RoyaltyTransactionEventType.TRANSFER_OUT,
          RoyaltyTransactionEventType.RECLASSIFICATION,
        ]),
      },
    });
    const adjustmentTotals = new Map<
      number,
      {
        payment: number;
        revenue: number;
        tax: number;
        royalty: number;
        advertisement: number;
      }
    >();
    const reportAdjustmentTotals = new Map<
      number,
      { revenue: number; tax: number; royalty: number; advertisement: number }
    >();
    for (const adjustment of adjustments) {
      const recognitionId = Number(adjustment.relatedRoyaltyTransactionId);
      if (
        adjustment.eventType !== RoyaltyTransactionEventType.RECLASSIFICATION
      ) {
        const totals = adjustmentTotals.get(recognitionId) || {
          payment: 0,
          revenue: 0,
          tax: 0,
          royalty: 0,
          advertisement: 0,
        };
        totals.payment += Number(adjustment.paymentAmount || 0);
        totals.revenue += Number(adjustment.revenueAmount || 0);
        totals.tax += Number(adjustment.taxAmount || 0);
        totals.royalty += Number(adjustment.royaltyAmount || 0);
        totals.advertisement += Number(adjustment.advertisementAmount || 0);
        adjustmentTotals.set(recognitionId, totals);
      }
      if (adjustment.eventType !== RoyaltyTransactionEventType.ALLOCATION) {
        const reportTotals = reportAdjustmentTotals.get(recognitionId) || {
          revenue: 0,
          tax: 0,
          royalty: 0,
          advertisement: 0,
        };
        reportTotals.revenue += Number(adjustment.revenueAmount || 0);
        reportTotals.tax += Number(adjustment.taxAmount || 0);
        reportTotals.royalty += Number(adjustment.royaltyAmount || 0);
        reportTotals.advertisement += Number(
          adjustment.advertisementAmount || 0,
        );
        reportAdjustmentTotals.set(recognitionId, reportTotals);
      }
    }

    return recognitions
      .map((transaction) => {
        const totals = adjustmentTotals.get(transaction.id) || {
          payment: 0,
          revenue: 0,
          tax: 0,
          royalty: 0,
          advertisement: 0,
        };
        const reportTotals = reportAdjustmentTotals.get(transaction.id) || {
          revenue: 0,
          tax: 0,
          royalty: 0,
          advertisement: 0,
        };
        return {
          transaction,
          remainingPaymentAmount:
            Number(transaction.paymentAmount) + totals.payment,
          remainingRevenueAmount:
            Number(transaction.revenueAmount) + totals.revenue,
          remainingTaxAmount: Number(transaction.taxAmount) + totals.tax,
          activeRevenueAmount:
            Number(transaction.revenueAmount) + reportTotals.revenue,
          activeTaxAmount: Number(transaction.taxAmount) + reportTotals.tax,
          activeAdvertisementAmount:
            Number(transaction.advertisementAmount || 0) +
            reportTotals.advertisement,
          activeRoyaltyAmount:
            Number(transaction.royaltyAmount) + reportTotals.royalty,
        };
      })
      .filter((balance) => balance.remainingPaymentAmount > 0.00001);
  }

  async createOnce(
    manager: EntityManager,
    transaction: RoyaltyTransaction,
  ): Promise<RoyaltyTransaction> {
    const repository = manager.getRepository(RoyaltyTransaction);
    const existing = await repository.findOne({
      where: { idempotencyKey: transaction.idempotencyKey },
    });

    if (existing) {
      this.assertSameEvent(existing, transaction);
      return existing;
    }

    try {
      return await repository.save(transaction);
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) {
        throw error;
      }

      const concurrentExisting = await repository.findOne({
        where: { idempotencyKey: transaction.idempotencyKey },
      });
      if (!concurrentExisting) {
        throw error;
      }

      this.assertSameEvent(concurrentExisting, transaction);
      return concurrentExisting;
    }
  }

  private assertSameEvent(
    existing: RoyaltyTransaction,
    requested: RoyaltyTransaction,
  ): void {
    const same =
      this.sameNullableNumber(existing.paymentId, requested.paymentId) &&
      this.sameNullableNumber(
        existing.originalPaymentId,
        requested.originalPaymentId,
      ) &&
      Number(existing.locationId) === Number(requested.locationId) &&
      Number(existing.customerId) === Number(requested.customerId) &&
      Number(existing.itemCategoryId) === Number(requested.itemCategoryId) &&
      existing.categoryName === requested.categoryName &&
      this.sameMoney(existing.rateApplied, requested.rateApplied) &&
      this.sameMoney(
        existing.advertisementRateApplied ?? 0,
        requested.advertisementRateApplied ?? 0,
      ) &&
      this.sameMoney(
        existing.advertisementAmount ?? 0,
        requested.advertisementAmount ?? 0,
      ) &&
      this.sameMoney(existing.paymentAmount, requested.paymentAmount) &&
      this.sameMoney(existing.revenueAmount, requested.revenueAmount) &&
      this.sameMoney(existing.taxAmount, requested.taxAmount) &&
      this.sameMoney(existing.royaltyAmount, requested.royaltyAmount) &&
      Boolean(existing.royaltyFree) === Boolean(requested.royaltyFree) &&
      existing.eventType === requested.eventType &&
      this.sameDate(existing.effectiveDate, requested.effectiveDate) &&
      existing.sourceType === requested.sourceType &&
      this.sameNullableNumber(existing.sourceId, requested.sourceId) &&
      this.sameNullableNumber(
        existing.relatedRoyaltyTransactionId,
        requested.relatedRoyaltyTransactionId,
      ) &&
      (existing.eventGroupId || null) === (requested.eventGroupId || null) &&
      (existing.reason || null) === (requested.reason || null);

    if (!same) {
      throw new Error(
        `Royalty transaction idempotency conflict for ${requested.idempotencyKey}`,
      );
    }
  }

  private sameMoney(left: unknown, right: unknown): boolean {
    return Math.abs(Number(left) - Number(right)) < 0.00001;
  }

  private sameNullableNumber(
    left: number | null,
    right: number | null,
  ): boolean {
    if (left === null || left === undefined) {
      return right === null || right === undefined;
    }
    if (right === null || right === undefined) {
      return false;
    }
    return Number(left) === Number(right);
  }

  private sameDate(left: Date, right: Date): boolean {
    return new Date(left).getTime() === new Date(right).getTime();
  }

  private isDuplicateKeyError(error: unknown): boolean {
    const candidate = error as {
      code?: string;
      driverError?: { code?: string };
    };
    return (
      candidate?.code === 'ER_DUP_ENTRY' ||
      candidate?.driverError?.code === 'ER_DUP_ENTRY'
    );
  }
}
