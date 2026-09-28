import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ItemCategory } from '../../item/entities/item-category.entity';
import { RoundingUtils } from '../../utils/rounding.utils';
import { calculateRoyaltyAmount } from '../../utils/royality/royalty-calculation.util';
import {
  RoyaltyTransactionEventType,
  RoyaltyTransactionSourceType,
} from '../enums/royalty-transaction.enum';
import {
  AppliedRoyaltyPurpose,
  PaymentRoyaltyRecognitionRepository,
} from '../repositories/payment-royalty-recognition.repository';
import {
  RoyaltyRecognitionBalance,
  RoyaltyTransactionRepository,
} from '../repositories/royalty-transaction.repository';
import {
  RoyaltyCreditAllocation,
  RoyaltyInvoiceCreditAllocation,
} from './receive-payment/receive-payment.types';
import { RoyaltyLedgerService } from './royalty-ledger.service';
import { RoyaltyPaymentCorrectionService } from './royalty-payment-correction.service';

interface ProcessCreditAllocationInput extends RoyaltyCreditAllocation {
  locationId: number;
  customerId: number;
  effectiveDate: Date;
  createdByUserId: number;
}

interface ProcessInvoiceCreditAllocationInput extends RoyaltyInvoiceCreditAllocation {
  locationId: number;
  customerId: number;
  effectiveDate: Date;
  createdByUserId: number;
}

interface RecordInvoiceCreditRefundInput {
  invoiceCreditId: number;
  refundPaymentId: number;
  locationId: number;
  customerId: number;
  amount: number;
  effectiveDate: Date;
  reason?: string | null;
  createdByUserId: number;
}

interface RecordCreditRefundInput {
  originalPaymentId: number;
  refundPaymentId: number;
  locationId: number;
  customerId: number;
  amount: number;
  effectiveDate: Date;
  reason?: string | null;
  createdByUserId: number;
  categoryAllocations?: RoyaltyRefundCategoryAllocation[];
}

export interface RoyaltyRefundCategoryAllocation {
  itemCategoryId: number;
  amount: number;
}

interface RemainingPurpose extends AppliedRoyaltyPurpose {
  remainingPaymentAmount: number;
  remainingRevenueAmount: number;
  remainingTaxAmount: number;
  remainingRoyaltyAmount: number;
  remainingAdvertisementAmount: number;
}

@Injectable()
export class PaymentRoyaltyAdjustmentService {
  constructor(
    private readonly recognitionRepository: PaymentRoyaltyRecognitionRepository,
    private readonly royaltyTransactionRepository: RoyaltyTransactionRepository,
    private readonly royaltyLedgerService: RoyaltyLedgerService,
    private readonly royaltyPaymentCorrectionService: RoyaltyPaymentCorrectionService,
  ) {}

  async processCreditAllocation(
    manager: EntityManager,
    input: ProcessCreditAllocationInput,
  ): Promise<void> {
    if (
      await this.royaltyTransactionRepository.hasProcessedAllocation(
        manager,
        input.sourceType,
        input.allocationId,
      )
    ) {
      return;
    }
    let sourceBalances =
      await this.royaltyTransactionRepository.findRecognitionBalances(
        manager,
        input.originalPaymentId,
        input.locationId,
      );

    const classifiedCredit = sourceBalances.reduce(
      (sum, balance) => sum + Number(balance.remainingPaymentAmount || 0),
      0,
    );
    const unclassifiedCredit = this.round4(input.amount - classifiedCredit);
    if (unclassifiedCredit > 0.0001) {
      const reconciled =
        await this.royaltyPaymentCorrectionService.reconcileUnclassifiedCreditForAllocation(
          manager,
          {
            paymentId: input.originalPaymentId,
            locationId: input.locationId,
            customerId: input.customerId,
            allocationAmount: input.amount,
            classifiedAmount: classifiedCredit,
            effectiveDate: input.effectiveDate,
            sourceType: input.sourceType,
            sourceId: input.allocationId,
            createdByUserId: input.createdByUserId,
          },
        );
      if (reconciled) {
        sourceBalances =
          await this.royaltyTransactionRepository.findRecognitionBalances(
            manager,
            input.originalPaymentId,
            input.locationId,
          );
      }
    }
    if (sourceBalances.length === 0) {
      return;
    }

    await this.processAllocation(
      manager,
      input,
      sourceBalances,
      `Payment ${input.originalPaymentId}`,
    );
  }

  async processInvoiceCreditAllocation(
    manager: EntityManager,
    input: ProcessInvoiceCreditAllocationInput,
  ): Promise<void> {
    if (
      await this.royaltyTransactionRepository.hasProcessedAllocation(
        manager,
        input.sourceType,
        input.allocationId,
      )
    ) {
      return;
    }
    const sourceBalances =
      await this.royaltyTransactionRepository.findInvoiceCreditBalances(
        manager,
        input.invoiceCreditId,
        input.locationId,
      );
    if (sourceBalances.length === 0) {
      return;
    }

    await this.processAllocation(
      manager,
      input,
      sourceBalances,
      `Invoice credit ${input.invoiceCreditId}`,
    );
  }

  private async processAllocation(
    manager: EntityManager,
    input: ProcessCreditAllocationInput | ProcessInvoiceCreditAllocationInput,
    sourceBalances: RoyaltyRecognitionBalance[],
    sourceLabel: string,
  ): Promise<void> {
    const purposes = await this.recognitionRepository.getAllocationPurposes(
      manager,
      input.sourceType,
      input.allocationId,
      input.locationId,
    );
    this.assertReconciledAmount(input.amount, purposes);

    const eventGroupId = `allocation:${input.sourceType}:${input.allocationId}`;
    for (const [purposeIndex, purpose] of purposes.entries()) {
      const destination = this.toRemainingPurpose(purpose);
      while (destination.remainingPaymentAmount > 0.00001) {
        const source = this.selectSourceBalance(
          sourceBalances,
          purpose.itemCategoryId,
        );
        if (!source) {
          throw new BadRequestException(
            'The selected credit does not have enough classified credit for this allocation',
          );
        }

        const originalPaymentId =
          Number(
            source.transaction.originalPaymentId ||
              source.transaction.paymentId ||
              0,
          ) || null;

        const amount = this.round4(
          Math.min(
            source.remainingPaymentAmount,
            destination.remainingPaymentAmount,
          ),
        );
        if (
          Number(source.transaction.itemCategoryId) ===
          Number(purpose.itemCategoryId) &&
          (!(source.transaction.isPos || purpose.isPos) || (
            Boolean(source.transaction.isPos) === Boolean(purpose.isPos) &&
            Number(source.transaction.rateApplied) === Number(purpose.rateApplied) &&
            Number(source.transaction.advertisementRateApplied || 0) === Number(purpose.advertisementRateApplied || 0) &&
            Boolean(source.transaction.royaltyFree) === Boolean(purpose.royaltyFree)
          ))
        ) {
          const sourceAmounts = this.consumeSource(source, amount, false);
          const destinationAmounts = this.consumeDestination(
            destination,
            amount,
          );
          await this.royaltyLedgerService.recordEvent(manager, {
            paymentId: source.transaction.paymentId,
            originalPaymentId,
            locationId: input.locationId,
            customerId: input.customerId,
            itemCategoryId: source.transaction.itemCategoryId,
            categoryName: source.transaction.categoryName,
            isPos: source.transaction.isPos,
            rateApplied: source.transaction.rateApplied,
            advertisementRateApplied:
              source.transaction.advertisementRateApplied,
            paymentAmount: -amount,
            revenueAmount: -sourceAmounts.revenue,
            taxAmount: -sourceAmounts.tax,
            royaltyAmount: 0,
            royaltyFree: source.transaction.royaltyFree,
            eventType: RoyaltyTransactionEventType.ALLOCATION,
            effectiveDate: input.effectiveDate,
            sourceType: input.sourceType,
            sourceId: input.allocationId,
            relatedRoyaltyTransactionId: source.transaction.id,
            eventGroupId,
            idempotencyKey: `royalty:allocation:${input.sourceType}:${input.allocationId}:${purposeIndex}:${source.transaction.id}`,
            reason: `Credit applied to ${purpose.categoryName}`,
            createdByUserId: input.createdByUserId,
          });
          await this.recordSameCategoryReclassification(manager, {
            source,
            sourceAmounts,
            destinationAmounts,
            input,
            purposeIndex,
            originalPaymentId,
            eventGroupId,
          });
          continue;
        }

        const sourceAmounts = this.consumeSource(source, amount, true);
        const transferOut = await this.royaltyLedgerService.recordEvent(
          manager,
          {
            paymentId: source.transaction.paymentId,
            originalPaymentId,
            locationId: input.locationId,
            customerId: input.customerId,
            itemCategoryId: source.transaction.itemCategoryId,
            categoryName: source.transaction.categoryName,
            isPos: source.transaction.isPos,
            rateApplied: source.transaction.rateApplied,
            advertisementRateApplied:
              source.transaction.advertisementRateApplied,
            paymentAmount: -amount,
            revenueAmount: -sourceAmounts.revenue,
            taxAmount: -sourceAmounts.tax,
            royaltyAmount: -sourceAmounts.royalty,
            advertisementAmount: -sourceAmounts.advertisement,
            royaltyFree: source.transaction.royaltyFree,
            eventType: RoyaltyTransactionEventType.TRANSFER_OUT,
            effectiveDate: input.effectiveDate,
            sourceType: input.sourceType,
            sourceId: input.allocationId,
            relatedRoyaltyTransactionId: source.transaction.id,
            eventGroupId,
            idempotencyKey: `royalty:transfer-out:${input.sourceType}:${input.allocationId}:${purposeIndex}:${source.transaction.id}`,
            reason: `Credit transferred from ${source.transaction.categoryName} to ${purpose.categoryName}`,
            createdByUserId: input.createdByUserId,
          },
        );
        const destinationAmounts = this.consumeDestination(destination, amount);
        await this.royaltyLedgerService.recordEvent(manager, {
          paymentId: source.transaction.paymentId,
          originalPaymentId,
          locationId: input.locationId,
          customerId: input.customerId,
          itemCategoryId: purpose.itemCategoryId,
          categoryName: purpose.categoryName,
          isPos: purpose.isPos,
          rateApplied: purpose.royaltyFree ? 0 : purpose.rateApplied,
          advertisementRateApplied: purpose.royaltyFree
            ? 0
            : purpose.advertisementRateApplied,
          paymentAmount: amount,
          revenueAmount: destinationAmounts.revenue,
          taxAmount: destinationAmounts.tax,
          royaltyAmount: destinationAmounts.royalty,
          advertisementAmount: destinationAmounts.advertisement,
          royaltyFree: purpose.royaltyFree,
          eventType: RoyaltyTransactionEventType.TRANSFER_IN,
          effectiveDate: input.effectiveDate,
          sourceType: input.sourceType,
          sourceId: input.allocationId,
          relatedRoyaltyTransactionId: transferOut.id,
          eventGroupId,
          idempotencyKey: `royalty:transfer-in:${input.sourceType}:${input.allocationId}:${purposeIndex}:${source.transaction.id}`,
          reason: `Credit transferred to ${purpose.categoryName}`,
          createdByUserId: input.createdByUserId,
        });
      }
    }
  }

  async recordCreditRefund(
    manager: EntityManager,
    input: RecordCreditRefundInput,
  ): Promise<void> {
    const sourceBalances =
      await this.royaltyTransactionRepository.findRecognitionBalances(
        manager,
        input.originalPaymentId,
        input.locationId,
      );
    if (sourceBalances.length === 0) {
      return;
    }

    const refundAmount = this.round4(input.amount);
    const available = this.round4(
      sourceBalances.reduce(
        (sum, source) => sum + source.remainingPaymentAmount,
        0,
      ),
    );
    if (refundAmount <= 0 || refundAmount - available > 0.00001) {
      throw new BadRequestException(
        `Refund amount exceeds the classified balance for payment ${input.originalPaymentId}`,
      );
    }

    const categoryAllocations = this.resolveRefundCategoryAllocations(
      input,
      sourceBalances,
      refundAmount,
    );
    const eventGroupId = `refund:${input.refundPaymentId}:${input.originalPaymentId}`;
    for (const allocation of categoryAllocations) {
      let remainingCategoryRefund = this.round4(allocation.amount);
      const categorySources = sourceBalances.filter(
        (source) =>
          Number(source.transaction.itemCategoryId) ===
          Number(allocation.itemCategoryId),
      );
      for (const source of categorySources) {
        if (remainingCategoryRefund <= 0.00001) {
          break;
        }
        const amount = this.round4(
          Math.min(remainingCategoryRefund, source.remainingPaymentAmount),
        );
        const sourceAmounts = this.consumeSource(source, amount, true);
        await this.royaltyLedgerService.recordEvent(manager, {
          paymentId: input.refundPaymentId,
          originalPaymentId: input.originalPaymentId,
          locationId: input.locationId,
          customerId: input.customerId,
          itemCategoryId: source.transaction.itemCategoryId,
          categoryName: source.transaction.categoryName,
          isPos: source.transaction.isPos,
          rateApplied: source.transaction.rateApplied,
          advertisementRateApplied: source.transaction.advertisementRateApplied,
          paymentAmount: -amount,
          revenueAmount: -sourceAmounts.revenue,
          taxAmount: -sourceAmounts.tax,
          royaltyAmount: -sourceAmounts.royalty,
          advertisementAmount: -sourceAmounts.advertisement,
          royaltyFree: source.transaction.royaltyFree,
          eventType: RoyaltyTransactionEventType.REFUND,
          effectiveDate: input.effectiveDate,
          sourceType: RoyaltyTransactionSourceType.REFUND,
          sourceId: input.refundPaymentId,
          relatedRoyaltyTransactionId: source.transaction.id,
          eventGroupId,
          idempotencyKey: `royalty:refund:${input.refundPaymentId}:${input.originalPaymentId}:${source.transaction.id}`,
          reason: input.reason?.trim() || 'Customer credit refunded',
          createdByUserId: input.createdByUserId,
        });
        remainingCategoryRefund = this.round4(remainingCategoryRefund - amount);
      }
    }
  }

  async recordInvoiceCreditRefund(
    manager: EntityManager,
    input: RecordInvoiceCreditRefundInput,
  ): Promise<void> {
    const sourceBalances =
      await this.royaltyTransactionRepository.findInvoiceCreditBalances(
        manager,
        input.invoiceCreditId,
        input.locationId,
      );
    if (sourceBalances.length === 0) {
      return;
    }

    let remainingRefund = this.round4(input.amount);
    const available = this.round4(
      sourceBalances.reduce(
        (sum, source) => sum + source.remainingPaymentAmount,
        0,
      ),
    );
    if (remainingRefund <= 0 || remainingRefund - available > 0.00001) {
      throw new BadRequestException(
        `Refund amount exceeds the classified balance for invoice credit ${input.invoiceCreditId}`,
      );
    }

    const eventGroupId = `invoice-credit-refund:${input.refundPaymentId}:${input.invoiceCreditId}`;
    for (const source of sourceBalances) {
      if (remainingRefund <= 0.00001) {
        break;
      }
      const amount = this.round4(
        Math.min(remainingRefund, source.remainingPaymentAmount),
      );
      const sourceAmounts = this.consumeSource(source, amount, true);
      await this.royaltyLedgerService.recordEvent(manager, {
        paymentId: input.refundPaymentId,
        originalPaymentId:
          source.transaction.originalPaymentId || source.transaction.paymentId,
        locationId: input.locationId,
        customerId: input.customerId,
        itemCategoryId: source.transaction.itemCategoryId,
        categoryName: source.transaction.categoryName,
        isPos: source.transaction.isPos,
        rateApplied: source.transaction.rateApplied,
        advertisementRateApplied: source.transaction.advertisementRateApplied,
        paymentAmount: -amount,
        revenueAmount: -sourceAmounts.revenue,
        taxAmount: -sourceAmounts.tax,
        royaltyAmount: -sourceAmounts.royalty,
        advertisementAmount: -sourceAmounts.advertisement,
        royaltyFree: source.transaction.royaltyFree,
        eventType: RoyaltyTransactionEventType.REFUND,
        effectiveDate: input.effectiveDate,
        sourceType: RoyaltyTransactionSourceType.REFUND,
        sourceId: input.refundPaymentId,
        relatedRoyaltyTransactionId: source.transaction.id,
        eventGroupId,
        idempotencyKey: `royalty:invoice-credit-refund:${input.refundPaymentId}:${input.invoiceCreditId}:${source.transaction.id}`,
        reason: input.reason?.trim() || 'Returned invoice credit refunded',
        createdByUserId: input.createdByUserId,
      });
      remainingRefund = this.round4(remainingRefund - amount);
    }
  }

  private resolveRefundCategoryAllocations(
    input: RecordCreditRefundInput,
    sourceBalances: RoyaltyRecognitionBalance[],
    refundAmount: number,
  ): RoyaltyRefundCategoryAllocation[] {
    const availableByCategory = new Map<number, number>();
    for (const source of sourceBalances) {
      const categoryId = Number(source.transaction.itemCategoryId);
      availableByCategory.set(
        categoryId,
        this.round4(
          (availableByCategory.get(categoryId) || 0) +
            source.remainingPaymentAmount,
        ),
      );
    }

    const provided = input.categoryAllocations || [];
    if (provided.length === 0) {
      // No UI allocation: drain Lesson first, then remaining categories in
      // recognition order. New credits are Lesson-only; this also covers legacy
      // multi-purpose balances without requiring a refund split screen.
      return this.buildAutomaticRefundAllocations(
        availableByCategory,
        refundAmount,
      );
    }

    const categoryIds = provided.map((allocation) =>
      Number(allocation.itemCategoryId),
    );
    if (new Set(categoryIds).size !== categoryIds.length) {
      throw new BadRequestException(
        'Each refund royalty category can appear only once per payment',
      );
    }

    const normalized = provided.map((allocation) => ({
      itemCategoryId: Number(allocation.itemCategoryId),
      amount: this.round4(Number(allocation.amount)),
    }));
    if (
      normalized.some(
        (allocation) =>
          !Number.isFinite(allocation.itemCategoryId) ||
          !Number.isFinite(allocation.amount) ||
          allocation.amount <= 0,
      )
    ) {
      throw new BadRequestException(
        'Refund royalty category amounts must be greater than zero',
      );
    }

    const allocationTotal = this.round4(
      normalized.reduce((sum, allocation) => sum + allocation.amount, 0),
    );
    if (Math.abs(allocationTotal - refundAmount) > 0.01) {
      throw new BadRequestException(
        `Refund royalty category amounts must equal ${refundAmount.toFixed(2)} for payment ${input.originalPaymentId}`,
      );
    }

    for (const allocation of normalized) {
      const categoryAvailable = availableByCategory.get(
        allocation.itemCategoryId,
      );
      if (
        categoryAvailable === undefined ||
        allocation.amount - categoryAvailable > 0.00001
      ) {
        throw new BadRequestException(
          `Refund amount exceeds the available classified balance for category ${allocation.itemCategoryId} on payment ${input.originalPaymentId}`,
        );
      }
    }
    return normalized;
  }

  private buildAutomaticRefundAllocations(
    availableByCategory: Map<number, number>,
    refundAmount: number,
  ): RoyaltyRefundCategoryAllocation[] {
    const orderedCategoryIds = Array.from(availableByCategory.keys()).sort(
      (left, right) => {
        if (left === ItemCategory.CATEGORY_LESSON) {
          return -1;
        }
        if (right === ItemCategory.CATEGORY_LESSON) {
          return 1;
        }
        return left - right;
      },
    );

    let remainingRefund = this.round4(refundAmount);
    const allocations: RoyaltyRefundCategoryAllocation[] = [];
    for (const itemCategoryId of orderedCategoryIds) {
      if (remainingRefund <= 0.00001) {
        break;
      }
      const available = availableByCategory.get(itemCategoryId) || 0;
      const amount = this.round4(Math.min(remainingRefund, available));
      if (amount <= 0.00001) {
        continue;
      }
      allocations.push({ itemCategoryId, amount });
      remainingRefund = this.round4(remainingRefund - amount);
    }
    return allocations;
  }

  private assertReconciledAmount(
    expectedAmount: number,
    purposes: AppliedRoyaltyPurpose[],
  ): void {
    const purposeTotal = this.round4(
      purposes.reduce((sum, purpose) => sum + Number(purpose.paymentAmount), 0),
    );
    if (
      purposes.length === 0 ||
      Math.abs(purposeTotal - expectedAmount) > 0.01
    ) {
      throw new BadRequestException(
        'Royalty allocation purposes do not reconcile with the applied credit',
      );
    }
  }

  private selectSourceBalance(
    balances: RoyaltyRecognitionBalance[],
    destinationCategoryId: number,
  ): RoyaltyRecognitionBalance | undefined {
    return (
      balances.find(
        (balance) =>
          balance.remainingPaymentAmount > 0.00001 &&
          Number(balance.transaction.itemCategoryId) ===
            Number(destinationCategoryId),
      ) || balances.find((balance) => balance.remainingPaymentAmount > 0.00001)
    );
  }

  private consumeSource(
    source: RoyaltyRecognitionBalance,
    amount: number,
    affectsReport: boolean,
  ): { revenue: number; tax: number; royalty: number; advertisement: number } {
    const isFinal = Math.abs(source.remainingPaymentAmount - amount) <= 0.00001;
    const ratio = amount / source.remainingPaymentAmount;
    const revenue = isFinal
      ? this.round4(source.remainingRevenueAmount)
      : this.round4(source.remainingRevenueAmount * ratio);
    const tax = isFinal
      ? this.round4(source.remainingTaxAmount)
      : this.round4(source.remainingTaxAmount * ratio);
    let royalty = 0;
    let advertisement = 0;
    if (affectsReport) {
      const nextActiveRevenue = this.round4(
        source.activeRevenueAmount - revenue,
      );
      const nextActiveRoyalty = calculateRoyaltyAmount(
        nextActiveRevenue,
        source.transaction.royaltyFree ? 0 : source.transaction.rateApplied,
      );
      royalty = this.round2(source.activeRoyaltyAmount - nextActiveRoyalty);
      const nextAdvertisement = calculateRoyaltyAmount(
        nextActiveRevenue,
        source.transaction.royaltyFree
          ? 0
          : source.transaction.advertisementRateApplied,
      );
      advertisement = this.round2(
        (source.activeAdvertisementAmount ?? 0) - nextAdvertisement,
      );
      source.activeAdvertisementAmount = nextAdvertisement;
      source.activeRevenueAmount = nextActiveRevenue;
      source.activeTaxAmount = this.round4(source.activeTaxAmount - tax);
      source.activeRoyaltyAmount = nextActiveRoyalty;
    }

    source.remainingPaymentAmount = this.round4(
      source.remainingPaymentAmount - amount,
    );
    source.remainingRevenueAmount = this.round4(
      source.remainingRevenueAmount - revenue,
    );
    source.remainingTaxAmount = this.round4(source.remainingTaxAmount - tax);
    return { revenue, tax, royalty, advertisement };
  }

  private async recordSameCategoryReclassification(
    manager: EntityManager,
    context: {
      source: RoyaltyRecognitionBalance;
      sourceAmounts: {
        revenue: number;
        tax: number;
        royalty: number;
        advertisement: number;
      };
      destinationAmounts: {
        revenue: number;
        tax: number;
        royalty: number;
        advertisement: number;
      };
      input: ProcessCreditAllocationInput | ProcessInvoiceCreditAllocationInput;
      purposeIndex: number;
      originalPaymentId: number | null;
      eventGroupId: string;
    },
  ): Promise<void> {
    const { source, sourceAmounts, destinationAmounts, input } = context;
    const revenueDelta = this.round4(
      destinationAmounts.revenue - sourceAmounts.revenue,
    );
    const taxDelta = this.round4(destinationAmounts.tax - sourceAmounts.tax);
    const nextActiveRevenue = this.round4(
      source.activeRevenueAmount + revenueDelta,
    );
    const nextActiveRoyalty = calculateRoyaltyAmount(
      nextActiveRevenue,
      source.transaction.royaltyFree ? 0 : source.transaction.rateApplied,
    );
    const royaltyDelta = this.round2(
      nextActiveRoyalty - source.activeRoyaltyAmount,
    );

    const nextAdvertisement = calculateRoyaltyAmount(
      nextActiveRevenue,
      source.transaction.royaltyFree
        ? 0
        : source.transaction.advertisementRateApplied,
    );
    const advertisementDelta = this.round2(
      nextAdvertisement - (source.activeAdvertisementAmount ?? 0),
    );
    source.activeAdvertisementAmount = nextAdvertisement;
    source.activeRevenueAmount = nextActiveRevenue;
    source.activeTaxAmount = this.round4(source.activeTaxAmount + taxDelta);
    source.activeRoyaltyAmount = nextActiveRoyalty;

    if (
      Math.abs(revenueDelta) <= 0.00001 &&
      Math.abs(taxDelta) <= 0.00001 &&
      Math.abs(royaltyDelta) <= 0.00001 &&
      Math.abs(advertisementDelta) <= 0.00001
    ) {
      return;
    }

    const reason =
      revenueDelta < 0 && taxDelta > 0
        ? `$${Math.abs(revenueDelta).toFixed(2)} moved from revenue to tax when credit was applied to a taxable ${source.transaction.categoryName} invoice`
        : `Revenue and tax updated when credit was applied to ${source.transaction.categoryName}`;

    await this.royaltyLedgerService.recordEvent(manager, {
      paymentId: source.transaction.paymentId,
      originalPaymentId: context.originalPaymentId,
      locationId: input.locationId,
      customerId: input.customerId,
      itemCategoryId: source.transaction.itemCategoryId,
      categoryName: source.transaction.categoryName,
      isPos: source.transaction.isPos,
      rateApplied: source.transaction.rateApplied,
      advertisementRateApplied: source.transaction.advertisementRateApplied,
      paymentAmount: 0,
      revenueAmount: revenueDelta,
      taxAmount: taxDelta,
      royaltyAmount: royaltyDelta,
      advertisementAmount: advertisementDelta,
      royaltyFree: source.transaction.royaltyFree,
      eventType: RoyaltyTransactionEventType.RECLASSIFICATION,
      effectiveDate: input.effectiveDate,
      sourceType: input.sourceType,
      sourceId: input.allocationId,
      relatedRoyaltyTransactionId: source.transaction.id,
      eventGroupId: context.eventGroupId,
      idempotencyKey: `royalty:reclassification:${input.sourceType}:${input.allocationId}:${context.purposeIndex}:${source.transaction.id}`,
      reason,
      createdByUserId: input.createdByUserId,
    });
  }

  private toRemainingPurpose(purpose: AppliedRoyaltyPurpose): RemainingPurpose {
    return {
      ...purpose,
      remainingPaymentAmount: this.round4(purpose.paymentAmount),
      remainingRevenueAmount: this.round4(purpose.revenueAmount),
      remainingTaxAmount: this.round4(purpose.taxAmount),
      remainingAdvertisementAmount: calculateRoyaltyAmount(
        purpose.revenueAmount,
        purpose.royaltyFree ? 0 : purpose.advertisementRateApplied,
      ),
      remainingRoyaltyAmount: calculateRoyaltyAmount(
        purpose.revenueAmount,
        purpose.royaltyFree ? 0 : purpose.rateApplied,
      ),
    };
  }

  private consumeDestination(
    destination: RemainingPurpose,
    amount: number,
  ): { revenue: number; tax: number; royalty: number; advertisement: number } {
    const isFinal =
      Math.abs(destination.remainingPaymentAmount - amount) <= 0.00001;
    const ratio = amount / destination.remainingPaymentAmount;
    const revenue = isFinal
      ? this.round4(destination.remainingRevenueAmount)
      : this.round4(destination.remainingRevenueAmount * ratio);
    const tax = isFinal
      ? this.round4(destination.remainingTaxAmount)
      : this.round4(destination.remainingTaxAmount * ratio);
    const royalty = isFinal
      ? this.round2(destination.remainingRoyaltyAmount)
      : calculateRoyaltyAmount(
          revenue,
          destination.royaltyFree ? 0 : destination.rateApplied,
        );

    const advertisement = isFinal
      ? this.round2(destination.remainingAdvertisementAmount)
      : calculateRoyaltyAmount(
          revenue,
          destination.royaltyFree ? 0 : destination.advertisementRateApplied,
        );
    destination.remainingAdvertisementAmount = this.round2(
      destination.remainingAdvertisementAmount - advertisement,
    );
    destination.remainingPaymentAmount = this.round4(
      destination.remainingPaymentAmount - amount,
    );
    destination.remainingRevenueAmount = this.round4(
      destination.remainingRevenueAmount - revenue,
    );
    destination.remainingTaxAmount = this.round4(
      destination.remainingTaxAmount - tax,
    );
    destination.remainingRoyaltyAmount = this.round2(
      destination.remainingRoyaltyAmount - royalty,
    );
    return { revenue, tax, royalty, advertisement };
  }

  private round2(value: number): number {
    return RoundingUtils.roundHalfUp(Number(value), 2);
  }

  private round4(value: number): number {
    return RoundingUtils.roundHalfUp(Number(value), 4);
  }
}
