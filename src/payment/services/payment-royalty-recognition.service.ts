import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ItemCategory } from '../../item/entities/item-category.entity';
import { RoundingUtils } from '../../utils/rounding.utils';
import { resolveCategoryRoyaltySnapshot } from '../../utils/royality/royalty-calculation.util';
import { ReceivePaymentRoyaltyPurposeDto } from '../dto/receive-payment-request.dto';
import { RoyaltyTransactionSourceType } from '../enums/royalty-transaction.enum';
import { PaymentRoyaltyRecognitionRepository } from '../repositories/payment-royalty-recognition.repository';
import { RoyaltyLedgerService } from './royalty-ledger.service';

interface RecognizeReceivePaymentInput {
  paymentId: number;
  paymentAmount: number;
  paymentBalance: number;
  locationId: number;
  customerId: number;
  effectiveDate: Date;
  /** Ignored: unapplied credit is always classified as Lesson. */
  unappliedRoyaltyPurposes?: ReceivePaymentRoyaltyPurposeDto[];
  createdByUserId: number;
}

@Injectable()
export class PaymentRoyaltyRecognitionService {
  constructor(
    private readonly recognitionRepository: PaymentRoyaltyRecognitionRepository,
    private readonly royaltyLedgerService: RoyaltyLedgerService,
  ) {}

  async recognizeReceivePayment(
    manager: EntityManager,
    input: RecognizeReceivePaymentInput,
  ): Promise<void> {
    const appliedPurposes = await this.recognitionRepository.getAppliedPurposes(
      manager,
      input.paymentId,
      input.locationId,
    );
    const unappliedPurposes = this.buildLessonUnappliedPurposes(
      input.paymentBalance,
    );

    for (const purpose of appliedPurposes) {
      await this.royaltyLedgerService.recordPaymentRecognition(manager, {
        paymentId: input.paymentId,
        locationId: input.locationId,
        customerId: input.customerId,
        itemCategoryId: purpose.itemCategoryId,
        categoryName: purpose.categoryName,
        isPos: purpose.isPos,
        rateApplied: purpose.royaltyFree ? 0 : purpose.rateApplied,
        advertisementRateApplied: purpose.royaltyFree
          ? 0
          : purpose.advertisementRateApplied,
        paymentAmount: purpose.paymentAmount,
        revenueAmount: purpose.revenueAmount,
        taxAmount: purpose.taxAmount,
        royaltyFree: purpose.royaltyFree,
        effectiveDate: input.effectiveDate,
        sourceType: purpose.sourceType,
        sourceId: input.paymentId,
        purposeKey: `applied:${purpose.key}`,
        createdByUserId: input.createdByUserId,
      });
    }

    for (const [index, purpose] of unappliedPurposes.entries()) {
      const category = await resolveCategoryRoyaltySnapshot(
        manager,
        input.locationId,
        Number(purpose.itemCategoryId),
      );
      if (category.categoryName === 'Uncategorized') {
        throw new BadRequestException(
          `Item category ${purpose.itemCategoryId} is not available`,
        );
      }

      await this.royaltyLedgerService.recordPaymentRecognition(manager, {
        paymentId: input.paymentId,
        locationId: input.locationId,
        customerId: input.customerId,
        itemCategoryId: category.categoryId,
        categoryName: category.categoryName,
        rateApplied: category.rate,
        advertisementRateApplied: category.advertisementRate,
        paymentAmount: Number(purpose.amount),
        revenueAmount: Number(purpose.amount),
        taxAmount: 0,
        effectiveDate: input.effectiveDate,
        sourceType: RoyaltyTransactionSourceType.PAYMENT,
        sourceId: input.paymentId,
        purposeKey: `unapplied:${index}:${category.categoryId}`,
        createdByUserId: input.createdByUserId,
      });
    }

    const recognizedPaymentAmount = appliedPurposes.reduce(
      (sum, purpose) => sum + Number(purpose.paymentAmount),
      unappliedPurposes.reduce(
        (sum, purpose) => sum + Number(purpose.amount),
        0,
      ),
    );
    if (
      Math.abs(
        this.round(recognizedPaymentAmount) - this.round(input.paymentAmount),
      ) > 0.01
    ) {
      throw new BadRequestException(
        'Royalty purpose amounts do not reconcile with the received payment',
      );
    }
  }

  /**
   * Unapplied customer credit is always Lesson. Client-supplied purpose splits
   * are ignored; credit can still be applied later to non-lesson sales via
   * royalty transfer on allocation.
   */
  private buildLessonUnappliedPurposes(
    paymentBalance: number,
  ): ReceivePaymentRoyaltyPurposeDto[] {
    const balance = this.round(Math.max(0, Number(paymentBalance)));
    if (balance <= 0.01) {
      return [];
    }
    return [
      {
        itemCategoryId: ItemCategory.CATEGORY_LESSON,
        amount: balance,
      },
    ];
  }

  private round(value: number): number {
    return RoundingUtils.roundHalfUp(Number(value), 2);
  }
}
