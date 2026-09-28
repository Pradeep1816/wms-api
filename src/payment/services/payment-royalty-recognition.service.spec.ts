import { EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { ItemCategory } from '../../item/entities/item-category.entity';
import { LocationDebt } from '../../location/entities/location-debt.entity';
import { RoyaltyTransactionSourceType } from '../enums/royalty-transaction.enum';
import { PaymentRoyaltyRecognitionService } from './payment-royalty-recognition.service';

function createService(appliedPurposes: unknown[] = []) {
  const recognitionRepository = {
    getAppliedPurposes: vi.fn().mockResolvedValue(appliedPurposes),
  };
  const royaltyLedgerService = {
    recordPaymentRecognition: vi.fn().mockResolvedValue({ id: 1 }),
  };
  const service = new PaymentRoyaltyRecognitionService(
    recognitionRepository as never,
    royaltyLedgerService as never,
  );
  const manager = {
    findOne: vi.fn(async (entity, options) => {
      if (entity === ItemCategory) {
        return { id: 1, name: 'Lesson', isDeleted: false };
      }
      if (entity === LocationDebt) {
        return { value: options.where.type === 2 ? 2 : 6 };
      }
      return null;
    }),
  } as unknown as EntityManager;

  return { manager, recognitionRepository, royaltyLedgerService, service };
}

describe('PaymentRoyaltyRecognitionService', () => {
  it('recognizes applied and unapplied portions on the original payment date', async () => {
    const appliedPurpose = {
      key: 'LESSON_PAYMENT:1:6:0',
      sourceType: RoyaltyTransactionSourceType.LESSON_PAYMENT,
      itemCategoryId: 1,
      categoryName: 'Lesson',
      rateApplied: 6,
      advertisementRateApplied: 1.25,
      paymentAmount: 100,
      revenueAmount: 100,
      taxAmount: 0,
      royaltyFree: false,
    };
    const { manager, royaltyLedgerService, service } = createService([
      appliedPurpose,
    ]);

    await service.recognizeReceivePayment(manager, {
      paymentId: 1778657,
      paymentAmount: 600,
      paymentBalance: 500,
      locationId: 15,
      customerId: 14722,
      effectiveDate: new Date('2026-08-07T00:00:00.000Z'),
      createdByUserId: 694,
    });

    expect(royaltyLedgerService.recordPaymentRecognition).toHaveBeenCalledTimes(
      2,
    );
    expect(
      royaltyLedgerService.recordPaymentRecognition,
    ).toHaveBeenNthCalledWith(
      1,
      manager,
      expect.objectContaining({
        paymentId: 1778657,
        paymentAmount: 100,
        rateApplied: 6,
        advertisementRateApplied: 1.25,
        purposeKey: 'applied:LESSON_PAYMENT:1:6:0',
      }),
    );
    expect(
      royaltyLedgerService.recordPaymentRecognition,
    ).toHaveBeenNthCalledWith(
      2,
      manager,
      expect.objectContaining({
        paymentId: 1778657,
        paymentAmount: 500,
        itemCategoryId: 1,
        rateApplied: 6,
        advertisementRateApplied: 2,
        purposeKey: 'unapplied:0:1',
      }),
    );
  });

  it('defaults remaining customer credit to Lesson when no purposes are sent', async () => {
    const { manager, royaltyLedgerService, service } = createService([]);

    await service.recognizeReceivePayment(manager, {
      paymentId: 1,
      paymentAmount: 100,
      paymentBalance: 100,
      locationId: 15,
      customerId: 20,
      effectiveDate: new Date('2026-08-10T00:00:00.000Z'),
      createdByUserId: 694,
    });

    expect(royaltyLedgerService.recordPaymentRecognition).toHaveBeenCalledTimes(
      1,
    );
    expect(royaltyLedgerService.recordPaymentRecognition).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        paymentId: 1,
        paymentAmount: 100,
        itemCategoryId: ItemCategory.CATEGORY_LESSON,
        rateApplied: 6,
        advertisementRateApplied: 2,
        purposeKey: 'unapplied:0:1',
      }),
    );
  });

  it('ignores client-supplied unapplied purpose splits and forces Lesson', async () => {
    const { manager, royaltyLedgerService, service } = createService([]);

    await service.recognizeReceivePayment(manager, {
      paymentId: 1,
      paymentAmount: 100,
      paymentBalance: 100,
      locationId: 15,
      customerId: 20,
      effectiveDate: new Date('2026-08-10T00:00:00.000Z'),
      unappliedRoyaltyPurposes: [
        { itemCategoryId: 5, amount: 60 },
        { itemCategoryId: 7, amount: 40 },
      ],
      createdByUserId: 694,
    });

    expect(royaltyLedgerService.recordPaymentRecognition).toHaveBeenCalledTimes(
      1,
    );
    expect(royaltyLedgerService.recordPaymentRecognition).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        paymentAmount: 100,
        itemCategoryId: ItemCategory.CATEGORY_LESSON,
        purposeKey: 'unapplied:0:1',
      }),
    );
  });
});
