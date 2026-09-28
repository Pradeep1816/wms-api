import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ItemCategory } from '../../item/entities/item-category.entity';
import { RoundingUtils } from '../../utils/rounding.utils';
import { resolveCategoryRoyaltySnapshot } from '../../utils/royality/royalty-calculation.util';
import { RoyaltyTransaction } from '../entities/royalty-transaction.entity';
import { Payment } from '../entities/payment.entity';
import {
  RoyaltyTransactionEventType,
  RoyaltyTransactionSourceType,
} from '../enums/royalty-transaction.enum';
import {
  AppliedRoyaltyPurpose,
  PaymentRoyaltyRecognitionRepository,
} from '../repositories/payment-royalty-recognition.repository';
import { RoyaltyTransactionRepository } from '../repositories/royalty-transaction.repository';
import { isRoyaltyEligiblePaymentMethod } from '../utils/royalty-payment-method.util';
import { RoyaltyLedgerService } from './royalty-ledger.service';

export interface RecognizedPaymentEditInput {
  paymentId: number;
  locationId: number;
  customerId: number;
  oldAmount: number;
  newAmount: number;
  oldBalance: number;
  oldDate: Date;
  newDate: string;
  oldPaymentMethodId: number;
  newPaymentMethodId: number;
  createdByUserId: number;
}

export interface PurposeTotal {
  isPos?: boolean;
  itemCategoryId: number;
  categoryName: string;
  rateApplied: number;
  advertisementRateApplied?: number;
  royaltyFree: boolean;
  paymentAmount: number;
  revenueAmount: number;
  taxAmount: number;
}

interface ReportableTotal extends PurposeTotal {
  royaltyAmount: number;
  advertisementAmount: number;
  relatedRoyaltyTransactionId: number;
}

export interface RoyaltyPaymentRecognitionScope {
  locationId: number;
  customerId: number;
}

export interface RestoreDeletedLessonCreditInput {
  paymentId: number;
  lessonPaymentId: number;
  locationId: number;
  customerId: number;
  amount: number;
  itemCategoryId?: number | null;
  rateApplied?: number | null;
  advertisementRateApplied?: number;
  effectiveDate: Date;
  createdByUserId?: number | null;
}

export interface ReconcileUnclassifiedCreditInput {
  paymentId: number;
  locationId: number;
  customerId: number;
  allocationAmount: number;
  classifiedAmount: number;
  effectiveDate: Date;
  sourceType: RoyaltyTransactionSourceType;
  sourceId: number;
  createdByUserId?: number | null;
}

interface RoyaltyNeutralCreditInput {
  isPos?: boolean;
  paymentId: number;
  locationId: number;
  customerId: number;
  amount: number;
  itemCategoryId: number;
  categoryName: string;
  rateApplied: number;
  advertisementRateApplied?: number;
  effectiveDate: Date;
  sourceType: RoyaltyTransactionSourceType;
  sourceId: number;
  idempotencyKey: string;
  reason: string;
  createdByUserId?: number | null;
}

/**
 * Keeps royalty accounting synchronized when an already-recognized payment is
 * corrected. Safe metadata changes and same-category reallocations do not alter
 * the ledger. Amount increases add an auditable recognition entry. Deletion
 * consumes any remaining credit and reverses the payment's report contribution.
 */
@Injectable()
export class RoyaltyPaymentCorrectionService {
  constructor(
    private readonly recognitionRepository: PaymentRoyaltyRecognitionRepository,
    private readonly royaltyTransactionRepository: RoyaltyTransactionRepository,
    private readonly royaltyLedgerService: RoyaltyLedgerService,
  ) {}

  /**
   * Restores spendable credit when a paid lesson is deleted. The paired
   * entries increase the classified balance while netting to zero reportable
   * revenue and royalty because the original payment was already recognized.
   */
  async restoreDeletedLessonCredit(
    manager: EntityManager,
    input: RestoreDeletedLessonCreditInput,
  ): Promise<boolean> {
    const payment = await manager.findOne(Payment, {
      where: { id: input.paymentId, userId: input.customerId },
    });
    if (
      !payment ||
      Number(payment.isDeleted) === 1 ||
      !isRoyaltyEligiblePaymentMethod(payment.paymentMethodId)
    ) {
      return false;
    }

    const categoryId = Number(
      input.itemCategoryId || ItemCategory.CATEGORY_LESSON,
    );
    const category = await resolveCategoryRoyaltySnapshot(
      manager,
      input.locationId,
      categoryId,
    );
    const capturedRate = Number(input.rateApplied);
    const rateApplied =
      input.rateApplied !== null &&
      input.rateApplied !== undefined &&
      Number.isFinite(capturedRate) &&
      capturedRate >= 0
        ? capturedRate
        : category.rate;

    await this.recordRoyaltyNeutralCredit(manager, {
      paymentId: input.paymentId,
      locationId: input.locationId,
      customerId: input.customerId,
      amount: input.amount,
      itemCategoryId: category.categoryId,
      categoryName: category.categoryName,
      rateApplied,
      advertisementRateApplied:
        input.advertisementRateApplied ?? category.advertisementRate,
      effectiveDate: input.effectiveDate,
      sourceType: RoyaltyTransactionSourceType.LESSON_PAYMENT,
      sourceId: input.lessonPaymentId,
      idempotencyKey: `royalty:lesson-delete:${input.lessonPaymentId}:credit-restored`,
      reason: 'Paid lesson deleted; credit restored to customer account',
      createdByUserId: input.createdByUserId,
    });
    return true;
  }

  /**
   * Repairs credit that was returned before lesson-deletion ledger handling
   * was introduced. Existing historical credit defaults to Lesson at the
   * location's current rate, without recognizing revenue or royalty again.
   */
  async reconcileUnclassifiedCreditForAllocation(
    manager: EntityManager,
    input: ReconcileUnclassifiedCreditInput,
  ): Promise<boolean> {
    const payment = await manager.findOne(Payment, {
      where: { id: input.paymentId, userId: input.customerId },
    });
    if (
      !payment ||
      Number(payment.isDeleted) === 1 ||
      !isRoyaltyEligiblePaymentMethod(payment.paymentMethodId)
    ) {
      return false;
    }

    const creditBeforeAllocation = this.round4(
      Math.max(0, Number(payment.balance)) + Number(input.allocationAmount),
    );
    const unclassifiedAmount = this.round4(
      creditBeforeAllocation - Number(input.classifiedAmount),
    );
    if (unclassifiedAmount <= 0.0001) {
      return false;
    }

    const category = await resolveCategoryRoyaltySnapshot(
      manager,
      input.locationId,
      ItemCategory.CATEGORY_LESSON,
    );
    await this.recordRoyaltyNeutralCredit(manager, {
      paymentId: input.paymentId,
      locationId: input.locationId,
      customerId: input.customerId,
      amount: unclassifiedAmount,
      itemCategoryId: category.categoryId,
      categoryName: category.categoryName,
      rateApplied: category.rate,
      advertisementRateApplied: category.advertisementRate,
      effectiveDate: input.effectiveDate,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      idempotencyKey: `royalty:allocation-reconciliation:${input.sourceType}:${input.sourceId}:${input.paymentId}`,
      reason: 'Historical customer credit classified as Lesson when reused',
      createdByUserId: input.createdByUserId,
    });
    return true;
  }

  async getRecognitionScope(
    manager: EntityManager,
    paymentId: number,
  ): Promise<RoyaltyPaymentRecognitionScope> {
    const recognitions =
      await this.royaltyTransactionRepository.findPaymentRecognitions(
        manager,
        paymentId,
      );
    const scopes = new Map<string, RoyaltyPaymentRecognitionScope>();
    for (const recognition of recognitions) {
      const scope = {
        locationId: Number(recognition.locationId),
        customerId: Number(recognition.customerId),
      };
      scopes.set(`${scope.locationId}:${scope.customerId}`, scope);
    }
    if (scopes.size !== 1) {
      throw new BadRequestException(
        'Royalty-recognized payment scope could not be resolved safely.',
      );
    }
    return [...scopes.values()][0];
  }

  async captureAppliedPurposes(
    manager: EntityManager,
    paymentId: number,
    locationId: number,
    unappliedBalance = 0,
  ): Promise<PurposeTotal[]> {
    const purposes = await this.recognitionRepository.getAppliedPurposes(
      manager,
      paymentId,
      locationId,
    );
    const totals = this.summarizePurposes(purposes);
    const balance = this.round4(Math.max(0, Number(unappliedBalance)));
    if (balance <= 0.0001) {
      return totals;
    }

    const recognitions =
      await this.royaltyTransactionRepository.findPaymentRecognitions(
        manager,
        paymentId,
      );
    const classifications = this.getRecognitionClassifications(recognitions);
    if (classifications.size !== 1) {
      // Metadata-only edits remain safe for older split-purpose payments. A
      // later financial change is still rejected by the reconciliation check.
      return totals;
    }
    const source = [...classifications.values()][0];
    const sourceKey = this.transactionKey(source);
    const sourceTotal = totals.find(
      (total) => this.totalKey(total) === sourceKey,
    );
    if (sourceTotal) {
      sourceTotal.paymentAmount = this.round4(
        sourceTotal.paymentAmount + balance,
      );
      sourceTotal.revenueAmount = this.round4(
        sourceTotal.revenueAmount + balance,
      );
      return totals;
    }
    totals.push({
      itemCategoryId: source.itemCategoryId,
      categoryName: source.categoryName,
      isPos: source.isPos,
      rateApplied: Number(source.rateApplied),
      advertisementRateApplied: source.advertisementRateApplied ?? 0,
      royaltyFree: Boolean(source.royaltyFree),
      paymentAmount: balance,
      revenueAmount: balance,
      taxAmount: 0,
    });
    return totals;
  }

  validateRecognizedEditBeforeSave(input: RecognizedPaymentEditInput): void {
    const oldAmount = this.round2(input.oldAmount);
    const newAmount = this.round2(input.newAmount);
    if (newAmount < oldAmount) {
      throw new BadRequestException(
        'Royalty-recognized payment amounts cannot be reduced. Use the refund workflow so the reversal remains auditable.',
      );
    }

    if (!this.isSameDate(input.oldDate, input.newDate)) {
      throw new BadRequestException(
        'The date of a royalty-recognized payment cannot be changed. Use an auditable correction workflow.',
      );
    }

    const oldEligible = isRoyaltyEligiblePaymentMethod(
      input.oldPaymentMethodId,
    );
    const newEligible = isRoyaltyEligiblePaymentMethod(
      input.newPaymentMethodId,
    );
    if (oldEligible !== newEligible) {
      throw new BadRequestException(
        'This payment-method change would alter royalty eligibility and requires an auditable correction.',
      );
    }
  }

  async reconcileRecognizedEdit(
    manager: EntityManager,
    input: RecognizedPaymentEditInput,
    beforePurposes: PurposeTotal[],
    newBalance: number,
  ): Promise<void> {
    const afterPurposes = await this.captureAppliedPurposes(
      manager,
      input.paymentId,
      input.locationId,
      newBalance,
    );
    const amountIncrease = this.round2(input.newAmount - input.oldAmount);
    const releasedCredit = this.round2(
      Number(newBalance) - Number(input.oldBalance) - amountIncrease,
    );
    if (releasedCredit < -0.01) {
      throw new BadRequestException(
        'Apply existing payment credit through Receive Payment so the allocation remains auditable.',
      );
    }

    if (amountIncrease === 0) {
      this.assertPurposeTotalsEqual(beforePurposes, afterPurposes);
      if (releasedCredit > 0.01) {
        await this.recordReleasedCredit(manager, input, releasedCredit);
      }
      return;
    }

    const recognitions =
      await this.royaltyTransactionRepository.findPaymentRecognitions(
        manager,
        input.paymentId,
      );
    const source = this.getSingleRecognitionClassification(recognitions);
    const purposeDelta = this.getPurposeDelta(
      beforePurposes,
      afterPurposes,
      source,
    );
    if (
      purposeDelta.paymentAmount < -0.01 ||
      purposeDelta.paymentAmount - amountIncrease > 0.01
    ) {
      throw new BadRequestException(
        'The payment correction changes royalty allocation beyond the amount increase.',
      );
    }

    const unappliedIncrease = this.round4(
      amountIncrease - purposeDelta.paymentAmount,
    );
    const revenueIncrease = this.round4(
      purposeDelta.revenueAmount + unappliedIncrease,
    );

    await this.royaltyLedgerService.recordEvent(manager, {
      paymentId: input.paymentId,
      originalPaymentId: input.paymentId,
      locationId: input.locationId,
      customerId: input.customerId,
      itemCategoryId: source.itemCategoryId,
      categoryName: source.categoryName,
      isPos: source.isPos,
      rateApplied: Number(source.rateApplied),
      advertisementRateApplied: source.advertisementRateApplied ?? 0,
      paymentAmount: amountIncrease,
      revenueAmount: revenueIncrease,
      taxAmount: purposeDelta.taxAmount,
      royaltyFree: Boolean(source.royaltyFree),
      eventType: RoyaltyTransactionEventType.PAYMENT_RECEIVED,
      effectiveDate: input.oldDate,
      sourceType: source.sourceType,
      sourceId: input.paymentId,
      relatedRoyaltyTransactionId: source.id,
      eventGroupId: `payment-correction:${input.paymentId}`,
      idempotencyKey: `royalty:payment-correction:${input.paymentId}:increase:${this.round2(input.oldAmount)}:${this.round2(input.newAmount)}`,
      reason: `Payment amount corrected from ${this.round2(input.oldAmount).toFixed(2)} to ${this.round2(input.newAmount).toFixed(2)}`,
      createdByUserId: input.createdByUserId,
    });
    if (releasedCredit > 0.01) {
      await this.recordReleasedCredit(manager, input, releasedCredit);
    }
  }

  async reverseRecognizedPaymentForDeletion(
    manager: EntityManager,
    paymentId: number,
    effectiveDate: Date,
    createdByUserId: number,
  ): Promise<void> {
    const [remainingBalances, reportableEvents] = await Promise.all([
      this.royaltyTransactionRepository.findRecognitionBalances(
        manager,
        paymentId,
      ),
      this.royaltyTransactionRepository.findReportablePaymentEvents(
        manager,
        paymentId,
      ),
    ]);

    for (const balance of remainingBalances) {
      const transaction = balance.transaction;
      await this.royaltyLedgerService.recordEvent(manager, {
        paymentId,
        originalPaymentId: paymentId,
        locationId: transaction.locationId,
        customerId: transaction.customerId,
        itemCategoryId: transaction.itemCategoryId,
        categoryName: transaction.categoryName,
        isPos: transaction.isPos,
        rateApplied: Number(transaction.rateApplied),
        advertisementRateApplied: transaction.advertisementRateApplied ?? 0,
        paymentAmount: -this.round4(balance.remainingPaymentAmount),
        revenueAmount: -this.round4(balance.remainingRevenueAmount),
        taxAmount: -this.round4(balance.remainingTaxAmount),
        royaltyAmount: 0,
        royaltyFree: Boolean(transaction.royaltyFree),
        eventType: RoyaltyTransactionEventType.ALLOCATION,
        effectiveDate,
        sourceType: RoyaltyTransactionSourceType.MANUAL_ADJUSTMENT,
        sourceId: paymentId,
        relatedRoyaltyTransactionId: transaction.id,
        eventGroupId: `payment-delete:${paymentId}`,
        idempotencyKey: `royalty:payment-delete:${paymentId}:consume:${transaction.id}`,
        reason: 'Remaining credit removed when payment was deleted',
        createdByUserId,
      });
    }

    for (const total of this.summarizeReportableEvents(reportableEvents)) {
      if (
        Math.abs(total.paymentAmount) <= 0.0001 &&
        Math.abs(total.revenueAmount) <= 0.0001 &&
        Math.abs(total.taxAmount) <= 0.0001 &&
        Math.abs(total.royaltyAmount) <= 0.0001 &&
        Math.abs(total.advertisementAmount) <= 0.0001
      ) {
        continue;
      }
      await this.royaltyLedgerService.recordEvent(manager, {
        paymentId,
        originalPaymentId: paymentId,
        locationId: reportableEvents[0].locationId,
        customerId: reportableEvents[0].customerId,
        itemCategoryId: total.itemCategoryId,
        categoryName: total.categoryName,
        isPos: total.isPos,
        rateApplied: total.rateApplied,
        advertisementRateApplied: total.advertisementRateApplied ?? 0,
        paymentAmount: -this.round4(total.paymentAmount),
        revenueAmount: -this.round4(total.revenueAmount),
        taxAmount: -this.round4(total.taxAmount),
        royaltyAmount: -this.round2(total.royaltyAmount),
        advertisementAmount: -this.round2(total.advertisementAmount),
        royaltyFree: total.royaltyFree,
        eventType: RoyaltyTransactionEventType.RECLASSIFICATION,
        effectiveDate,
        sourceType: RoyaltyTransactionSourceType.MANUAL_ADJUSTMENT,
        sourceId: paymentId,
        relatedRoyaltyTransactionId: total.relatedRoyaltyTransactionId,
        eventGroupId: `payment-delete:${paymentId}`,
        idempotencyKey: `royalty:payment-delete:${paymentId}:reverse:${this.compactTotalKey(total)}:${total.relatedRoyaltyTransactionId}`,
        reason: 'Royalty recognition reversed because the payment was deleted',
        createdByUserId,
      });
    }
  }

  private getSingleRecognitionClassification(
    recognitions: RoyaltyTransaction[],
  ): RoyaltyTransaction {
    const classifications = this.getRecognitionClassifications(recognitions);
    if (classifications.size !== 1) {
      throw new BadRequestException(
        'Increasing a payment with multiple royalty classifications requires a separate payment.',
      );
    }
    return [...classifications.values()][0];
  }

  private async recordReleasedCredit(
    manager: EntityManager,
    input: RecognizedPaymentEditInput,
    amount: number,
  ): Promise<void> {
    const recognitions =
      await this.royaltyTransactionRepository.findPaymentRecognitions(
        manager,
        input.paymentId,
      );
    const source = this.getSingleRecognitionClassification(recognitions);
    const opening = await this.royaltyLedgerService.recordEvent(manager, {
      paymentId: input.paymentId,
      originalPaymentId: input.paymentId,
      locationId: input.locationId,
      customerId: input.customerId,
      itemCategoryId: source.itemCategoryId,
      categoryName: source.categoryName,
      isPos: source.isPos,
      rateApplied: Number(source.rateApplied),
      advertisementRateApplied: source.advertisementRateApplied ?? 0,
      paymentAmount: amount,
      revenueAmount: amount,
      taxAmount: 0,
      royaltyFree: Boolean(source.royaltyFree),
      eventType: RoyaltyTransactionEventType.OPENING_CREDIT,
      effectiveDate: input.oldDate,
      sourceType: source.sourceType,
      sourceId: input.paymentId,
      relatedRoyaltyTransactionId: source.id,
      eventGroupId: `payment-correction:${input.paymentId}`,
      idempotencyKey: `royalty:payment-correction:${input.paymentId}:released-credit:${this.round2(input.oldBalance)}:${this.round2(input.oldBalance + amount)}`,
      reason: 'Lesson allocation corrected and returned to payment credit',
      createdByUserId: input.createdByUserId,
    });
    await this.royaltyLedgerService.recordEvent(manager, {
      paymentId: input.paymentId,
      originalPaymentId: input.paymentId,
      locationId: input.locationId,
      customerId: input.customerId,
      itemCategoryId: source.itemCategoryId,
      categoryName: source.categoryName,
      isPos: source.isPos,
      rateApplied: Number(source.rateApplied),
      advertisementRateApplied: source.advertisementRateApplied ?? 0,
      paymentAmount: -amount,
      revenueAmount: -amount,
      taxAmount: 0,
      royaltyFree: Boolean(source.royaltyFree),
      eventType: RoyaltyTransactionEventType.RECLASSIFICATION,
      effectiveDate: input.oldDate,
      sourceType: RoyaltyTransactionSourceType.MANUAL_ADJUSTMENT,
      sourceId: input.paymentId,
      relatedRoyaltyTransactionId: opening.id,
      eventGroupId: `payment-correction:${input.paymentId}`,
      idempotencyKey: `royalty:payment-correction:${input.paymentId}:released-credit-offset:${opening.id}`,
      reason:
        'Offset prevents duplicate royalty when corrected credit is reused',
      createdByUserId: input.createdByUserId,
    });
  }

  private async recordRoyaltyNeutralCredit(
    manager: EntityManager,
    input: RoyaltyNeutralCreditInput,
  ): Promise<void> {
    const amount = this.round4(input.amount);
    if (amount <= 0.0001) {
      return;
    }

    const opening = await this.royaltyLedgerService.recordEvent(manager, {
      paymentId: input.paymentId,
      originalPaymentId: input.paymentId,
      locationId: input.locationId,
      customerId: input.customerId,
      itemCategoryId: input.itemCategoryId,
      categoryName: input.categoryName,
      isPos: input.isPos,
      rateApplied: input.rateApplied,
      advertisementRateApplied: input.advertisementRateApplied ?? 0,
      paymentAmount: amount,
      revenueAmount: amount,
      taxAmount: 0,
      royaltyFree: false,
      eventType: RoyaltyTransactionEventType.OPENING_CREDIT,
      effectiveDate: input.effectiveDate,
      sourceType: RoyaltyTransactionSourceType.PAYMENT,
      sourceId: input.paymentId,
      eventGroupId: input.idempotencyKey,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      createdByUserId: input.createdByUserId,
    });
    await this.royaltyLedgerService.recordEvent(manager, {
      paymentId: input.paymentId,
      originalPaymentId: input.paymentId,
      locationId: input.locationId,
      customerId: input.customerId,
      itemCategoryId: input.itemCategoryId,
      categoryName: input.categoryName,
      isPos: input.isPos,
      rateApplied: input.rateApplied,
      advertisementRateApplied: input.advertisementRateApplied ?? 0,
      paymentAmount: -amount,
      revenueAmount: -amount,
      taxAmount: 0,
      royaltyFree: false,
      eventType: RoyaltyTransactionEventType.RECLASSIFICATION,
      effectiveDate: input.effectiveDate,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      relatedRoyaltyTransactionId: opening.id,
      eventGroupId: input.idempotencyKey,
      idempotencyKey: `${input.idempotencyKey}:report-offset`,
      reason: 'Offset prevents duplicate royalty on restored customer credit',
      createdByUserId: input.createdByUserId,
    });
  }

  private getRecognitionClassifications(
    recognitions: RoyaltyTransaction[],
  ): Map<string, RoyaltyTransaction> {
    const classifications = new Map<string, RoyaltyTransaction>();
    for (const recognition of recognitions) {
      classifications.set(this.transactionKey(recognition), recognition);
    }
    return classifications;
  }

  private getPurposeDelta(
    before: PurposeTotal[],
    after: PurposeTotal[],
    source: RoyaltyTransaction,
  ): PurposeTotal {
    const sourceKey = this.transactionKey(source);
    const beforeMap = new Map(
      before.map((total) => [this.totalKey(total), total]),
    );
    const afterMap = new Map(
      after.map((total) => [this.totalKey(total), total]),
    );
    const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
    let sourceDelta: PurposeTotal | null = null;

    for (const key of keys) {
      const oldTotal = beforeMap.get(key);
      const newTotal = afterMap.get(key);
      const delta = this.subtractTotals(newTotal, oldTotal);
      if (key === sourceKey) {
        sourceDelta = delta;
        continue;
      }
      if (!this.isZeroPurpose(delta)) {
        throw new BadRequestException(
          'The payment correction changes its royalty category or captured rate. Use the credit-transfer workflow.',
        );
      }
    }

    return (
      sourceDelta || {
        itemCategoryId: source.itemCategoryId,
        categoryName: source.categoryName,
        isPos: source.isPos,
        rateApplied: Number(source.rateApplied),
        advertisementRateApplied: source.advertisementRateApplied ?? 0,
        royaltyFree: Boolean(source.royaltyFree),
        paymentAmount: 0,
        revenueAmount: 0,
        taxAmount: 0,
      }
    );
  }

  private assertPurposeTotalsEqual(
    before: PurposeTotal[],
    after: PurposeTotal[],
  ): void {
    const beforeMap = new Map(
      before.map((total) => [this.totalKey(total), total]),
    );
    const afterMap = new Map(
      after.map((total) => [this.totalKey(total), total]),
    );
    const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
    for (const key of keys) {
      if (
        !this.isZeroPurpose(
          this.subtractTotals(afterMap.get(key), beforeMap.get(key)),
        )
      ) {
        throw new BadRequestException(
          'Royalty-recognized payments may only be reallocated within the same category and captured rate.',
        );
      }
    }
  }

  private summarizePurposes(purposes: AppliedRoyaltyPurpose[]): PurposeTotal[] {
    const grouped = new Map<string, PurposeTotal>();
    for (const purpose of purposes) {
      const key = this.totalKey(purpose);
      const total = grouped.get(key) || {
        itemCategoryId: purpose.itemCategoryId,
        categoryName: purpose.categoryName,
        isPos: purpose.isPos,
        rateApplied: Number(purpose.rateApplied),
        advertisementRateApplied: purpose.advertisementRateApplied ?? 0,
        royaltyFree: Boolean(purpose.royaltyFree),
        paymentAmount: 0,
        revenueAmount: 0,
        taxAmount: 0,
      };
      total.paymentAmount = this.round4(
        total.paymentAmount + Number(purpose.paymentAmount),
      );
      total.revenueAmount = this.round4(
        total.revenueAmount + Number(purpose.revenueAmount),
      );
      total.taxAmount = this.round4(
        total.taxAmount + Number(purpose.taxAmount),
      );
      grouped.set(key, total);
    }
    return [...grouped.values()];
  }

  private summarizeReportableEvents(
    events: RoyaltyTransaction[],
  ): ReportableTotal[] {
    const grouped = new Map<string, ReportableTotal>();
    for (const event of events) {
      const key = this.transactionKey(event);
      const total = grouped.get(key) || {
        itemCategoryId: event.itemCategoryId,
        categoryName: event.categoryName,
        isPos: event.isPos,
        rateApplied: Number(event.rateApplied),
        advertisementRateApplied: event.advertisementRateApplied ?? 0,
        royaltyFree: Boolean(event.royaltyFree),
        paymentAmount: 0,
        revenueAmount: 0,
        taxAmount: 0,
        royaltyAmount: 0,
        advertisementAmount: 0,
        relatedRoyaltyTransactionId: event.id,
      };
      total.paymentAmount = this.round4(
        total.paymentAmount + Number(event.paymentAmount),
      );
      total.revenueAmount = this.round4(
        total.revenueAmount + Number(event.revenueAmount),
      );
      total.taxAmount = this.round4(total.taxAmount + Number(event.taxAmount));
      total.royaltyAmount = this.round2(
        total.royaltyAmount + Number(event.royaltyAmount),
      );
      total.advertisementAmount = this.round2(
        total.advertisementAmount + Number(event.advertisementAmount || 0),
      );
      grouped.set(key, total);
    }
    return [...grouped.values()];
  }

  private subtractTotals(
    left?: PurposeTotal,
    right?: PurposeTotal,
  ): PurposeTotal {
    const source = left || right!;
    return {
      itemCategoryId: source.itemCategoryId,
      categoryName: source.categoryName,
      isPos: source.isPos,
      rateApplied: source.rateApplied,
      advertisementRateApplied: source.advertisementRateApplied ?? 0,
      royaltyFree: source.royaltyFree,
      paymentAmount: this.round4(
        Number(left?.paymentAmount || 0) - Number(right?.paymentAmount || 0),
      ),
      revenueAmount: this.round4(
        Number(left?.revenueAmount || 0) - Number(right?.revenueAmount || 0),
      ),
      taxAmount: this.round4(
        Number(left?.taxAmount || 0) - Number(right?.taxAmount || 0),
      ),
    };
  }

  private isZeroPurpose(total: PurposeTotal): boolean {
    return (
      Math.abs(total.paymentAmount) <= 0.01 &&
      Math.abs(total.revenueAmount) <= 0.01 &&
      Math.abs(total.taxAmount) <= 0.01
    );
  }

  private totalKey(total: {
    isPos?: boolean;
    itemCategoryId: number;
    categoryName: string;
    rateApplied: number;
    advertisementRateApplied?: number;
    royaltyFree: boolean;
  }): string {
    return [
      total.itemCategoryId,
      total.categoryName,
      Number(total.rateApplied).toFixed(2),
      Number(total.advertisementRateApplied ?? 0).toFixed(2),
      total.royaltyFree ? 1 : 0,
    ].join(':') + (total.isPos ? ':POS' : '');
  }

  private transactionKey(transaction: RoyaltyTransaction): string {
    return this.totalKey({
      itemCategoryId: transaction.itemCategoryId,
      categoryName: transaction.categoryName,
      isPos: transaction.isPos,
      rateApplied: Number(transaction.rateApplied),
      advertisementRateApplied: transaction.advertisementRateApplied ?? 0,
      royaltyFree: Boolean(transaction.royaltyFree),
    });
  }

  private compactTotalKey(total: {
    isPos?: boolean;
    itemCategoryId: number;
    rateApplied: number;
    advertisementRateApplied?: number;
    royaltyFree: boolean;
  }): string {
    return [
      total.itemCategoryId,
      Number(total.rateApplied).toFixed(2),
      Number(total.advertisementRateApplied ?? 0).toFixed(2),
      total.royaltyFree ? 1 : 0,
    ].join(':') + (total.isPos ? ':POS' : '');
  }

  private isSameDate(date: Date, dateString: string): boolean {
    const current = new Date(date);
    const currentDate = [
      current.getUTCFullYear(),
      String(current.getUTCMonth() + 1).padStart(2, '0'),
      String(current.getUTCDate()).padStart(2, '0'),
    ].join('-');
    return currentDate === dateString.substring(0, 10);
  }

  private round2(value: number): number {
    return RoundingUtils.roundHalfUp(Number(value), 2);
  }

  private round4(value: number): number {
    return RoundingUtils.roundHalfUp(Number(value), 4);
  }
}
