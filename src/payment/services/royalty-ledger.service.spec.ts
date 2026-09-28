import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { RoyaltyTransaction } from '../entities/royalty-transaction.entity';
import {
  RoyaltyTransactionEventType,
  RoyaltyTransactionSourceType,
} from '../enums/royalty-transaction.enum';
import { RoyaltyLedgerService } from './royalty-ledger.service';

function createService() {
  const repository = {
    createOnce: vi.fn(async (_manager, transaction) => transaction),
  };
  const manager = {
    create: vi.fn((_entity, input) => input),
  } as unknown as EntityManager;
  const service = new RoyaltyLedgerService(repository as never);

  return { manager, repository, service };
}

describe('RoyaltyLedgerService', () => {
  it('records payment-date lesson recognition with a stable idempotency key', async () => {
    const { manager, repository, service } = createService();

    const result = await service.recordPaymentRecognition(manager, {
      paymentId: 1778657,
      locationId: 15,
      customerId: 14722,
      rateApplied: 6,
      paymentAmount: 600,
      effectiveDate: new Date('2026-08-07T00:00:00.000Z'),
      createdByUserId: 694,
    });

    expect(repository.createOnce).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        paymentId: 1778657,
        originalPaymentId: 1778657,
        locationId: 15,
        customerId: 14722,
        itemCategoryId: 1,
        categoryName: 'Lesson',
        rateApplied: 6,
        paymentAmount: 600,
        revenueAmount: 600,
        royaltyAmount: 36,
        eventType: RoyaltyTransactionEventType.PAYMENT_RECEIVED,
        sourceType: RoyaltyTransactionSourceType.PAYMENT,
        idempotencyKey: 'royalty:payment:1778657:initial:1:0',
        createdOn: expect.any(Date),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ royaltyAmount: 36 }));
  });

  it('rounds negative half-cent refund royalty away from zero', async () => {
    const { manager, service } = createService();

    const result = await service.recordEvent(manager, {
      paymentId: 2,
      originalPaymentId: 1,
      locationId: 15,
      customerId: 14722,
      itemCategoryId: 19,
      categoryName: 'Books',
      rateApplied: 5,
      paymentAmount: -0.5,
      revenueAmount: -0.5,
      eventType: RoyaltyTransactionEventType.REFUND,
      effectiveDate: new Date('2026-08-10T00:00:00.000Z'),
      sourceType: RoyaltyTransactionSourceType.REFUND,
      sourceId: 2,
      relatedRoyaltyTransactionId: 1,
      idempotencyKey: 'royalty:refund:2:1',
      reason: 'Customer refund',
    });

    expect(result.royaltyAmount).toBe(-0.03);
  });

  it('rejects a positive transfer-out event', async () => {
    const { manager, service } = createService();

    await expect(
      service.recordEvent(manager, {
        paymentId: 1,
        originalPaymentId: 1,
        locationId: 15,
        customerId: 14722,
        itemCategoryId: 1,
        categoryName: 'Lesson',
        rateApplied: 6,
        paymentAmount: 100,
        revenueAmount: 100,
        eventType: RoyaltyTransactionEventType.TRANSFER_OUT,
        effectiveDate: new Date('2026-08-10T00:00:00.000Z'),
        sourceType: RoyaltyTransactionSourceType.MANUAL_ADJUSTMENT,
        idempotencyKey: 'royalty:transfer:out:1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
