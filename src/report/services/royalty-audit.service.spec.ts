import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RoyaltyAuditService } from './royalty-audit.service';

function createService(location: unknown, repositoryResult?: unknown) {
  const locationRepository = {
    findOne: vi.fn().mockResolvedValue(location),
  };
  const royaltyAuditRepository = {
    findEntries: vi.fn().mockResolvedValue(
      repositoryResult || {
        rows: [],
        totals: {
          paymentAmount: 0,
          revenueAmount: 0,
          taxAmount: 0,
          royaltyAmount: 0,
        },
        total: 0,
        page: 1,
        limit: 20,
      },
    ),
  };

  return {
    service: new RoyaltyAuditService(
      locationRepository as never,
      royaltyAuditRepository as never,
    ),
    royaltyAuditRepository,
  };
}

describe('RoyaltyAuditService', () => {
  it('scopes the query to the requested location and maps ledger rows', async () => {
    const { service, royaltyAuditRepository } = createService(
      { id: 15, name: 'Burlington', slug: 'burlington' },
      {
        rows: [
          {
            id: '16',
            effectiveDate: '2026-08-11T00:00:00.000Z',
            eventType: 'PAYMENT_RECEIVED',
            locationId: '15',
            customerId: '14896',
            customerUsername: null,
            customerFirstname: 'Test',
            customerLastname: 'Customer',
            paymentId: '1787981',
            originalPaymentId: '1787981',
            categoryId: '1',
            categoryName: 'Lesson',
            rateApplied: '3.00',
            paymentAmount: '100.0000',
            revenueAmount: '100.0000',
            taxAmount: '0.0000',
            royaltyAmount: '3.00',
            royaltyFree: '0',
            sourceType: 'PAYMENT',
            sourceId: '1787981',
            relatedRoyaltyTransactionId: null,
            eventGroupId: null,
            reason: null,
            createdByUserId: '694',
            actorUsername: 'pradeep',
            actorFirstname: 'Pradeep',
            actorLastname: 'Mahto',
            createdOn: '2026-08-11T01:10:54.000Z',
          },
        ],
        totals: {
          paymentAmount: '100.0000',
          revenueAmount: '100.0000',
          taxAmount: '0.0000',
          royaltyAmount: '3.00',
        },
        total: 1,
        page: 1,
        limit: 20,
      },
    );

    const result = await service.getEntries('burlington', {
      page: 1,
      limit: 20,
    });

    expect(royaltyAuditRepository.findEntries).toHaveBeenCalledWith(
      15,
      expect.objectContaining({ page: 1, limit: 20 }),
    );
    expect(result.body[0]).toEqual(
      expect.objectContaining({
        id: 16,
        customerName: 'Test Customer',
        categoryName: 'Lesson',
        rateApplied: '3.00',
        revenueAmount: '100.0000',
        royaltyAmount: '3.00',
        actor: expect.objectContaining({ displayName: 'Pradeep Mahto' }),
      }),
    );
    expect(result.totals).toEqual({
      paymentAmount: '100.0000',
      revenueAmount: '100.0000',
      taxAmount: '0.0000',
      royaltyAmount: '3.00',
    });
  });

  it('rejects an unknown or inactive location', async () => {
    const { service } = createService(null);

    await expect(
      service.getEntries('missing', { page: 1, limit: 20 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
