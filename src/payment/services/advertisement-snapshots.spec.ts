import { EntityManager } from 'typeorm';
import { RoyaltyLedgerService } from './royalty-ledger.service';
import { PaymentRoyaltyAdjustmentService } from './payment-royalty-adjustment.service';
import {
  RoyaltyReportService,
  RoyaltyReportPresentation,
} from '../../report/services/royalty-report.service';
import {
  RoyaltyTransactionEventType as Event,
  RoyaltyTransactionSourceType as Source,
} from '../enums/royalty-transaction.enum';
import { PaymentBasedRoyaltyReportRepository } from '../../report/repositories/payment-based-royalty-report.repository';
import { resolveRoyaltySnapshot } from '../../utils/royality/royalty-calculation.util';
import { ItemCategory } from '../../item/entities/item-category.entity';
import { LocationCategoryRoyalty } from '../../location/entities/location-category-royalty.entity';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LocationCategoryRoyaltyRateDto } from '../../location/dto/location-category-royalty.dto';

describe('SMW-1659 advertisement snapshots', () => {
  const manager = {
    create: vi.fn((_entity, value) => value),
  } as unknown as EntityManager;
  const ledger = new RoyaltyLedgerService({
    createOnce: vi.fn(async (_manager, value) => value),
  } as never);
  const base = {
    locationId: 1,
    customerId: 1,
    itemCategoryId: 5,
    categoryName: 'Books',
    rateApplied: 6,
    advertisementRateApplied: 2,
    paymentAmount: 100,
    revenueAmount: 100,
    effectiveDate: new Date('2026-09-23T12:00:00Z'),
    eventType: Event.PAYMENT_RECEIVED,
    sourceType: Source.PAYMENT,
    idempotencyKey: 'test',
  };

  it('captures the category advertisement independently from royalty and later configuration edits', async () => {
    const rate = { royality: 6, advertisement: 2 };
    const snapshotManager = {
      findOne: vi.fn(async (entity) =>
        entity === ItemCategory
          ? { id: 5 }
          : entity === LocationCategoryRoyalty
            ? rate
            : null,
      ),
    } as unknown as EntityManager;
    const oldSnapshot = await resolveRoyaltySnapshot(snapshotManager, 1, {
      id: 1,
      itemCategoryId: 5,
      royaltyFree: 0,
    });
    rate.advertisement = 4;
    const newSnapshot = await resolveRoyaltySnapshot(snapshotManager, 1, {
      id: 1,
      itemCategoryId: 5,
      royaltyFree: 0,
    });
    expect(oldSnapshot).toMatchObject({ rate: 6, advertisementRate: 2 });
    expect(newSnapshot).toMatchObject({ rate: 6, advertisementRate: 4 });
    const result = await ledger.recordEvent(manager, {
      ...base,
      advertisementRateApplied: oldSnapshot.advertisementRate,
    });
    expect(result).toMatchObject({
      royaltyAmount: 6,
      advertisementRateApplied: 2,
      advertisementAmount: 2,
      schemaVersion: 2,
    });
  });

  it('exempts royalty-free activity and prevents allocation from charging twice', async () => {
    expect(
      await ledger.recordEvent(manager, { ...base, royaltyFree: true }),
    ).toMatchObject({ advertisementRateApplied: 0, advertisementAmount: 0 });
    expect(
      await ledger.recordEvent(manager, {
        ...base,
        eventType: Event.ALLOCATION,
        paymentAmount: -100,
        revenueAmount: -100,
      }),
    ).toMatchObject({ advertisementAmount: 0 });
  });

  it('reverses negative half cents consistently and accepts an exact stored reversal', async () => {
    expect(
      await ledger.recordEvent(manager, {
        ...base,
        eventType: Event.REFUND,
        paymentAmount: -0.25,
        revenueAmount: -0.25,
      }),
    ).toMatchObject({ advertisementAmount: -0.01 });
    expect(
      await ledger.recordEvent(manager, {
        ...base,
        eventType: Event.REFUND,
        paymentAmount: -0.25,
        revenueAmount: -0.25,
        advertisementAmount: 0,
      }),
    ).toMatchObject({ advertisementAmount: 0 });
  });

  it.each([-1, 101, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid captured rate %s',
    async (advertisementRateApplied) => {
      await expect(
        ledger.recordEvent(manager, { ...base, advertisementRateApplied }),
      ).rejects.toThrow('Advertisement rate');
    },
  );

  it.each([-1, 101, 2.001, null])(
    'rejects invalid settings rate %s',
    async (advertisement) => {
      const dto = plainToInstance(LocationCategoryRoyaltyRateDto, {
        categoryId: 5,
        royality: 6,
        advertisement,
      });
      expect(
        (await validate(dto)).some(
          (error) => error.property === 'advertisement',
        ),
      ).toBe(true);
    },
  );

  it('uses captured rates in the New Report while Legacy continues using the current lesson percentage', async () => {
    const location = { id: 1, slug: 'training-location' };
    const context = {
      location,
      advertisementPercent: 9,
      historicalAdvertisementPercent: 2,
      locationRoyaltyPercent: 6,
      taxPercent: 13,
      payments: 1500,
      giftCardPayments: 0,
      hasLedgerActivity: true,
    };
    const repository = {
      findLocationBySlug: vi.fn(async () => location),
      getReportContext: vi.fn(async () => context),
      getLegacyPosRoyaltyAmounts: vi.fn(async () => ({
        paymentsReceived: 0,
        taxCollected: 0,
        royaltyFreeItems: 0,
      })),
      getLegacyAmounts: vi.fn(async () => ({
        taxCollected: 0,
        royaltyFreeItems: 0,
      })),
      getPaymentBasedRoyaltyData: vi.fn(async () => ({
        categoryRows: [
          {
            categoryId: 1,
            categoryName: 'Lesson',
            type: 'Lesson',
            rate: 6,
            advertisementRate: 2,
            revenue: 1000,
            royalty: 60,
            advertisement: 20,
          },
          {
            categoryId: 5,
            categoryName: 'Books',
            type: 'Invoice',
            rate: 6,
            advertisementRate: 1,
            revenue: 500,
            royalty: 30,
            advertisement: 5,
          },
        ],
        amounts: [],
      })),
    };
    const service = new RoyaltyReportService(repository as never);
    const current = await service.getRoyalty('training-location');
    expect(current.body).toMatchObject({
      'Advertisement (Category Rates)': '25.00',
      'Royalty (Category Rates)': '90.00',
      Subtotal: '115.00',
      Tax: '14.95',
      Total: '129.95',
    });
    context.advertisementPercent = 12;
    expect((await service.getRoyalty('training-location')).body).toEqual(
      current.body,
    );
    const legacy = await service.getRoyalty(
      'training-location',
      undefined,
      undefined,
      RoyaltyReportPresentation.STANDARD,
    );
    expect(legacy.body).toMatchObject({
      'Advertisement (12%)': '180.00',
      'Royalty (6%)': '90.00',
    });
    context.hasLedgerActivity = false;
    expect((await service.getRoyalty('training-location')).body).toMatchObject({
      'Advertisement (2%)': '30.00',
    });
  });

  it('keeps identical royalty categories separate when captured advertisement rates differ', async () => {
    const row = {
      locationId: 1,
      categoryId: 5,
      categoryName: 'Books',
      type: 'Invoice',
      rate: 6,
      royaltyFree: false,
      revenue: 100,
      royalty: 6,
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        { ...row, advertisementRate: 1, advertisement: 1 },
        { ...row, advertisementRate: 2, advertisement: 2 },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { ...row, advertisementRate: 2, advertisement: 2 },
      ])
      .mockResolvedValueOnce([]);
    const repository = new PaymentBasedRoyaltyReportRepository({
      manager: { query },
    } as never);
    const result = await repository.getPaymentBasedRoyaltyData(
      [1],
      '2026-09-01',
      '2026-09-30',
    );
    expect(result.categoryRows).toHaveLength(2);
    expect(result.categoryRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          advertisementRate: 1,
          revenue: 100,
          advertisement: 1,
        }),
        expect.objectContaining({
          advertisementRate: 2,
          revenue: 200,
          advertisement: 4,
        }),
      ]),
    );
  });

  it('refunds a split credit without creating a rounding cent or using a new rate', async () => {
    const balance = {
      transaction: {
        ...base,
        id: 1,
        paymentId: 1,
        originalPaymentId: 1,
        paymentAmount: 0.5,
        revenueAmount: 0.5,
        royaltyAmount: 0.03,
        advertisementAmount: 0.01,
      },
      remainingPaymentAmount: 0.5,
      remainingRevenueAmount: 0.5,
      remainingTaxAmount: 0,
      activeRevenueAmount: 0.5,
      activeTaxAmount: 0,
      activeRoyaltyAmount: 0.03,
      activeAdvertisementAmount: 0.01,
    };
    const recordEvent = vi.fn(async (_manager, event) => event);
    const service = new PaymentRoyaltyAdjustmentService(
      {} as never,
      { findRecognitionBalances: vi.fn(async () => [balance]) } as never,
      { recordEvent } as never,
      {} as never,
    );
    const refund = {
      originalPaymentId: 1,
      refundPaymentId: 2,
      locationId: 1,
      customerId: 1,
      amount: 0.25,
      effectiveDate: base.effectiveDate,
      createdByUserId: 1,
    };
    await service.recordCreditRefund(manager, refund);
    await service.recordCreditRefund(manager, {
      ...refund,
      refundPaymentId: 3,
    });
    const events = recordEvent.mock.calls.map((call) => call[1]);
    expect(events.map((event) => event.advertisementAmount)).toEqual([
      -0, -0.01,
    ]);
    expect(events.every((event) => event.advertisementRateApplied === 2)).toBe(
      true,
    );
    expect(balance.activeAdvertisementAmount).toBe(0);
  });

  it.each([false, true])(
    'preserves source rates for same-category allocation and captures cross-category rates (same category: %s)',
    async (sameCategory) => {
      const source = {
        transaction: {
          ...base,
          itemCategoryId: 1,
          categoryName: 'Lesson',
          id: 1,
          paymentId: 1,
          originalPaymentId: 1,
          royaltyAmount: 6,
          advertisementAmount: 2,
        },
        remainingPaymentAmount: 100,
        remainingRevenueAmount: 100,
        remainingTaxAmount: 0,
        activeRevenueAmount: 100,
        activeTaxAmount: 0,
        activeRoyaltyAmount: 6,
        activeAdvertisementAmount: 2,
      };
      const purpose = {
        itemCategoryId: sameCategory ? 1 : 5,
        categoryName: 'Books',
        rateApplied: 6,
        advertisementRateApplied: 1,
        paymentAmount: 100,
        revenueAmount: sameCategory ? 80 : 100,
        taxAmount: sameCategory ? 20 : 0,
        royaltyFree: false,
      };
      const recordEvent = vi.fn(async (_manager, event) => ({
        ...event,
        id: 2,
      }));
      const service = new PaymentRoyaltyAdjustmentService(
        { getAllocationPurposes: vi.fn(async () => [purpose]) } as never,
        {
          hasProcessedAllocation: vi.fn(async () => false),
          findRecognitionBalances: vi.fn(async () => [source]),
        } as never,
        { recordEvent } as never,
        {} as never,
      );
      await service.processCreditAllocation(manager, {
        originalPaymentId: 1,
        locationId: 1,
        customerId: 1,
        amount: 100,
        allocationId: 1,
        sourceType: Source.INVOICE_PAYMENT,
        effectiveDate: base.effectiveDate,
        createdByUserId: 1,
      });
      if (sameCategory) {
        expect(recordEvent.mock.calls.map((call) => call[1])).toEqual([
          expect.objectContaining({
            eventType: Event.ALLOCATION,
            advertisementRateApplied: 2,
          }),
          expect.objectContaining({
            eventType: Event.RECLASSIFICATION,
            advertisementRateApplied: 2,
            advertisementAmount: -0.4,
            revenueAmount: -20,
          }),
        ]);
        expect(source.activeAdvertisementAmount).toBe(1.6);
        return;
      }
      expect(recordEvent.mock.calls.map((call) => call[1])).toEqual([
        expect.objectContaining({
          eventType: Event.TRANSFER_OUT,
          advertisementRateApplied: 2,
          advertisementAmount: -2,
        }),
        expect.objectContaining({
          eventType: Event.TRANSFER_IN,
          advertisementRateApplied: 1,
          advertisementAmount: 1,
        }),
      ]);
    },
  );
});
