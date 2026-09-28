import { EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { InvoicePayment } from '../entities/invoice-payment.entity';
import { RoyaltyTransaction } from '../../payment/entities/royalty-transaction.entity';
import {
  RoyaltyTransactionEventType,
  RoyaltyTransactionSourceType,
} from '../../payment/enums/royalty-transaction.enum';
import { InvoiceReturnRoyaltyService, returnCategoryKey } from './invoice-return-royalty.service';

describe('InvoiceReturnRoyaltyService', () => {
  it('reverses the purchased category and restores the original credit category', async () => {
    const invoicePayment = {
      id: 99,
      invoiceId: 500,
      paymentId: 1000,
      amount: 100,
      isDeleted: 0,
    } as InvoicePayment;
    const originalLesson = {
      id: 2,
      paymentId: 1000,
      originalPaymentId: 1000,
      itemCategoryId: 1,
      categoryName: 'Lesson',
      rateApplied: 3,
      advertisementRateApplied: 2,
      royaltyFree: false,
    } as RoyaltyTransaction;
    const lessonTransferOut = {
      id: 21,
      paymentId: 1000,
      originalPaymentId: 1000,
      itemCategoryId: 1,
      categoryName: 'Lesson',
      rateApplied: 3,
      paymentAmount: -100,
      revenueAmount: -100,
      taxAmount: 0,
      royaltyAmount: -3,
      advertisementAmount: -2,
      royaltyFree: false,
      relatedRoyaltyTransactionId: 2,
    } as RoyaltyTransaction;
    const booksTransferIn = {
      id: 22,
      paymentId: 1000,
      originalPaymentId: 1000,
      itemCategoryId: 19,
      categoryName: 'Books',
      rateApplied: 4,
      advertisementRateApplied: 1.25,
      paymentAmount: 100,
      revenueAmount: 100,
      taxAmount: 0,
      royaltyAmount: 4,
      advertisementAmount: 1.25,
      royaltyFree: false,
      sourceType: RoyaltyTransactionSourceType.INVOICE_PAYMENT,
      sourceId: 99,
      eventType: RoyaltyTransactionEventType.TRANSFER_IN,
      relatedRoyaltyTransactionId: 21,
    } as RoyaltyTransaction;

    const invoicePaymentRepository = {
      find: vi.fn().mockResolvedValue([invoicePayment]),
    };
    const royaltyRepository = {
      find: vi
        .fn()
        .mockResolvedValueOnce([booksTransferIn])
        .mockResolvedValueOnce([]),
      findOne: vi.fn().mockImplementation(({ where: { id } }) => {
        if (id === 21) return Promise.resolve(lessonTransferOut);
        if (id === 2) return Promise.resolve(originalLesson);
        return Promise.resolve(null);
      }),
    };
    const manager = {
      getRepository: vi.fn().mockImplementation((entity) => {
        if (entity === InvoicePayment) return invoicePaymentRepository;
        if (entity === RoyaltyTransaction) return royaltyRepository;
        throw new Error('Unexpected repository');
      }),
    } as unknown as EntityManager;
    const ledgerService = {
      recordEvent: vi
        .fn()
        .mockResolvedValueOnce({ id: 40 })
        .mockResolvedValueOnce({ id: 41 }),
    };
    const recognitionRepository = {
      getAllocationPurposes: vi.fn(),
    };
    const service = new InvoiceReturnRoyaltyService(
      ledgerService as never,
      recognitionRepository as never,
    );

    await service.recordInvoiceReturn(manager, {
      originalInvoiceId: 500,
      creditInvoiceId: 501,
      locationId: 15,
      customerId: 14896,
      effectiveDate: new Date('2026-08-12T00:00:00.000Z'),
      createdByUserId: 694,
    });

    expect(ledgerService.recordEvent).toHaveBeenNthCalledWith(
      1,
      manager,
      expect.objectContaining({
        eventType: RoyaltyTransactionEventType.TRANSFER_OUT,
        sourceType: RoyaltyTransactionSourceType.INVOICE_RETURN,
        sourceId: 501,
        itemCategoryId: 19,
        rateApplied: 4,
        revenueAmount: -100,
        royaltyAmount: -4,
        advertisementRateApplied: 1.25,
        advertisementAmount: -1.25,
        relatedRoyaltyTransactionId: 22,
      }),
    );
    expect(ledgerService.recordEvent).toHaveBeenNthCalledWith(
      2,
      manager,
      expect.objectContaining({
        eventType: RoyaltyTransactionEventType.TRANSFER_IN,
        sourceType: RoyaltyTransactionSourceType.INVOICE_RETURN,
        sourceId: 501,
        itemCategoryId: 1,
        rateApplied: 3,
        revenueAmount: 100,
        royaltyAmount: 3,
        advertisementRateApplied: 2,
        advertisementAmount: 2,
        relatedRoyaltyTransactionId: 40,
      }),
    );
  });

  it('returns only this invoice payment share from an aggregated direct recognition', async () => {
    const invoicePayment = {
      id: 100,
      invoiceId: 600,
      paymentId: 1001,
      amount: 40,
      isDeleted: 0,
    } as InvoicePayment;
    const aggregatedBooks = {
      id: 50,
      paymentId: 1001,
      originalPaymentId: 1001,
      itemCategoryId: 19,
      categoryName: 'Books',
      rateApplied: 4,
      advertisementRateApplied: 1.25,
      paymentAmount: 100,
      revenueAmount: 100,
      taxAmount: 0,
      royaltyAmount: 4,
      royaltyFree: false,
      sourceType: RoyaltyTransactionSourceType.INVOICE_PAYMENT,
      eventType: RoyaltyTransactionEventType.PAYMENT_RECEIVED,
    } as RoyaltyTransaction;
    const royaltyRepository = {
      find: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([aggregatedBooks]),
      findOne: vi.fn(),
    };
    const manager = {
      getRepository: vi.fn().mockImplementation((entity) => {
        if (entity === InvoicePayment) {
          return { find: vi.fn().mockResolvedValue([invoicePayment]) };
        }
        if (entity === RoyaltyTransaction) return royaltyRepository;
        throw new Error('Unexpected repository');
      }),
    } as unknown as EntityManager;
    const ledgerService = {
      recordEvent: vi
        .fn()
        .mockResolvedValueOnce({ id: 60 })
        .mockResolvedValueOnce({ id: 61 }),
    };
    const recognitionRepository = {
      getAllocationPurposes: vi.fn().mockResolvedValue([
        {
          itemCategoryId: 19,
          categoryName: 'Books',
          rateApplied: 4,
          advertisementRateApplied: 1.25,
          paymentAmount: 40,
          revenueAmount: 40,
          taxAmount: 0,
          royaltyFree: false,
        },
      ]),
    };
    const service = new InvoiceReturnRoyaltyService(
      ledgerService as never,
      recognitionRepository as never,
    );

    await service.recordInvoiceReturn(manager, {
      originalInvoiceId: 600,
      creditInvoiceId: 601,
      locationId: 15,
      customerId: 14896,
      effectiveDate: new Date('2026-08-12T00:00:00.000Z'),
      createdByUserId: 694,
    });

    expect(ledgerService.recordEvent).toHaveBeenNthCalledWith(
      1,
      manager,
      expect.objectContaining({
        paymentAmount: -40,
        revenueAmount: -40,
        royaltyAmount: -1.6,
        advertisementRateApplied: 1.25,
        advertisementAmount: -0.5,
      }),
    );
    expect(ledgerService.recordEvent).toHaveBeenNthCalledWith(
      2,
      manager,
      expect.objectContaining({
        paymentAmount: 40,
        revenueAmount: 40,
        royaltyAmount: 1.6,
        advertisementRateApplied: 1.25,
        advertisementAmount: 0.5,
      }),
    );
  });
});


describe('POS partial return recognition', () => {
  async function returnedAmounts(fraction: Record<string, number>, purpose: Record<string, number> = {}) {
    const destination = { id: 10, itemCategoryId: 19, categoryName: 'Books', rateApplied: 6, advertisementRateApplied: 5, royaltyFree: false, isPos: true };
    const classification = { invoicePayment: { id: 99, paymentId: 1 }, destination, restoredSource: destination,
      destinationPaymentAmount: 226, destinationRevenueAmount: 200, destinationTaxAmount: 26,
      destinationRoyaltyAmount: 12, destinationAdvertisementAmount: 10,
      restoredPaymentAmount: 226, restoredRevenueAmount: 200, restoredTaxAmount: 26,
      restoredRoyaltyAmount: 12, restoredAdvertisementAmount: 10 };
    const ledger = { recordEvent: vi.fn().mockResolvedValue({ id: 20 }) };
    const recognition = { getAllocationPurposes: vi.fn().mockResolvedValue([{ ...destination, returnOriginalRevenue: 200, returnOriginalTax: 26, ...purpose }]) };
    const service = new InvoiceReturnRoyaltyService(ledger as never, recognition as never);
    vi.spyOn(service as any, 'findClassifications').mockResolvedValue([classification]);
    const manager = { getRepository: () => ({ find: async () => [{ id: 99 }] }) } as unknown as EntityManager;
    await service.recordInvoiceReturn(manager, { originalInvoiceId: 1, creditInvoiceId: 2, locationId: 1, customerId: 5,
      createdByUserId: 1, effectiveDate: new Date(), fractions: new Map([[returnCategoryKey(destination), fraction as any]]) });
    return ledger.recordEvent.mock.calls[0][1];
  }
  it('uses the returned tax share independently from royalty revenue', async () => {
    const event = await returnedAmounts({ previous: 0, next: 0.5, previousTax: 0, nextTax: 0, previousPayment: 0, nextPayment: 100/226 });
    expect(event).toMatchObject({ paymentAmount: -100, revenueAmount: -100, royaltyAmount: -6, advertisementAmount: -5 });
    expect(Math.abs(event.taxAmount)).toBe(0);
  });
  it('fully reverses a later payment when all goods left at payment time are returned', async () => {
    const event = await returnedAmounts({ previous: 0.5, next: 1, previousTax: 0.5, nextTax: 1, previousPayment: 0.5, nextPayment: 1 },
      { returnPreviousRevenue: 100, returnPreviousTax: 13 });
    expect(event).toMatchObject({ paymentAmount: -226, revenueAmount: -200, taxAmount: -26, royaltyAmount: -12, advertisementAmount: -10 });
  });
});
