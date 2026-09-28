import { EntityManager, In } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { RoyaltyTransaction } from '../entities/royalty-transaction.entity';
import {
  RoyaltyTransactionEventType,
  RoyaltyTransactionSourceType,
} from '../enums/royalty-transaction.enum';
import { RoyaltyTransactionRepository } from './royalty-transaction.repository';

function buildTransaction(
  overrides: Partial<RoyaltyTransaction> = {},
): RoyaltyTransaction {
  return {
    id: 1,
    paymentId: 10,
    originalPaymentId: 10,
    locationId: 15,
    customerId: 20,
    itemCategoryId: 1,
    categoryName: 'Lesson',
    rateApplied: 6,
    advertisementRateApplied: 0,
    advertisementAmount: 0,
    paymentAmount: 100,
    revenueAmount: 100,
    taxAmount: 0,
    royaltyAmount: 6,
    royaltyFree: false,
    eventType: RoyaltyTransactionEventType.PAYMENT_RECEIVED,
    effectiveDate: new Date('2026-08-10T00:00:00.000Z'),
    sourceType: RoyaltyTransactionSourceType.PAYMENT,
    sourceId: 10,
    relatedRoyaltyTransactionId: null,
    eventGroupId: null,
    idempotencyKey: 'royalty:payment:10:initial:1:0',
    reason: null,
    schemaVersion: 1,
    createdOn: new Date('2026-08-10T00:00:00.000Z'),
    createdByUserId: 694,
    ...overrides,
  };
}

describe('RoyaltyTransactionRepository', () => {
  it('treats received payments and migrated opening credits as recognized', async () => {
    const count = vi.fn().mockResolvedValue(1);
    const manager = {
      getRepository: vi.fn().mockReturnValue({ count }),
    } as any;
    const repository = new RoyaltyTransactionRepository();

    await expect(
      repository.hasPaymentRecognition(manager, 1787975),
    ).resolves.toBe(true);
    expect(count).toHaveBeenCalledWith({
      where: {
        originalPaymentId: 1787975,
        eventType: In([
          RoyaltyTransactionEventType.PAYMENT_RECEIVED,
          RoyaltyTransactionEventType.OPENING_CREDIT,
        ]),
      },
    });
  });

  it('tracks allocated credit without removing it from active reported revenue', async () => {
    const initial = buildTransaction();
    const allocation = buildTransaction({
      id: 2,
      paymentAmount: -97.5,
      revenueAmount: -97.5,
      royaltyAmount: 0,
      eventType: RoyaltyTransactionEventType.ALLOCATION,
      sourceType: RoyaltyTransactionSourceType.LESSON_PAYMENT,
      sourceId: 99,
      relatedRoyaltyTransactionId: 1,
      idempotencyKey: 'allocation',
    });
    const typeOrmRepository = {
      find: vi
        .fn()
        .mockResolvedValueOnce([initial])
        .mockResolvedValueOnce([allocation]),
    };
    const manager = {
      getRepository: vi.fn().mockReturnValue(typeOrmRepository),
    } as unknown as EntityManager;
    const repository = new RoyaltyTransactionRepository();

    await expect(
      repository.findRecognitionBalances(manager, 10),
    ).resolves.toEqual([
      expect.objectContaining({
        transaction: initial,
        remainingPaymentAmount: 2.5,
        remainingRevenueAmount: 2.5,
        activeRevenueAmount: 100,
        activeRoyaltyAmount: 6,
      }),
    ]);
  });

  it('applies a revenue and tax reclassification only to active report balances', async () => {
    const initial = buildTransaction();
    const allocation = buildTransaction({
      id: 2,
      paymentAmount: -50,
      revenueAmount: -50,
      royaltyAmount: 0,
      eventType: RoyaltyTransactionEventType.ALLOCATION,
      sourceType: RoyaltyTransactionSourceType.INVOICE_PAYMENT,
      sourceId: 99,
      relatedRoyaltyTransactionId: 1,
      idempotencyKey: 'allocation',
    });
    const reclassification = buildTransaction({
      id: 3,
      paymentAmount: 0,
      revenueAmount: -5.7522,
      taxAmount: 5.7522,
      royaltyAmount: -0.35,
      eventType: RoyaltyTransactionEventType.RECLASSIFICATION,
      sourceType: RoyaltyTransactionSourceType.INVOICE_PAYMENT,
      sourceId: 99,
      relatedRoyaltyTransactionId: 1,
      idempotencyKey: 'reclassification',
    });
    const typeOrmRepository = {
      find: vi
        .fn()
        .mockResolvedValueOnce([initial])
        .mockResolvedValueOnce([allocation, reclassification]),
    };
    const manager = {
      getRepository: vi.fn().mockReturnValue(typeOrmRepository),
    } as unknown as EntityManager;
    const repository = new RoyaltyTransactionRepository();

    await expect(
      repository.findRecognitionBalancesReadOnly(manager, 10),
    ).resolves.toEqual([
      expect.objectContaining({
        transaction: initial,
        remainingPaymentAmount: 50,
        remainingRevenueAmount: 50,
        remainingTaxAmount: 0,
        activeRevenueAmount: 94.2478,
        activeTaxAmount: 5.7522,
        activeRoyaltyAmount: 5.65,
      }),
    ]);
  });

  it('returns an identical existing event without inserting again', async () => {
    const transaction = buildTransaction();
    const typeOrmRepository = {
      findOne: vi.fn().mockResolvedValue(transaction),
      save: vi.fn(),
    };
    const manager = {
      getRepository: vi.fn().mockReturnValue(typeOrmRepository),
    } as unknown as EntityManager;
    const repository = new RoyaltyTransactionRepository();

    await expect(repository.createOnce(manager, transaction)).resolves.toBe(
      transaction,
    );
    expect(typeOrmRepository.save).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key for different money', async () => {
    const existing = buildTransaction();
    const requested = buildTransaction({
      revenueAmount: 200,
      royaltyAmount: 12,
    });
    const typeOrmRepository = {
      findOne: vi.fn().mockResolvedValue(existing),
      save: vi.fn(),
    };
    const manager = {
      getRepository: vi.fn().mockReturnValue(typeOrmRepository),
    } as unknown as EntityManager;
    const repository = new RoyaltyTransactionRepository();

    await expect(repository.createOnce(manager, requested)).rejects.toThrow(
      'Royalty transaction idempotency conflict',
    );
  });
});
