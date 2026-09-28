import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { DataSource, QueryRunner } from 'typeorm';

// Runs real repositories/services against the approved development DB. Every
// fixture and settings edit uses one transaction that is always rolled back.
describe.skipIf(process.env.SMW_ADVERTISEMENT_RUNTIME_TEST !== '1')(
  'SMW-1659 persisted advertisement accounting',
  () => {
    let db: DataSource;
    let runner: QueryRunner;
    let load: NodeRequire;
    let ledger: any;
    let transactions: any;
    let reports: any;
    let resolveSnapshot: any;
    const date = '2030-01-17';

    beforeAll(async () => {
      load = createRequire(`${process.cwd()}/package.json`);
      // Use the built application metadata, just like the running local API.
      const { AppDataSource } = load('./dist/config/data-source');
      db = new DataSource({
        ...AppDataSource.options,
        logging: false,
        synchronize: false,
      });
      await db.initialize();
      runner = db.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      const { RoyaltyTransactionRepository } = load(
        './dist/payment/repositories/royalty-transaction.repository',
      );
      const { RoyaltyLedgerService } = load(
        './dist/payment/services/royalty-ledger.service',
      );
      const { PaymentBasedRoyaltyReportRepository } = load(
        './dist/report/repositories/payment-based-royalty-report.repository',
      );
      resolveSnapshot = load(
        './dist/utils/royality/royalty-calculation.util',
      ).resolveRoyaltySnapshot;
      transactions = new RoyaltyTransactionRepository();
      ledger = new RoyaltyLedgerService(transactions);
      reports = new PaymentBasedRoyaltyReportRepository({
        manager: runner.manager,
      });
    }, 30000);

    afterAll(async () => {
      if (runner?.isTransactionActive) await runner.rollbackTransaction();
      await runner?.release();
      if (db?.isInitialized) await db.destroy();
    });

    it('persists independent snapshots, groups mixed rates, reverses exact cents, and rejects changed replays', async () => {
      const manager = runner.manager;
      const [{ id: locationId }] = await manager.query(
        "SELECT id FROM location WHERE slug='training-location' AND isDeleted=0",
      );
      const [{ id: customerId }] = await manager.query(
        'SELECT id FROM user WHERE isDeleted=0 LIMIT 1',
      );
      const item = { id: 1, itemCategoryId: 5, royaltyFree: 0 };
      const read = () =>
        reports.getPaymentBasedRoyaltyData([locationId], date, date, true);
      const before = await read();
      expect(before.categoryRows).toHaveLength(0);
      await manager.query(
        'UPDATE location_category_royalty SET advertisement=2 WHERE locationId=? AND itemCategoryId=5',
        [locationId],
      );
      const oldSnapshot = await resolveSnapshot(manager, locationId, item);
      const base = {
        locationId,
        customerId,
        itemCategoryId: 5,
        categoryName: 'SMW-1659 QA Books',
        rateApplied: oldSnapshot.rate,
        paymentAmount: 100,
        revenueAmount: 100,
        taxAmount: 0,
        effectiveDate: new Date(`${date}T12:00:00Z`),
        eventType: 'PAYMENT_RECEIVED',
        sourceType: 'PAYMENT',
        idempotencyKey: `smw1659:${randomUUID()}`,
      };
      const first = await ledger.recordEvent(manager, {
        ...base,
        advertisementRateApplied: oldSnapshot.advertisementRate,
      });
      expect(Number(first.advertisementAmount)).toBe(2);
      await manager.query(
        'UPDATE location_category_royalty SET advertisement=7.25 WHERE locationId=? AND itemCategoryId=5',
        [locationId],
      );
      expect((await read()).categoryRows[0]).toMatchObject({
        advertisementRate: 2,
        advertisement: 2,
      });
      const newSnapshot = await resolveSnapshot(manager, locationId, item);
      expect(newSnapshot.advertisementRate).toBe(7.25);
      const second = await ledger.recordEvent(manager, {
        ...base,
        idempotencyKey: `smw1659:${randomUUID()}`,
        advertisementRateApplied: newSnapshot.advertisementRate,
      });
      const result = await read();
      expect(result.categoryRows).toHaveLength(2);
      expect(
        result.categoryRows.reduce(
          (sum: number, row: any) => sum + row.advertisement,
          0,
        ),
      ).toBe(9.25);
      expect(
        result.categoryRows.every((row: any) => row.rate === oldSnapshot.rate),
      ).toBe(true);
      await ledger.recordEvent(manager, {
        ...base,
        advertisementRateApplied: oldSnapshot.advertisementRate,
      });
      expect((await read()).categoryRows).toEqual(result.categoryRows);
      await expect(
        ledger.recordEvent(manager, { ...base, advertisementRateApplied: 9 }),
      ).rejects.toThrow('idempotency conflict');
      await expect(
        ledger.recordEvent(manager, {
          ...base,
          advertisementRateApplied: 2,
          advertisementAmount: 9,
        }),
      ).rejects.toThrow('idempotency conflict');
      await ledger.recordEvent(manager, {
        ...base,
        idempotencyKey: `smw1659:${randomUUID()}`,
        eventType: 'REFUND',
        sourceType: 'REFUND',
        paymentAmount: -100,
        revenueAmount: -100,
        advertisementRateApplied: Number(second.advertisementRateApplied),
        advertisementAmount: -Number(second.advertisementAmount),
        relatedRoyaltyTransactionId: second.id,
      });
      expect(
        (await read()).categoryRows.reduce(
          (sum: number, row: any) => sum + row.advertisement,
          0,
        ),
      ).toBe(2);
    });

    it('combines migrated history with a backdated new payment and an exact refund in real report SQL', async () => {
      const manager = runner.manager;
      const [{ id: locationId }] = await manager.query("SELECT id FROM location WHERE slug='training-location'");
      const [{ id: customerId }] = await manager.query('SELECT id FROM user WHERE isDeleted=0 LIMIT 1');
      const mixedDate = '2001-01-13';
      const read = () => reports.getPaymentBasedRoyaltyData([locationId], mixedDate, mixedDate, true);
      expect((await read()).categoryRows).toHaveLength(0);
      const base = { locationId, customerId, itemCategoryId: 5, categoryName: 'SMW-1659 mixed history',
        rateApplied: 6, advertisementRateApplied: 2, taxAmount: 0, effectiveDate: new Date(`${mixedDate}T12:00:00Z`),
        eventType: 'PAYMENT_RECEIVED', sourceType: 'PAYMENT' };
      for (const amount of [296.25, 358.75]) {
        const row = await ledger.recordEvent(manager, { ...base, paymentAmount: amount, revenueAmount: amount,
          idempotencyKey: `smw1659:${randomUUID()}` });
        await manager.query('UPDATE royalty_transaction SET schemaVersion=1 WHERE id=?', [row.id]);
      }
      const newPayment = await ledger.recordEvent(manager, { ...base, paymentAmount: 49.75, revenueAmount: 49.75,
        idempotencyKey: `smw1659:${randomUUID()}` });
      expect(Number(newPayment.advertisementAmount)).toBe(1);
      const mixed = await read();
      expect(mixed.categoryRows).toHaveLength(1);
      expect(mixed.categoryRows[0]).toMatchObject({ revenue: 704.75, historicalAdvertisementRevenue: 655, advertisement: 1 });
      const { applyHistoricalAdvertisement } = load('./dist/report/services/historical-advertisement');
      expect(applyHistoricalAdvertisement(mixed.categoryRows, 2)).toMatchObject({ historicalAmount: '13.10', savedCategoryAmount: '1.00' });
      expect(mixed.categoryRows[0].advertisement).toBe(14.10);
      await ledger.recordEvent(manager, { ...base, eventType: 'REFUND', sourceType: 'REFUND', paymentAmount: -49.75,
        revenueAmount: -49.75, advertisementAmount: -1, relatedRoyaltyTransactionId: newPayment.id,
        idempotencyKey: `smw1659:${randomUUID()}` });
      const refunded = await read();
      expect(applyHistoricalAdvertisement(refunded.categoryRows, 2)).toMatchObject({ historicalAmount: '13.10', savedCategoryAmount: '0.00' });
      expect(refunded.categoryRows.reduce((sum: number, row: any) => sum + Math.round(row.advertisement * 100), 0)).toBe(1310);
    });

    it('prorates a taxable invoice payment from its saved advertisement rate and exempts royalty-free lines', async () => {
      const { Invoice } = load('./dist/invoice/entities/invoice.entity');
      const { InvoiceLineItem } = load(
        './dist/invoice/entities/invoice-line-item.entity',
      );
      const { InvoicePayment } = load(
        './dist/invoice/entities/invoice-payment.entity',
      );
      const { Payment } = load('./dist/payment/entities/payment.entity');
      const manager = runner.manager;
      const [{ id: locationId }] = await runner.query(
        "SELECT id FROM location WHERE slug='training-location'",
      );
      const original = await manager.findOneByOrFail(Invoice, {
        locationId,
        type: 2,
        isDeleted: false,
      });
      const originalLine = await manager.findOneByOrFail(InvoiceLineItem, {
        invoiceId: original.id,
        isDeleted: false,
      });
      const effectiveDate = new Date('2030-01-18T12:00:00Z');
      const invoice = await manager.save(Invoice, {
        ...original,
        id: undefined,
        date: effectiveDate,
        subTotal: 100,
        tax: 13,
        total: 113,
        balance: 56.5,
        isCanceled: false,
      });
      const line = await manager.save(InvoiceLineItem, {
        ...originalLine,
        id: undefined,
        invoiceId: invoice.id,
        royaltyCategoryId: 5,
        royaltyRateApplied: 6,
        advertisementRateApplied: 2,
        royaltyFree: 0,
        netTotal: 100,
        amount: 100,
        unit: 1,
        taxRate: 13,
      });
      const payment = await manager.save(Payment, {
        userId: original.userId,
        paymentMethodId: 4,
        amount: 56.5,
        date: effectiveDate,
        isDeleted: 0,
        balance: 0,
        createdByUserId: original.userId,
        updatedByUserId: original.userId,
      });
      const allocation = await manager.save(InvoicePayment, {
        invoiceId: invoice.id,
        paymentId: payment.id,
        amount: 56.5,
        date: effectiveDate,
        isDeleted: 0,
        createdByUserId: original.userId,
        updatedByUserId: original.userId,
      });
      const read = () =>
        reports.getPaymentBasedRoyaltyData(
          [locationId],
          '2030-01-18',
          '2030-01-18',
          true,
        );
      const partial = await read();
      expect(partial.categoryRows).toEqual([
        expect.objectContaining({
          revenue: 50,
          royalty: 3,
          advertisementRate: 2,
          advertisement: 1,
        }),
      ]);
      expect(partial.amounts).toEqual([expect.objectContaining({ tax: 6.5 })]);
      await manager.update(Payment, payment.id, { amount: 113 });
      await manager.update(InvoicePayment, allocation.id, { amount: 113 });
      expect((await read()).categoryRows).toEqual([
        expect.objectContaining({ revenue: 100, royalty: 6, advertisement: 2 }),
      ]);
      await manager.update(InvoiceLineItem, line.id, { royaltyFree: 1 });
      expect((await read()).categoryRows).toEqual([
        expect.objectContaining({
          revenue: 100,
          royalty: 0,
          advertisementRate: 0,
          advertisement: 0,
          royaltyFree: true,
        }),
      ]);
    });

    it('initializes a new shared category from each location lesson advertisement rate', async () => {
      const { ItemRepository } = load(
        './dist/item/repositories/item.repository',
      );
      // Keep the real category creation SQL inside our enclosing rollback-only
      // transaction while exercising its normal repository orchestration.
      const scopedRunner = {
        manager: runner.manager,
        data: {},
        connect: async () => {},
        startTransaction: async () => {},
        commitTransaction: async () => {},
        rollbackTransaction: async () => {},
        release: async () => {},
      };
      const repository = new ItemRepository(
        { manager: { connection: { createQueryRunner: () => scopedRunner } } },
        {},
      );
      const [{ id: userId }] = await runner.query(
        'SELECT id FROM user WHERE isDeleted=0 LIMIT 1',
      );
      const created = await repository.createItemCategory(
        { name: `SMW-1659 QA ${randomUUID().slice(0, 8)}` },
        userId,
        1,
      );
      const rows = await runner.query(
        'SELECT r.advertisement,d.value FROM location_category_royalty r JOIN location_debt d ON d.locationId=r.locationId AND d.type=2 WHERE r.itemCategoryId=?',
        [created.id],
      );
      expect(rows.length).toBeGreaterThan(1);
      expect(
        rows.every(
          (row: any) => Number(row.advertisement) === Number(row.value),
        ),
      ).toBe(true);
    });

    it('preserves explicit zero and older-client advertisement settings when lesson rates change', async () => {
      const { LocationCategoryRoyaltyRepository } = load(
        './dist/location/repositories/location-category-royalty.repository',
      );
      const repository = new LocationCategoryRoyaltyRepository({});
      const [{ id: locationId }] = await runner.query(
        "SELECT id FROM location WHERE slug='training-location'",
      );
      const [{ id: userId }] = await runner.query(
        'SELECT id FROM user WHERE isDeleted=0 LIMIT 1',
      );
      const [original] = await runner.query(
        'SELECT royality FROM location_category_royalty WHERE locationId=? AND itemCategoryId=5',
        [locationId],
      );
      const [beforeLesson] = await runner.query(
        'SELECT advertisementBaseline FROM location_debt WHERE locationId=? AND type=2',
        [locationId],
      );
      await repository.saveRates(
        locationId,
        [
          {
            categoryId: 5,
            royality: Number(original.royality),
            advertisement: 0,
          },
        ],
        userId,
        runner.manager,
      );
      await repository.saveRates(
        locationId,
        [{ categoryId: 1, royality: 6, advertisement: 12 }],
        userId,
        runner.manager,
      );
      await repository.saveRates(
        locationId,
        [{ categoryId: 5, royality: 7 }],
        userId,
        runner.manager,
      );
      const [saved] = await runner.query(
        'SELECT royality, advertisement FROM location_category_royalty WHERE locationId=? AND itemCategoryId=5',
        [locationId],
      );
      expect(Number(saved.royality)).toBe(7);
      expect(Number(saved.advertisement)).toBe(0);
      const [lesson] = await runner.query(
        'SELECT value,advertisementBaseline FROM location_debt WHERE locationId=? AND type=2',
        [locationId],
      );
      expect(Number(lesson.value)).toBe(12);
      expect(Number(lesson.advertisementBaseline)).toBe(Number(beforeLesson.advertisementBaseline));
    });

    it('initializes a new location category advertisement and historical baseline', async () => {
      const { Location } = load('./dist/location/entities/location.entity');
      const { LocationCreateDebtRepository } = load(
        './dist/location/repositories/location-create-repositories/location-create-debt.repository',
      );
      const original = await runner.manager.findOneByOrFail(Location, {
        slug: 'training-location',
      });
      const location = await runner.manager.save(Location, {
        ...original,
        id: undefined,
        email: `smw1659-${randomUUID()}@example.invalid`,
        slug: `smw1659-${randomUUID().slice(0, 8)}`,
        name: 'SMW-1659 rollback QA',
      });
      const repository = new LocationCreateDebtRepository({});
      await repository.insertRoyaltyAndAdvertisement(
        location.id,
        6,
        3.25,
        runner.manager,
      );
      const rows = await runner.query(
        'SELECT advertisement FROM location_category_royalty WHERE locationId=?',
        [location.id],
      );
      expect(rows.length).toBeGreaterThan(1);
      expect(rows.every((row: any) => Number(row.advertisement) === 3.25)).toBe(
        true,
      );
      const [debt] = await runner.query(
        'SELECT advertisementBaseline FROM location_debt WHERE locationId=? AND type=2',
        [location.id],
      );
      expect(Number(debt.advertisementBaseline)).toBe(3.25);
    });
  },
);
