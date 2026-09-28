import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ItemCategory } from '../../item/entities/item-category.entity';
import { getCurrentESTDate } from '../../utils/date-utils';
import { RoundingUtils } from '../../utils/rounding.utils';
import { calculateRoyaltyAmount } from '../../utils/royality/royalty-calculation.util';
import { RoyaltyTransaction } from '../entities/royalty-transaction.entity';
import {
  RoyaltyTransactionEventType,
  RoyaltyTransactionSourceType,
} from '../enums/royalty-transaction.enum';
import { RoyaltyTransactionRepository } from '../repositories/royalty-transaction.repository';

export interface RoyaltyLedgerEventInput {
  isPos?: boolean;
  paymentId?: number | null;
  originalPaymentId?: number | null;
  locationId: number;
  customerId: number;
  itemCategoryId: number;
  categoryName: string;
  rateApplied: number;
  advertisementRateApplied?: number;
  advertisementAmount?: number;
  paymentAmount: number;
  revenueAmount: number;
  taxAmount?: number;
  royaltyAmount?: number;
  royaltyFree?: boolean;
  eventType: RoyaltyTransactionEventType;
  effectiveDate: Date;
  sourceType: RoyaltyTransactionSourceType;
  sourceId?: number | null;
  relatedRoyaltyTransactionId?: number | null;
  eventGroupId?: string | null;
  idempotencyKey: string;
  reason?: string | null;
  createdByUserId?: number | null;
}

export interface PaymentRoyaltyRecognitionInput {
  isPos?: boolean;
  paymentId: number;
  locationId: number;
  customerId: number;
  itemCategoryId?: number;
  categoryName?: string;
  rateApplied: number;
  advertisementRateApplied?: number;
  advertisementAmount?: number;
  paymentAmount: number;
  revenueAmount?: number;
  taxAmount?: number;
  royaltyFree?: boolean;
  effectiveDate: Date;
  sourceType?: RoyaltyTransactionSourceType;
  sourceId?: number | null;
  purposeKey?: string;
  createdByUserId?: number | null;
}

@Injectable()
export class RoyaltyLedgerService {
  constructor(
    private readonly royaltyTransactionRepository: RoyaltyTransactionRepository,
  ) {}

  async recordPaymentRecognition(
    manager: EntityManager,
    input: PaymentRoyaltyRecognitionInput,
  ): Promise<RoyaltyTransaction> {
    const itemCategoryId = Number(
      input.itemCategoryId ?? ItemCategory.CATEGORY_LESSON,
    );
    const purposeKey = input.purposeKey || `${itemCategoryId}:0`;

    return this.recordEvent(manager, {
      paymentId: input.paymentId,
      originalPaymentId: input.paymentId,
      locationId: input.locationId,
      customerId: input.customerId,
      itemCategoryId,
      isPos: Boolean(input.isPos),
      categoryName: input.categoryName || 'Lesson',
      rateApplied: input.rateApplied,
      advertisementRateApplied: input.advertisementRateApplied,
      paymentAmount: input.paymentAmount,
      revenueAmount: input.revenueAmount ?? input.paymentAmount,
      taxAmount: input.taxAmount ?? 0,
      royaltyFree: input.royaltyFree,
      eventType: RoyaltyTransactionEventType.PAYMENT_RECEIVED,
      effectiveDate: input.effectiveDate,
      sourceType: input.sourceType || RoyaltyTransactionSourceType.PAYMENT,
      sourceId: input.sourceId ?? input.paymentId,
      idempotencyKey: `royalty:payment:${input.paymentId}:initial:${purposeKey}`,
      createdByUserId: input.createdByUserId,
    });
  }

  async recordEvent(
    manager: EntityManager,
    input: RoyaltyLedgerEventInput,
  ): Promise<RoyaltyTransaction> {
    this.validateInput(input);

    const transaction = manager.create(RoyaltyTransaction, {
      paymentId: input.paymentId ?? null,
      originalPaymentId: input.originalPaymentId ?? input.paymentId ?? null,
      locationId: Number(input.locationId),
      customerId: Number(input.customerId),
      itemCategoryId: Number(input.itemCategoryId),
      isPos: Boolean(input.isPos),
      categoryName: input.categoryName.trim(),
      rateApplied: this.round(input.rateApplied, 2),
      advertisementRateApplied: input.royaltyFree
        ? 0
        : this.round(input.advertisementRateApplied ?? 0, 2),
      advertisementAmount:
        input.royaltyFree ||
        input.eventType === RoyaltyTransactionEventType.ALLOCATION
          ? 0
          : input.advertisementAmount === undefined
            ? calculateRoyaltyAmount(
                input.revenueAmount,
                input.advertisementRateApplied ?? 0,
              )
            : this.round(input.advertisementAmount, 2),
      paymentAmount: this.round(input.paymentAmount, 4),
      revenueAmount: this.round(input.revenueAmount, 4),
      taxAmount: this.round(input.taxAmount ?? 0, 4),
      royaltyAmount:
        input.royaltyAmount === undefined
          ? calculateRoyaltyAmount(input.revenueAmount, input.rateApplied)
          : this.round(input.royaltyAmount, 2),
      royaltyFree: Boolean(input.royaltyFree),
      eventType: input.eventType,
      effectiveDate: new Date(input.effectiveDate),
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      relatedRoyaltyTransactionId: input.relatedRoyaltyTransactionId ?? null,
      eventGroupId: input.eventGroupId ?? null,
      idempotencyKey: input.idempotencyKey.trim(),
      reason: input.reason?.trim() || null,
      schemaVersion: 2,
      createdOn: getCurrentESTDate(),
      createdByUserId: input.createdByUserId ?? null,
    });

    return this.royaltyTransactionRepository.createOnce(manager, transaction);
  }

  private validateInput(input: RoyaltyLedgerEventInput): void {
    const advertisementRate = Number(input.advertisementRateApplied ?? 0);
    if (
      !Number.isFinite(advertisementRate) ||
      advertisementRate < 0 ||
      advertisementRate > 100 ||
      !Number.isFinite(Number(input.advertisementAmount ?? 0))
    ) {
      throw new BadRequestException(
        'Advertisement rate must be between 0 and 100 and amount must be finite',
      );
    }
    const requiredPositiveIntegers = [
      ['locationId', input.locationId],
      ['customerId', input.customerId],
      ['itemCategoryId', input.itemCategoryId],
    ] as const;

    for (const [field, value] of requiredPositiveIntegers) {
      if (!Number.isInteger(Number(value)) || Number(value) <= 0) {
        throw new BadRequestException(`${field} must be a positive integer`);
      }
    }

    if (!input.categoryName?.trim()) {
      throw new BadRequestException('categoryName is required');
    }
    if (!input.idempotencyKey?.trim()) {
      throw new BadRequestException('idempotencyKey is required');
    }
    if (
      !Number.isFinite(Number(input.rateApplied)) ||
      input.rateApplied < 0 ||
      input.rateApplied > 100
    ) {
      throw new BadRequestException('rateApplied must be between 0 and 100');
    }
    if (
      ![
        input.paymentAmount,
        input.revenueAmount,
        input.taxAmount ?? 0,
        input.royaltyAmount ?? 0,
      ].every((value) => Number.isFinite(Number(value)))
    ) {
      throw new BadRequestException(
        'Royalty transaction amounts must be valid numbers',
      );
    }
    if (Number.isNaN(new Date(input.effectiveDate).getTime())) {
      throw new BadRequestException('effectiveDate must be a valid date');
    }

    const requiresNonNegativeAmounts = [
      RoyaltyTransactionEventType.PAYMENT_RECEIVED,
      RoyaltyTransactionEventType.TRANSFER_IN,
      RoyaltyTransactionEventType.OPENING_CREDIT,
    ].includes(input.eventType);
    const requiresNonPositiveAmounts = [
      RoyaltyTransactionEventType.ALLOCATION,
      RoyaltyTransactionEventType.REFUND,
      RoyaltyTransactionEventType.TRANSFER_OUT,
    ].includes(input.eventType);

    if (
      requiresNonNegativeAmounts &&
      (Number(input.paymentAmount) < 0 || Number(input.revenueAmount) < 0)
    ) {
      throw new BadRequestException(
        `${input.eventType} amounts cannot be negative`,
      );
    }
    if (
      requiresNonPositiveAmounts &&
      (Number(input.paymentAmount) > 0 || Number(input.revenueAmount) > 0)
    ) {
      throw new BadRequestException(
        `${input.eventType} amounts cannot be positive`,
      );
    }
  }

  private round(value: number, precision: number): number {
    return RoundingUtils.roundHalfUp(Number(value), precision);
  }
}
