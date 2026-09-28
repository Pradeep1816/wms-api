import { DataSource, EntityManager } from 'typeorm';
import { PaymentBasedRoyaltyReportRepository } from './payment-based-royalty-report.repository';

describe('payment-based royalty reporting', () => {
  it('separates historical and new activity without splitting category revenue or royalty rounding', async () => {
    const row = { locationId: '8', categoryId: '1', categoryName: 'Lessons', type: 'Invoice', rate: '6',
      advertisementRate: '2', royaltyFree: '0' };
    const query = vi.fn()
      .mockResolvedValueOnce([{ ...row, revenue: '10.125', royalty: '0.61', advertisement: '0.13', historicalAdvertisementRevenue: '4.125', historicalAdvertisementFreeRevenue: '0' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, revenue: '20.125', royalty: '1.21', advertisement: '0.07', historicalAdvertisementRevenue: '15.125', historicalAdvertisementFreeRevenue: '0' }])
      .mockResolvedValueOnce([]);
    const repository = new PaymentBasedRoyaltyReportRepository({ manager: { query } } as unknown as DataSource);
    const result = await repository.getPaymentBasedRoyaltyData([8], '2026-09-01', '2026-09-24');
    expect(result.categoryRows).toMatchObject([{ revenue: 30.25, royalty: 1.82, advertisement: 0.20,
      historicalAdvertisementRevenue: 19.25, historicalAdvertisementFreeRevenue: 0 }]);
    const sourceSql = String(query.mock.calls[0][0]);
    for (const alias of ['invoicePaymentRecord', 'originalPayment', 'lessonPaymentRecord', 'posPayment']) {
      expect(sourceSql).toContain(`${alias}.advertisementCalculationVersion`);
    }
    const ledgerSql = String(query.mock.calls[2][0]);
    expect(ledgerSql).toContain('royaltyTransaction.schemaVersion < 2');
    expect(ledgerSql).not.toContain('createdOn');
  });
  it('does not query when there are no locations', async () => {
    const query = vi.fn();
    const manager = { query } as unknown as EntityManager;
    const repository = new PaymentBasedRoyaltyReportRepository({
      manager,
    } as DataSource);

    await expect(
      repository.getPaymentBasedRoyaltyData([], '2026-08-01', '2026-08-31'),
    ).resolves.toEqual({ categoryRows: [], amounts: [] });
    expect(query).not.toHaveBeenCalled();
  });

  it('keeps SQL placeholders aligned and normalizes database values', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          locationId: '8',
          categoryId: '1',
          categoryName: 'Lessons',
          type: 'Invoice',
          rate: '3.00',
          royaltyFree: '0',
          revenue: '26.00',
          royalty: '0.78',
        },
      ])
      .mockResolvedValueOnce([
        { locationId: '8', tax: '3.38', royaltyFree: '0.00' },
      ])
      .mockResolvedValueOnce([
        {
          locationId: '8',
          categoryId: '1',
          categoryName: 'Lessons',
          type: 'Invoice',
          rate: '3.00',
          royaltyFree: '0',
          revenue: '100.00',
          royalty: '3.00',
        },
      ])
      .mockResolvedValueOnce([
        { locationId: '8', tax: '0.00', royaltyFree: '0.00' },
      ]);
    const manager = { query } as unknown as EntityManager;
    const repository = new PaymentBasedRoyaltyReportRepository({
      manager,
    } as DataSource);

    const result = await repository.getPaymentBasedRoyaltyData(
      [8],
      '2026-08-06',
      '2026-08-06',
    );

    for (const [sql, parameters] of query.mock.calls) {
      expect((sql.match(/\?/g) || []).length).toBe(parameters.length);
    }
    const categorySql = String(query.mock.calls[0][0]);
    const amountsSql = String(query.mock.calls[1][0]);
    expect(categorySql).toContain("status IN ('PAID', 'REFUNDED')");
    expect(categorySql).toContain('refundPaymentId AS eventPaymentId');
    expect(categorySql).toContain('posEvent.direction AS revenue');
    expect(categorySql).toContain("THEN 'POS' ELSE 'Invoice' END AS type");
    expect(categorySql).toContain("THEN 'POS Return' ELSE 'Invoice Return' END AS type");
    expect(categorySql).toContain("'Lesson' AS type");
    expect(categorySql).toContain("THEN 'POS Refund' ELSE 'POS' END AS type");
    expect(categorySql).toContain(
      'CASE WHEN COALESCE(posLine.royaltyFreeSnapshot, posItem.royaltyFree, 0) = 1',
    );
    expect(amountsSql).toContain('pos.tax * posEvent.direction AS tax');
    expect(amountsSql).toContain(
      'COALESCE(posLine.royaltyFreeSnapshot, posItem.royaltyFree, 0) = 1',
    );
    expect(result).toEqual({
      categoryRows: [
        {
          locationId: 8,
          categoryId: 1,
          categoryName: 'Lessons',
          type: 'Invoice',
          rate: 3,
          advertisementRate: 0,
          advertisement: 0,
          royaltyFree: false,
          revenue: 126,
          royalty: 3.78,
        },
      ],
      amounts: [{ locationId: 8, tax: 3.38, posTax: 0, royaltyFree: 0 }],
    });
  });

  it('prefers POS snapshots over generic royalty rows linked to POS payments', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const manager = { query } as unknown as EntityManager;
    const repository = new PaymentBasedRoyaltyReportRepository({
      manager,
    } as DataSource);

    await repository.getPaymentBasedRoyaltyData(
      [8],
      '2026-09-01',
      '2026-09-21',
    );

    const categorySql = String(query.mock.calls[0][0]);
    const amountsSql = String(query.mock.calls[1][0]);
    const ledgerCategorySql = String(query.mock.calls[2][0]);
    expect(ledgerCategorySql).toContain(
      "sourceType = 'RECURRING_PAYMENT' THEN 'Recurring Payment'",
    );
    expect(ledgerCategorySql).toContain(
      "sourceType = 'PAYMENT' THEN 'Receive Payment'",
    );
    expect(ledgerCategorySql).toContain("eventType = 'OPENING_CREDIT'");
    const ledgerAmountsSql = String(query.mock.calls[3][0]);

    expect(categorySql).toContain(
      "initialRoyalty.sourceType = 'POS_TRANSACTION'",
    );
    expect(amountsSql).toContain(
      "initialRoyalty.sourceType = 'POS_TRANSACTION'",
    );
    for (const sql of [ledgerCategorySql, ledgerAmountsSql]) {
      expect(sql).toContain('FROM pos_transaction linkedPos');
      expect(sql).toContain(
        'linkedPos.paymentId = royaltyTransaction.paymentId',
      );
      expect(sql).toContain(
        'linkedPos.refundPaymentId = royaltyTransaction.paymentId',
      );
    }
    for (const call of query.mock.calls as unknown[][]) {
      const sql = String(call[0]);
      const parameters = call[1] as unknown[];
      expect((sql.match(/\?/g) || []).length).toBe(parameters.length);
    }
  });
  it('keeps the same category and rate separate by transaction type', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          locationId: '8',
          categoryId: '5',
          categoryName: 'Method Books',
          type: 'Invoice',
          rate: '6.00',
          royaltyFree: '0',
          revenue: '25.00',
          royalty: '1.50',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          locationId: '8',
          categoryId: '5',
          categoryName: 'Method Books',
          type: 'POS',
          rate: '6.00',
          royaltyFree: '0',
          revenue: '50.00',
          royalty: '3.00',
        },
      ])
      .mockResolvedValueOnce([]);
    const manager = { query } as unknown as EntityManager;
    const repository = new PaymentBasedRoyaltyReportRepository({
      manager,
    } as DataSource);

    await expect(
      repository.getPaymentBasedRoyaltyData([8], '2026-09-18', '2026-09-18'),
    ).resolves.toEqual({
      categoryRows: [
        {
          locationId: 8,
          categoryId: 5,
          categoryName: 'Method Books',
          type: 'Invoice',
          rate: 6,
          advertisementRate: 0,
          advertisement: 0,
          royaltyFree: false,
          revenue: 25,
          royalty: 1.5,
        },
        {
          locationId: 8,
          categoryId: 5,
          categoryName: 'Method Books',
          type: 'POS',
          rate: 6,
          advertisementRate: 0,
          advertisement: 0,
          royaltyFree: false,
          revenue: 50,
          royalty: 3,
        },
      ],
      amounts: [],
    });
  });
  it('keeps royalty-free POS revenue visible with a zero effective rate and royalty', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          locationId: '8',
          categoryId: '5',
          categoryName: 'Accessories',
          type: 'POS',
          rate: '0.00',
          royaltyFree: '1',
          revenue: '20.00',
          royalty: '0.00',
        },
      ])
      .mockResolvedValueOnce([
        { locationId: '8', tax: '0.00', royaltyFree: '20.00' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const manager = { query } as unknown as EntityManager;
    const repository = new PaymentBasedRoyaltyReportRepository({
      manager,
    } as DataSource);

    await expect(
      repository.getPaymentBasedRoyaltyData([8], '2026-09-18', '2026-09-18'),
    ).resolves.toEqual({
      categoryRows: [
        {
          locationId: 8,
          categoryId: 5,
          categoryName: 'Accessories',
          type: 'POS',
          rate: 0,
          advertisementRate: 0,
          advertisement: 0,
          royaltyFree: true,
          revenue: 20,
          royalty: 0,
        },
      ],
      amounts: [{ locationId: 8, tax: 0, posTax: 0, royaltyFree: 20 }],
    });
  });

  it('gates direct and ledger POS activity when the pilot is disabled', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const manager = { query } as unknown as EntityManager;
    const repository = new PaymentBasedRoyaltyReportRepository({
      manager,
    } as DataSource);

    await repository.getPaymentBasedRoyaltyData(
      [8],
      '2026-09-01',
      '2026-09-30',
      false,
    );

    for (const [sql, parameters] of query.mock.calls) {
      expect((sql.match(/\?/g) || []).length).toBe(parameters.length);
      expect(parameters.at(-1)).toBe(0);
    }
    expect(String(query.mock.calls[0][0])).toContain('AND ? = 1');
    expect(String(query.mock.calls[1][0])).toContain('AND ? = 1');
    expect(String(query.mock.calls[2][0])).toContain(
      "sourceType <> 'POS_TRANSACTION'",
    );
    expect(String(query.mock.calls[3][0])).toContain(
      "sourceType <> 'POS_TRANSACTION'",
    );
  });

  it('uses the applied amount for a zero-tax historical lesson without a billing total', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const manager = { query } as unknown as EntityManager;
    const repository = new PaymentBasedRoyaltyReportRepository({
      manager,
    } as DataSource);

    await repository.getPaymentBasedRoyaltyData(
      [15],
      '2026-09-01',
      '2026-09-30',
    );

    const categorySql = String(query.mock.calls[0][0]);
    expect(categorySql).toContain('AND ABS(COALESCE(lesson.tax, 0)) < 0.005');
    expect(categorySql).toContain('THEN lessonPayment.amount');
  });
});
