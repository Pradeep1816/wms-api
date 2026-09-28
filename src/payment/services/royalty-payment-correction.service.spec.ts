import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentMethodType } from '../enums/payment-method-type.enum';
import {
  RoyaltyTransactionEventType,
  RoyaltyTransactionSourceType,
} from '../enums/royalty-transaction.enum';
import { RoyaltyPaymentCorrectionService } from './royalty-payment-correction.service';

function recognition(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    paymentId: 55,
    originalPaymentId: 55,
    locationId: 1,
    customerId: 77,
    itemCategoryId: 1,
    categoryName: 'Lesson',
    rateApplied: 6,
    advertisementRateApplied: 2,
    paymentAmount: 255,
    revenueAmount: 255,
    taxAmount: 0,
    royaltyAmount: 15.3,
    advertisementAmount: 5.1,
    royaltyFree: false,
    eventType: RoyaltyTransactionEventType.PAYMENT_RECEIVED,
    effectiveDate: new Date('2026-08-21T00:00:00.000Z'),
    sourceType: RoyaltyTransactionSourceType.PAYMENT,
    sourceId: 55,
    relatedRoyaltyTransactionId: null,
    ...overrides,
  } as any;
}

function lessonPurpose(
  amount: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    itemCategoryId: 1,
    categoryName: 'Lesson',
    rateApplied: 6,
    advertisementRateApplied: 2,
    royaltyFree: false,
    paymentAmount: amount,
    revenueAmount: amount,
    taxAmount: 0,
    ...overrides,
  };
}

function createService() {
  const recognitionRepository = {
    getAppliedPurposes: vi.fn(),
  };
  const royaltyTransactionRepository = {
    findPaymentRecognitions: vi.fn(),
    findRecognitionBalances: vi.fn(),
    findReportablePaymentEvents: vi.fn(),
  };
  const royaltyLedgerService = {
    recordEvent: vi
      .fn()
      .mockImplementation(async (_manager, event) => ({ id: 99, ...event })),
  };
  const service = new RoyaltyPaymentCorrectionService(
    recognitionRepository as any,
    royaltyTransactionRepository as any,
    royaltyLedgerService as any,
  );
  return {
    service,
    recognitionRepository,
    royaltyTransactionRepository,
    royaltyLedgerService,
  };
}

describe('RoyaltyPaymentCorrectionService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('restores deleted lesson credit without adding reportable revenue or royalty', async () => {
    const { service, royaltyLedgerService } = createService();
    const manager = {
      findOne: vi.fn(async (entity: { name?: string }) => {
        if (entity.name === 'Payment') {
          return {
            id: 55,
            paymentMethodId: PaymentMethodType.CASH,
            isDeleted: 0,
            balance: 78.47,
          };
        }
        if (entity.name === 'ItemCategory') {
          return { id: 1, name: 'Lesson', isDeleted: false };
        }
        if (entity.name === 'LocationDebt') {
          return { value: 6 };
        }
        return null;
      }),
    };

    const restored = await service.restoreDeletedLessonCredit(manager as any, {
      paymentId: 55,
      lessonPaymentId: 900,
      locationId: 15,
      customerId: 77,
      amount: 32.5,
      itemCategoryId: 1,
      rateApplied: 5,
      advertisementRateApplied: 1.25,
      effectiveDate: new Date('2026-09-02T00:00:00.000Z'),
      createdByUserId: 694,
    });

    expect(restored).toBe(true);
    expect(royaltyLedgerService.recordEvent).toHaveBeenNthCalledWith(
      1,
      manager,
      expect.objectContaining({
        eventType: RoyaltyTransactionEventType.OPENING_CREDIT,
        paymentAmount: 32.5,
        revenueAmount: 32.5,
        rateApplied: 5,
        advertisementRateApplied: 1.25,
        idempotencyKey: 'royalty:lesson-delete:900:credit-restored',
      }),
    );
    expect(royaltyLedgerService.recordEvent).toHaveBeenNthCalledWith(
      2,
      manager,
      expect.objectContaining({
        eventType: RoyaltyTransactionEventType.RECLASSIFICATION,
        paymentAmount: -32.5,
        revenueAmount: -32.5,
        relatedRoyaltyTransactionId: 99,
        advertisementRateApplied: 1.25,
        idempotencyKey:
          'royalty:lesson-delete:900:credit-restored:report-offset',
      }),
    );
  });

  it('classifies an existing ledger shortfall as royalty-neutral Lesson credit', async () => {
    const { service, royaltyLedgerService } = createService();
    const manager = {
      findOne: vi.fn(async (entity: { name?: string }) => {
        if (entity.name === 'Payment') {
          return {
            id: 55,
            paymentMethodId: PaymentMethodType.CASH,
            isDeleted: 0,
            balance: 78.47,
          };
        }
        if (entity.name === 'ItemCategory') {
          return { id: 1, name: 'Lesson', isDeleted: false };
        }
        if (entity.name === 'LocationDebt') {
          return { value: 6 };
        }
        return null;
      }),
    };

    const reconciled = await service.reconcileUnclassifiedCreditForAllocation(
      manager as any,
      {
        paymentId: 55,
        locationId: 15,
        customerId: 77,
        allocationAmount: 31.53,
        classifiedAmount: 0,
        effectiveDate: new Date('2026-09-02T00:00:00.000Z'),
        sourceType: RoyaltyTransactionSourceType.LESSON_PAYMENT,
        sourceId: 901,
        createdByUserId: 694,
      },
    );

    expect(reconciled).toBe(true);
    expect(royaltyLedgerService.recordEvent).toHaveBeenNthCalledWith(
      1,
      manager,
      expect.objectContaining({
        eventType: RoyaltyTransactionEventType.OPENING_CREDIT,
        itemCategoryId: 1,
        categoryName: 'Lesson',
        rateApplied: 6,
        paymentAmount: 110,
        revenueAmount: 110,
      }),
    );
    expect(royaltyLedgerService.recordEvent).toHaveBeenNthCalledWith(
      2,
      manager,
      expect.objectContaining({
        eventType: RoyaltyTransactionEventType.RECLASSIFICATION,
        paymentAmount: -110,
        revenueAmount: -110,
      }),
    );
  });

  it('allows a normal payment-method correction without changing royalty eligibility', () => {
    const { service } = createService();
    expect(() =>
      service.validateRecognizedEditBeforeSave({
        paymentId: 55,
        locationId: 1,
        customerId: 77,
        oldAmount: 255,
        newAmount: 255,
        oldBalance: 0,
        oldDate: new Date('2026-08-21T00:00:00.000Z'),
        newDate: '2026-08-21',
        oldPaymentMethodId: PaymentMethodType.CASH,
        newPaymentMethodId: PaymentMethodType.CREDIT_CARD,
        createdByUserId: 694,
      }),
    ).not.toThrow();
  });

  it('blocks reductions and method changes that alter royalty eligibility', () => {
    const { service } = createService();
    const input = {
      paymentId: 55,
      locationId: 1,
      customerId: 77,
      oldAmount: 255,
      newAmount: 255,
      oldBalance: 0,
      oldDate: new Date('2026-08-21T00:00:00.000Z'),
      newDate: '2026-08-21',
      oldPaymentMethodId: PaymentMethodType.CASH,
      newPaymentMethodId: PaymentMethodType.GIFT_CARD,
      createdByUserId: 694,
    };
    expect(() => service.validateRecognizedEditBeforeSave(input)).toThrow(
      'alter royalty eligibility',
    );
    expect(() =>
      service.validateRecognizedEditBeforeSave({
        ...input,
        newAmount: 250,
        newPaymentMethodId: PaymentMethodType.CASH,
      }),
    ).toThrow('cannot be reduced');
  });

  it('keeps the ledger unchanged for same-category lesson reallocation', async () => {
    const { service, recognitionRepository, royaltyLedgerService } =
      createService();
    recognitionRepository.getAppliedPurposes.mockResolvedValue([
      lessonPurpose(130),
    ]);

    await service.reconcileRecognizedEdit(
      {} as any,
      {
        paymentId: 55,
        locationId: 1,
        customerId: 77,
        oldAmount: 260,
        newAmount: 260,
        oldBalance: 0,
        oldDate: new Date('2026-08-21T00:00:00.000Z'),
        newDate: '2026-08-21',
        oldPaymentMethodId: PaymentMethodType.CASH,
        newPaymentMethodId: PaymentMethodType.CASH,
        createdByUserId: 694,
      },
      [lessonPurpose(130)],
      0,
    );

    expect(royaltyLedgerService.recordEvent).not.toHaveBeenCalled();
  });

  it('allows excess Lesson allocation to be released back to Lesson credit', async () => {
    const {
      service,
      recognitionRepository,
      royaltyTransactionRepository,
      royaltyLedgerService,
    } = createService();
    recognitionRepository.getAppliedPurposes.mockResolvedValue([
      lessonPurpose(130),
    ]);
    royaltyTransactionRepository.findPaymentRecognitions.mockResolvedValue([
      recognition({ paymentAmount: 260, revenueAmount: 260 }),
    ]);

    await service.reconcileRecognizedEdit(
      {} as any,
      {
        paymentId: 55,
        locationId: 1,
        customerId: 77,
        oldAmount: 260,
        newAmount: 260,
        oldBalance: 0,
        oldDate: new Date('2026-08-21T00:00:00.000Z'),
        newDate: '2026-08-21',
        oldPaymentMethodId: PaymentMethodType.CASH,
        newPaymentMethodId: PaymentMethodType.CASH,
        createdByUserId: 694,
      },
      [lessonPurpose(260)],
      130,
    );

    expect(royaltyLedgerService.recordEvent).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        eventType: RoyaltyTransactionEventType.OPENING_CREDIT,
        paymentAmount: 130,
        revenueAmount: 130,
        rateApplied: 6,
      }),
    );
    expect(royaltyLedgerService.recordEvent).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        eventType: RoyaltyTransactionEventType.RECLASSIFICATION,
        paymentAmount: -130,
        revenueAmount: -130,
        relatedRoyaltyTransactionId: 99,
      }),
    );
  });

  it('records an auditable Lesson recognition when the amount is increased', async () => {
    const {
      service,
      recognitionRepository,
      royaltyTransactionRepository,
      royaltyLedgerService,
    } = createService();
    recognitionRepository.getAppliedPurposes.mockResolvedValue([
      lessonPurpose(255),
    ]);
    royaltyTransactionRepository.findPaymentRecognitions.mockResolvedValue([
      recognition(),
    ]);

    await service.reconcileRecognizedEdit(
      {} as any,
      {
        paymentId: 55,
        locationId: 1,
        customerId: 77,
        oldAmount: 255,
        newAmount: 285,
        oldBalance: 0,
        oldDate: new Date('2026-08-21T00:00:00.000Z'),
        newDate: '2026-08-21',
        oldPaymentMethodId: PaymentMethodType.CASH,
        newPaymentMethodId: PaymentMethodType.CREDIT_CARD,
        createdByUserId: 694,
      },
      [lessonPurpose(255)],
      30,
    );

    expect(royaltyLedgerService.recordEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: RoyaltyTransactionEventType.PAYMENT_RECEIVED,
        paymentAmount: 30,
        revenueAmount: 30,
        rateApplied: 6,
        advertisementRateApplied: 2,
      }),
    );
  });

  it('consumes remaining credit and reverses report totals on same-day deletion', async () => {
    const { service, royaltyTransactionRepository, royaltyLedgerService } =
      createService();
    const initial = recognition();
    royaltyTransactionRepository.findRecognitionBalances.mockResolvedValue([
      {
        transaction: initial,
        remainingPaymentAmount: 30,
        remainingRevenueAmount: 30,
        remainingTaxAmount: 0,
        activeRevenueAmount: 255,
        activeTaxAmount: 0,
        activeRoyaltyAmount: 15.3,
      },
    ]);
    royaltyTransactionRepository.findReportablePaymentEvents.mockResolvedValue([
      initial,
    ]);

    await service.reverseRecognizedPaymentForDeletion(
      {} as any,
      55,
      new Date('2026-08-21T00:00:00.000Z'),
      694,
    );

    expect(royaltyLedgerService.recordEvent).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        eventType: RoyaltyTransactionEventType.ALLOCATION,
        paymentAmount: -30,
      }),
    );
    expect(royaltyLedgerService.recordEvent).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        eventType: RoyaltyTransactionEventType.RECLASSIFICATION,
        revenueAmount: -255,
        royaltyAmount: -15.3,
        advertisementRateApplied: 2,
        advertisementAmount: -5.1,
      }),
    );
  });
});
