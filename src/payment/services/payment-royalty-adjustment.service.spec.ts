import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoyaltyTransaction } from '../entities/royalty-transaction.entity';
import {
  RoyaltyTransactionEventType,
  RoyaltyTransactionSourceType,
} from '../enums/royalty-transaction.enum';
import { PaymentRoyaltyAdjustmentService } from './payment-royalty-adjustment.service';

function recognition(
  overrides: Partial<RoyaltyTransaction> = {},
): RoyaltyTransaction {
  return {
    id: 2,
    paymentId: 1787975,
    originalPaymentId: 1787975,
    locationId: 1,
    customerId: 14896,
    itemCategoryId: 1,
    categoryName: 'Lesson',
    rateApplied: 3,
    advertisementRateApplied: 0,
    advertisementAmount: 0,
    paymentAmount: 100,
    revenueAmount: 100,
    taxAmount: 0,
    royaltyAmount: 3,
    royaltyFree: false,
    eventType: RoyaltyTransactionEventType.PAYMENT_RECEIVED,
    effectiveDate: new Date('2026-08-10T00:00:00.000Z'),
    sourceType: RoyaltyTransactionSourceType.PAYMENT,
    sourceId: 1787975,
    relatedRoyaltyTransactionId: null,
    eventGroupId: null,
    idempotencyKey: 'initial',
    reason: null,
    schemaVersion: 1,
    createdOn: new Date('2026-08-10T00:00:00.000Z'),
    createdByUserId: 694,
    ...overrides,
  };
}

describe('PaymentRoyaltyAdjustmentService', () => {
  const manager = {} as EntityManager;
  const recognitionRepository = {
    getAllocationPurposes: vi.fn(),
  };
  const transactionRepository = {
    hasProcessedAllocation: vi.fn().mockResolvedValue(false),
    findRecognitionBalances: vi.fn(),
    findInvoiceCreditBalances: vi.fn(),
  };
  const ledgerService = {
    recordEvent: vi.fn(),
  };
  const royaltyPaymentCorrectionService = {
    reconcileUnclassifiedCreditForAllocation: vi.fn(),
  };
  const service = new PaymentRoyaltyAdjustmentService(
    recognitionRepository as never,
    transactionRepository as never,
    ledgerService as never,
    royaltyPaymentCorrectionService as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    transactionRepository.hasProcessedAllocation.mockResolvedValue(false);
    ledgerService.recordEvent.mockResolvedValue({ id: 20 });
    royaltyPaymentCorrectionService.reconcileUnclassifiedCreditForAllocation.mockResolvedValue(
      false,
    );
  });

  it('reconciles credit restored before the allocation and then applies it', async () => {
    const partialBalance = {
      transaction: recognition(),
      remainingPaymentAmount: 40,
      remainingRevenueAmount: 40,
      remainingTaxAmount: 0,
      activeRevenueAmount: 100,
      activeTaxAmount: 0,
      activeRoyaltyAmount: 3,
    };
    const reconciledBalance = {
      ...partialBalance,
      remainingPaymentAmount: 100,
      remainingRevenueAmount: 100,
    };
    transactionRepository.findRecognitionBalances
      .mockResolvedValueOnce([partialBalance])
      .mockResolvedValueOnce([reconciledBalance]);
    royaltyPaymentCorrectionService.reconcileUnclassifiedCreditForAllocation.mockResolvedValue(
      true,
    );
    recognitionRepository.getAllocationPurposes.mockResolvedValue([
      {
        key: 'lesson:1997400',
        sourceType: RoyaltyTransactionSourceType.LESSON_PAYMENT,
        itemCategoryId: 1,
        categoryName: 'Lesson',
        rateApplied: 3,
        paymentAmount: 100,
        revenueAmount: 100,
        taxAmount: 0,
        royaltyFree: false,
      },
    ]);

    await service.processCreditAllocation(manager, {
      originalPaymentId: 1787975,
      sourceType: RoyaltyTransactionSourceType.LESSON_PAYMENT,
      allocationId: 1997400,
      amount: 100,
      locationId: 1,
      customerId: 14896,
      effectiveDate: new Date('2026-09-02T00:00:00.000Z'),
      createdByUserId: 694,
    });

    expect(
      royaltyPaymentCorrectionService.reconcileUnclassifiedCreditForAllocation,
    ).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        paymentId: 1787975,
        allocationAmount: 100,
        classifiedAmount: 40,
        sourceType: RoyaltyTransactionSourceType.LESSON_PAYMENT,
        sourceId: 1997400,
      }),
    );
    expect(transactionRepository.findRecognitionBalances).toHaveBeenCalledTimes(
      2,
    );
    expect(ledgerService.recordEvent).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: RoyaltyTransactionEventType.ALLOCATION,
        paymentAmount: -100,
        royaltyAmount: 0,
      }),
    );
  });

  it('does not expose the payment identifier when classified credit is insufficient', async () => {
    transactionRepository.findRecognitionBalances.mockResolvedValue([
      {
        transaction: recognition(),
        remainingPaymentAmount: 40,
        remainingRevenueAmount: 40,
        remainingTaxAmount: 0,
        activeRevenueAmount: 40,
        activeTaxAmount: 0,
        activeRoyaltyAmount: 1.2,
      },
    ]);
    recognitionRepository.getAllocationPurposes.mockResolvedValue([
      {
        key: 'lesson:1997400',
        sourceType: RoyaltyTransactionSourceType.LESSON_PAYMENT,
        itemCategoryId: 1,
        categoryName: 'Lesson',
        rateApplied: 3,
        paymentAmount: 100,
        revenueAmount: 100,
        taxAmount: 0,
        royaltyFree: false,
      },
    ]);

    await expect(
      service.processCreditAllocation(manager, {
        originalPaymentId: 1787975,
        sourceType: RoyaltyTransactionSourceType.LESSON_PAYMENT,
        allocationId: 1997400,
        amount: 100,
        locationId: 1,
        customerId: 14896,
        effectiveDate: new Date('2026-09-02T00:00:00.000Z'),
        createdByUserId: 694,
      }),
    ).rejects.toThrow(
      'The selected credit does not have enough classified credit for this allocation',
    );
  });

  it('records a royalty-neutral audit allocation for the same category', async () => {
    transactionRepository.findRecognitionBalances.mockResolvedValue([
      {
        transaction: recognition(),
        remainingPaymentAmount: 100,
        remainingRevenueAmount: 100,
        remainingTaxAmount: 0,
        activeRevenueAmount: 100,
        activeTaxAmount: 0,
        activeRoyaltyAmount: 3,
      },
    ]);
    recognitionRepository.getAllocationPurposes.mockResolvedValue([
      {
        key: 'lesson:1997400',
        sourceType: RoyaltyTransactionSourceType.LESSON_PAYMENT,
        itemCategoryId: 1,
        categoryName: 'Lesson',
        rateApplied: 3,
        paymentAmount: 97.5,
        revenueAmount: 97.5,
        taxAmount: 0,
        royaltyFree: false,
      },
    ]);

    await service.processCreditAllocation(manager, {
      originalPaymentId: 1787975,
      sourceType: RoyaltyTransactionSourceType.LESSON_PAYMENT,
      allocationId: 1997400,
      amount: 97.5,
      locationId: 1,
      customerId: 14896,
      effectiveDate: new Date('2026-08-11T00:00:00.000Z'),
      createdByUserId: 694,
    });

    expect(ledgerService.recordEvent).toHaveBeenCalledTimes(1);
    expect(ledgerService.recordEvent).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: RoyaltyTransactionEventType.ALLOCATION,
        paymentAmount: -97.5,
        revenueAmount: -97.5,
        royaltyAmount: 0,
        relatedRoyaltyTransactionId: 2,
      }),
    );
  });

  it('reverses the source and recognizes the destination category', async () => {
    transactionRepository.findRecognitionBalances.mockResolvedValue([
      {
        transaction: recognition(),
        remainingPaymentAmount: 100,
        remainingRevenueAmount: 100,
        remainingTaxAmount: 0,
        activeRevenueAmount: 100,
        activeTaxAmount: 0,
        activeRoyaltyAmount: 3,
      },
    ]);
    recognitionRepository.getAllocationPurposes.mockResolvedValue([
      {
        key: 'invoice:99:19:4:0',
        sourceType: RoyaltyTransactionSourceType.INVOICE_PAYMENT,
        itemCategoryId: 19,
        categoryName: 'Books',
        rateApplied: 4,
        paymentAmount: 100,
        revenueAmount: 100,
        taxAmount: 0,
        royaltyFree: false,
      },
    ]);
    ledgerService.recordEvent
      .mockResolvedValueOnce({ id: 21 })
      .mockResolvedValueOnce({ id: 22 });

    await service.processCreditAllocation(manager, {
      originalPaymentId: 1787975,
      sourceType: RoyaltyTransactionSourceType.INVOICE_PAYMENT,
      allocationId: 99,
      amount: 100,
      locationId: 1,
      customerId: 14896,
      effectiveDate: new Date('2026-08-11T00:00:00.000Z'),
      createdByUserId: 694,
    });

    expect(ledgerService.recordEvent).toHaveBeenNthCalledWith(
      1,
      manager,
      expect.objectContaining({
        eventType: RoyaltyTransactionEventType.TRANSFER_OUT,
        itemCategoryId: 1,
        revenueAmount: -100,
        royaltyAmount: -3,
      }),
    );
    expect(ledgerService.recordEvent).toHaveBeenNthCalledWith(
      2,
      manager,
      expect.objectContaining({
        eventType: RoyaltyTransactionEventType.TRANSFER_IN,
        itemCategoryId: 19,
        revenueAmount: 100,
        royaltyAmount: 4,
        relatedRoyaltyTransactionId: 21,
      }),
    );
  });

  it('records a partial refund using the original category and rate', async () => {
    transactionRepository.findRecognitionBalances.mockResolvedValue([
      {
        transaction: recognition(),
        remainingPaymentAmount: 100,
        remainingRevenueAmount: 100,
        remainingTaxAmount: 0,
        activeRevenueAmount: 100,
        activeTaxAmount: 0,
        activeRoyaltyAmount: 3,
      },
    ]);

    await service.recordCreditRefund(manager, {
      originalPaymentId: 1787975,
      refundPaymentId: 1788000,
      locationId: 1,
      customerId: 14896,
      amount: 40,
      effectiveDate: new Date('2026-08-12T00:00:00.000Z'),
      reason: 'Customer requested a partial refund',
      createdByUserId: 694,
    });

    expect(ledgerService.recordEvent).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: RoyaltyTransactionEventType.REFUND,
        paymentId: 1788000,
        originalPaymentId: 1787975,
        paymentAmount: -40,
        revenueAmount: -40,
        royaltyAmount: -1.2,
        reason: 'Customer requested a partial refund',
      }),
    );
  });

  it('uses returned invoice credit without charging royalty twice in the same category', async () => {
    transactionRepository.findInvoiceCreditBalances.mockResolvedValue([
      {
        transaction: recognition({
          id: 30,
          eventType: RoyaltyTransactionEventType.TRANSFER_IN,
          sourceType: RoyaltyTransactionSourceType.INVOICE_RETURN,
          sourceId: 1161213,
        }),
        remainingPaymentAmount: 100,
        remainingRevenueAmount: 100,
        remainingTaxAmount: 0,
        activeRevenueAmount: 100,
        activeTaxAmount: 0,
        activeRoyaltyAmount: 3,
      },
    ]);
    recognitionRepository.getAllocationPurposes.mockResolvedValue([
      {
        key: 'lesson:1997400',
        sourceType: RoyaltyTransactionSourceType.LESSON_PAYMENT,
        itemCategoryId: 1,
        categoryName: 'Lesson',
        rateApplied: 3,
        paymentAmount: 40,
        revenueAmount: 40,
        taxAmount: 0,
        royaltyFree: false,
      },
    ]);

    await service.processInvoiceCreditAllocation(manager, {
      invoiceCreditId: 1161213,
      sourceType: RoyaltyTransactionSourceType.LESSON_PAYMENT,
      allocationId: 1997400,
      amount: 40,
      locationId: 1,
      customerId: 14896,
      effectiveDate: new Date('2026-08-12T00:00:00.000Z'),
      createdByUserId: 694,
    });

    expect(ledgerService.recordEvent).toHaveBeenCalledTimes(1);
    expect(ledgerService.recordEvent).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: RoyaltyTransactionEventType.ALLOCATION,
        relatedRoyaltyTransactionId: 30,
        paymentAmount: -40,
        royaltyAmount: 0,
      }),
    );
  });

  it('refunds returned invoice credit using its restored original rate', async () => {
    transactionRepository.findInvoiceCreditBalances.mockResolvedValue([
      {
        transaction: recognition({
          id: 30,
          eventType: RoyaltyTransactionEventType.TRANSFER_IN,
          sourceType: RoyaltyTransactionSourceType.INVOICE_RETURN,
          sourceId: 1161213,
        }),
        remainingPaymentAmount: 100,
        remainingRevenueAmount: 100,
        remainingTaxAmount: 0,
        activeRevenueAmount: 100,
        activeTaxAmount: 0,
        activeRoyaltyAmount: 3,
      },
    ]);

    await service.recordInvoiceCreditRefund(manager, {
      invoiceCreditId: 1161213,
      refundPaymentId: 1788001,
      locationId: 1,
      customerId: 14896,
      amount: 25,
      effectiveDate: new Date('2026-08-13T00:00:00.000Z'),
      createdByUserId: 694,
    });

    expect(ledgerService.recordEvent).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: RoyaltyTransactionEventType.REFUND,
        itemCategoryId: 1,
        rateApplied: 3,
        paymentAmount: -25,
        royaltyAmount: -0.75,
        relatedRoyaltyTransactionId: 30,
      }),
    );
  });

  it('auto-allocates split-purpose refunds Lesson-first when no categories are selected', async () => {
    transactionRepository.findRecognitionBalances.mockResolvedValue([
      {
        transaction: recognition(),
        remainingPaymentAmount: 50,
        remainingRevenueAmount: 50,
        remainingTaxAmount: 0,
        activeRevenueAmount: 50,
        activeTaxAmount: 0,
        activeRoyaltyAmount: 1.5,
      },
      {
        transaction: recognition({
          id: 3,
          itemCategoryId: 19,
          categoryName: 'Books',
          rateApplied: 4,
          paymentAmount: 50,
          revenueAmount: 50,
          royaltyAmount: 2,
        }),
        remainingPaymentAmount: 50,
        remainingRevenueAmount: 50,
        remainingTaxAmount: 0,
        activeRevenueAmount: 50,
        activeTaxAmount: 0,
        activeRoyaltyAmount: 2,
      },
    ]);

    await service.recordCreditRefund(manager, {
      originalPaymentId: 1787975,
      refundPaymentId: 1788000,
      locationId: 1,
      customerId: 14896,
      amount: 40,
      effectiveDate: new Date('2026-08-12T00:00:00.000Z'),
      createdByUserId: 694,
    });

    expect(ledgerService.recordEvent).toHaveBeenNthCalledWith(
      1,
      manager,
      expect.objectContaining({
        itemCategoryId: 1,
        paymentAmount: -40,
        royaltyAmount: -1.2,
      }),
    );
    expect(ledgerService.recordEvent).toHaveBeenCalledTimes(1);
  });

  it('refunds the selected amounts from each category of split-purpose credit', async () => {
    transactionRepository.findRecognitionBalances.mockResolvedValue([
      {
        transaction: recognition(),
        remainingPaymentAmount: 50,
        remainingRevenueAmount: 50,
        remainingTaxAmount: 0,
        activeRevenueAmount: 50,
        activeTaxAmount: 0,
        activeRoyaltyAmount: 1.5,
      },
      {
        transaction: recognition({
          id: 3,
          itemCategoryId: 19,
          categoryName: 'Books',
          rateApplied: 4,
          paymentAmount: 50,
          revenueAmount: 50,
          royaltyAmount: 2,
        }),
        remainingPaymentAmount: 50,
        remainingRevenueAmount: 50,
        remainingTaxAmount: 0,
        activeRevenueAmount: 50,
        activeTaxAmount: 0,
        activeRoyaltyAmount: 2,
      },
    ]);

    await service.recordCreditRefund(manager, {
      originalPaymentId: 1787975,
      refundPaymentId: 1788000,
      locationId: 1,
      customerId: 14896,
      amount: 40,
      categoryAllocations: [
        { itemCategoryId: 1, amount: 25 },
        { itemCategoryId: 19, amount: 15 },
      ],
      effectiveDate: new Date('2026-08-12T00:00:00.000Z'),
      createdByUserId: 694,
    });

    expect(ledgerService.recordEvent).toHaveBeenNthCalledWith(
      1,
      manager,
      expect.objectContaining({
        itemCategoryId: 1,
        paymentAmount: -25,
        royaltyAmount: -0.75,
      }),
    );
    expect(ledgerService.recordEvent).toHaveBeenNthCalledWith(
      2,
      manager,
      expect.objectContaining({
        itemCategoryId: 19,
        paymentAmount: -15,
        royaltyAmount: -0.6,
      }),
    );
  });

  it('rejects split refund allocations that do not match the refund amount', async () => {
    transactionRepository.findRecognitionBalances.mockResolvedValue([
      {
        transaction: recognition(),
        remainingPaymentAmount: 50,
        remainingRevenueAmount: 50,
        remainingTaxAmount: 0,
        activeRevenueAmount: 50,
        activeTaxAmount: 0,
        activeRoyaltyAmount: 1.5,
      },
      {
        transaction: recognition({
          id: 3,
          itemCategoryId: 19,
          categoryName: 'Books',
          rateApplied: 4,
        }),
        remainingPaymentAmount: 50,
        remainingRevenueAmount: 50,
        remainingTaxAmount: 0,
        activeRevenueAmount: 50,
        activeTaxAmount: 0,
        activeRoyaltyAmount: 2,
      },
    ]);

    await expect(
      service.recordCreditRefund(manager, {
        originalPaymentId: 1787975,
        refundPaymentId: 1788000,
        locationId: 1,
        customerId: 14896,
        amount: 40,
        categoryAllocations: [{ itemCategoryId: 1, amount: 25 }],
        effectiveDate: new Date('2026-08-12T00:00:00.000Z'),
        createdByUserId: 694,
      }),
    ).rejects.toThrow('must equal 40.00');
    expect(ledgerService.recordEvent).not.toHaveBeenCalled();
  });

  it('does not process the same allocation twice', async () => {
    transactionRepository.hasProcessedAllocation.mockResolvedValue(true);

    await service.processCreditAllocation(manager, {
      originalPaymentId: 1787975,
      sourceType: RoyaltyTransactionSourceType.LESSON_PAYMENT,
      allocationId: 1997400,
      amount: 97.5,
      locationId: 1,
      customerId: 14896,
      effectiveDate: new Date('2026-08-11T00:00:00.000Z'),
      createdByUserId: 694,
    });

    expect(
      transactionRepository.findRecognitionBalances,
    ).not.toHaveBeenCalled();
    expect(ledgerService.recordEvent).not.toHaveBeenCalled();
  });

  it('reconciles mixed Books and Lesson credit against a taxable Books invoice', async () => {
    transactionRepository.findRecognitionBalances.mockResolvedValue([
      {
        transaction: recognition({
          id: 30,
          itemCategoryId: 5,
          categoryName: 'Methods Books',
          rateApplied: 10,
          paymentAmount: 100,
          revenueAmount: 100,
          royaltyAmount: 10,
        }),
        remainingPaymentAmount: 100,
        remainingRevenueAmount: 100,
        remainingTaxAmount: 0,
        activeRevenueAmount: 100,
        activeTaxAmount: 0,
        activeRoyaltyAmount: 10,
      },
      {
        transaction: recognition({
          id: 33,
          paymentId: 1789000,
          originalPaymentId: 1789000,
          rateApplied: 6,
          paymentAmount: 400,
          revenueAmount: 400,
          royaltyAmount: 24,
        }),
        remainingPaymentAmount: 400,
        remainingRevenueAmount: 400,
        remainingTaxAmount: 0,
        activeRevenueAmount: 400,
        activeTaxAmount: 0,
        activeRoyaltyAmount: 24,
      },
    ]);
    recognitionRepository.getAllocationPurposes.mockResolvedValue([
      {
        key: 'invoice:100:5:10:0',
        sourceType: RoyaltyTransactionSourceType.INVOICE_PAYMENT,
        itemCategoryId: 5,
        categoryName: 'Methods Books',
        rateApplied: 10,
        paymentAmount: 113,
        revenueAmount: 100,
        taxAmount: 13,
        royaltyFree: false,
      },
    ]);
    await service.processCreditAllocation(manager, {
      originalPaymentId: 1787975,
      sourceType: RoyaltyTransactionSourceType.INVOICE_PAYMENT,
      allocationId: 100,
      amount: 113,
      locationId: 1,
      customerId: 14896,
      effectiveDate: new Date('2026-08-14T00:00:00.000Z'),
      createdByUserId: 694,
    });

    expect(ledgerService.recordEvent).toHaveBeenCalledTimes(4);
    expect(ledgerService.recordEvent).toHaveBeenNthCalledWith(
      1,
      manager,
      expect.objectContaining({
        eventType: RoyaltyTransactionEventType.ALLOCATION,
        itemCategoryId: 5,
        paymentAmount: -100,
        revenueAmount: -100,
        royaltyAmount: 0,
      }),
    );
    expect(ledgerService.recordEvent).toHaveBeenNthCalledWith(
      2,
      manager,
      expect.objectContaining({
        eventType: RoyaltyTransactionEventType.RECLASSIFICATION,
        paymentAmount: 0,
        revenueAmount: -11.5044,
        taxAmount: 11.5044,
        royaltyAmount: -1.15,
        reason:
          '$11.50 moved from revenue to tax when credit was applied to a taxable Methods Books invoice',
      }),
    );
    expect(ledgerService.recordEvent).toHaveBeenNthCalledWith(
      3,
      manager,
      expect.objectContaining({
        eventType: RoyaltyTransactionEventType.TRANSFER_OUT,
        itemCategoryId: 1,
        paymentAmount: -13,
        revenueAmount: -13,
        royaltyAmount: -0.78,
      }),
    );
    expect(ledgerService.recordEvent).toHaveBeenNthCalledWith(
      4,
      manager,
      expect.objectContaining({
        eventType: RoyaltyTransactionEventType.TRANSFER_IN,
        itemCategoryId: 5,
        paymentAmount: 13,
        revenueAmount: 11.5044,
        taxAmount: 1.4956,
        royaltyAmount: 1.15,
      }),
    );
  });
});
