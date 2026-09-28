import {
  RoyaltyReportPresentation,
  RoyaltyReportService,
} from './royalty-report.service';

describe('RoyaltyReportService', () => {
  const location = { id: 1, provinceId: 1, slug: 'training-location' };

  it('restores historical advertisement and fee tax while preserving mixed saved category fees and Legacy', async () => {
    const repository = {
      findLocationBySlug: vi.fn().mockResolvedValue(location),
      getReportContext: vi.fn().mockResolvedValue({ location, advertisementPercent: 9,
        historicalAdvertisementPercent: 2, locationRoyaltyPercent: 6, taxPercent: 13,
        payments: 755, giftCardPayments: 0, hasLedgerActivity: true }),
      getLegacyAmounts: vi.fn().mockResolvedValue({ taxCollected: 0, royaltyFreeItems: 0 }),
      getLegacyPosRoyaltyAmounts: vi.fn().mockResolvedValue({ paymentsReceived: 0, taxCollected: 0, royaltyFreeItems: 0 }),
      getPaymentBasedRoyaltyData: vi.fn().mockResolvedValue({
        categoryRows: [{ locationId: 1, categoryId: 1, categoryName: 'Lessons', type: 'Receive Payment',
          rate: 6, advertisementRate: 2, royaltyFree: false, revenue: 755, royalty: 45.30,
          advertisement: 7.13, historicalAdvertisementRevenue: 655, historicalAdvertisementFreeRevenue: 0 }],
        amounts: [{ locationId: 1, tax: 0, posTax: 0, royaltyFree: 0 }],
      }),
    };
    const service = new RoyaltyReportService(repository as never);
    const enhanced = await service.getRoyalty(location.slug, '2026-09-01', '2026-09-24');
    expect(enhanced.body).toMatchObject({
      Revenue: '755.00', 'Advertisement (Category Rates)': '20.23', 'Royalty (Category Rates)': '45.30',
      Subtotal: '65.53', Tax: '8.52', Total: '74.05',
    });
    expect(enhanced.body['Royalty By Category']).toMatchObject([{ advertisement: '20.23' }]);
    expect(enhanced.meta).toMatchObject({ advertisementCalculation: {
      historicalRevenue: '655.00', historicalRate: '2.00', historicalAmount: '13.10', savedCategoryAmount: '7.13',
    } });
    const legacy = await service.getRoyalty(location.slug, '2026-09-01', '2026-09-24', RoyaltyReportPresentation.STANDARD);
    expect(legacy.body).toMatchObject({ 'Advertisement (9%)': '67.95', 'Royalty (6%)': '45.30', Total: '127.97' });
    expect(legacy.meta).not.toHaveProperty('advertisementCalculation');
    expect(repository.getPaymentBasedRoyaltyData).toHaveBeenCalledTimes(1);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses legacy formula when the period has no ledger recognition', async () => {
    const royaltyReportRepository = {
      findLocationBySlug: vi.fn().mockResolvedValue(location),
      getReportContext: vi.fn().mockResolvedValue({
        location,
        advertisementPercent: 2,
        historicalAdvertisementPercent: 2,
        locationRoyaltyPercent: 6,
        taxPercent: 13,
        payments: 1000,
        giftCardPayments: 0,
        hasLedgerActivity: false,
      }),
      getLegacyAmounts: vi.fn().mockResolvedValue({
        taxCollected: 235.12,
        royaltyFreeItems: 50,
      }),
      getLegacyPosRoyaltyAmounts: vi.fn().mockResolvedValue({
        paymentsReceived: 0,
        taxCollected: 0,
        royaltyFreeItems: 0,
      }),
      getPaymentBasedRoyaltyData: vi.fn(),
    };

    const service = new RoyaltyReportService(royaltyReportRepository as never);
    const result = await service.getRoyalty(
      'training-location',
      '2026-07-01',
      '2026-07-31',
    );

    expect(
      royaltyReportRepository.getPaymentBasedRoyaltyData,
    ).not.toHaveBeenCalled();
    expect(result.meta).toMatchObject({ calculationMode: 'legacy' });
    expect(result.body).toMatchObject({
      'Payments Received': '1000.00',
      'Tax Collected': '235.12',
      'Royalty Free Items': '50.00',
      Revenue: '714.88',
      'Gross Category Revenue': '714.88',
      'Advertisement (2%)': '14.30',
      'Royalty (6%)': '42.89',
    });
    expect(result.body['Royalty By Category']).toEqual([
      {
        categoryId: 1,
        categoryName: 'Lesson',
        type: 'Lesson',
        rate: '6.00',
        royaltyFree: false,
        revenue: '714.88',
        advertisementRate: '2.00',
        advertisement: '14.30',
        royalty: '42.89',
      },
    ]);
  });

  it('uses new category/ledger formula when the period has ledger recognition', async () => {
    const royaltyReportRepository = {
      findLocationBySlug: vi.fn().mockResolvedValue(location),
      getReportContext: vi.fn().mockResolvedValue({
        location,
        advertisementPercent: 5,
        historicalAdvertisementPercent: 5,
        locationRoyaltyPercent: 6,
        taxPercent: 13,
        payments: 57.5,
        giftCardPayments: 0,
        hasLedgerActivity: true,
      }),
      getLegacyAmounts: vi.fn(),
      getLegacyPosRoyaltyAmounts: vi.fn().mockResolvedValue({
        paymentsReceived: 0,
        taxCollected: 0,
        royaltyFreeItems: 0,
      }),
      getPaymentBasedRoyaltyData: vi.fn().mockResolvedValue({
        categoryRows: [
          {
            locationId: 1,
            categoryId: 1,
            categoryName: 'Lesson',
            type: 'Lesson',
            rate: 3,
            royaltyFree: false,
            revenue: 97.5,
            advertisementRate: 5,
            advertisement: 4.88,
            royalty: 2.93,
          },
          {
            locationId: 1,
            categoryId: 5,
            categoryName: 'Methods Books',
            type: 'Invoice Return',
            rate: 4,
            royaltyFree: false,
            revenue: -40,
            advertisementRate: 5,
            advertisement: -2,
            royalty: -1.6,
          },
          {
            locationId: 1,
            categoryId: 10,
            categoryName: 'Payment Credit',
            type: 'Receive Payment',
            rate: 0,
            royaltyFree: false,
            revenue: 0,
            advertisementRate: 5,
            advertisement: 0,
            royalty: 0,
          },
        ],
        amounts: [{ locationId: 1, tax: 0, royaltyFree: 0 }],
      }),
    };

    const service = new RoyaltyReportService(royaltyReportRepository as never);
    const result = await service.getRoyalty(
      'training-location',
      '2026-08-11',
      '2026-08-11',
    );

    expect(royaltyReportRepository.getLegacyAmounts).not.toHaveBeenCalled();
    expect(
      royaltyReportRepository.getPaymentBasedRoyaltyData,
    ).toHaveBeenCalledWith(location.id, '2026-08-11', '2026-08-11', true);
    expect(result.meta).toMatchObject({ calculationMode: 'ledger' });
    expect(result.body['Royalty By Category']).toEqual([
      {
        categoryId: 1,
        categoryName: 'Lesson',
        type: 'Lesson',
        rate: '3.00',
        royaltyFree: false,
        revenue: '97.50',
        advertisementRate: '5.00',
        advertisement: '4.88',
        royalty: '2.93',
      },
      {
        categoryId: 5,
        categoryName: 'Methods Books',
        type: 'Invoice Return',
        rate: '4.00',
        royaltyFree: false,
        revenue: '-40.00',
        advertisementRate: '5.00',
        advertisement: '-2.00',
        royalty: '-1.60',
      },
    ]);
    expect(result.body).toMatchObject({
      'Payments Received': '57.50',
      Revenue: '57.50',
      'Gross Category Revenue': '57.50',
      'Advertisement (Category Rates)': '2.88',
      'Royalty (Category Rates)': '1.33',
      Subtotal: '4.21',
      Tax: '0.55',
      Total: '4.76',
    });
  });

  it('shows royalty-free POS activity at 0% and reconciles source totals', async () => {
    const royaltyReportRepository = {
      findLocationBySlug: vi.fn().mockResolvedValue(location),
      getReportContext: vi.fn().mockResolvedValue({
        location,
        advertisementPercent: 5,
        historicalAdvertisementPercent: 5,
        locationRoyaltyPercent: 6,
        taxPercent: 13,
        payments: 189.5,
        giftCardPayments: 0,
        hasLedgerActivity: false,
      }),
      getLegacyAmounts: vi.fn(),
      getLegacyPosRoyaltyAmounts: vi.fn().mockResolvedValue({
        paymentsReceived: 76.5,
        taxCollected: 6.5,
        royaltyFreeItems: 20,
      }),
      getPaymentBasedRoyaltyData: vi.fn().mockResolvedValue({
        categoryRows: [
          {
            locationId: 1,
            categoryId: 1,
            categoryName: 'Lessons',
            type: 'Lesson',
            rate: 6,
            royaltyFree: false,
            revenue: 100,
            advertisementRate: 5,
            advertisement: 5,
            royalty: 6,
          },
          {
            locationId: 1,
            categoryId: 5,
            categoryName: 'Method Books',
            type: 'POS',
            rate: 5,
            royaltyFree: false,
            revenue: 50,
            advertisementRate: 5,
            advertisement: 2.5,
            royalty: 2.5,
          },
          {
            locationId: 1,
            categoryId: 6,
            categoryName: 'Accessories',
            type: 'POS',
            rate: 0,
            royaltyFree: true,
            revenue: 20,
            advertisementRate: 0,
            advertisement: 0,
            royalty: 0,
          },
        ],
        amounts: [{ locationId: 1, tax: 19.5, royaltyFree: 20 }],
      }),
    };

    const service = new RoyaltyReportService(royaltyReportRepository as never);
    const result = await service.getRoyalty(
      'training-location',
      '2026-09-18',
      '2026-09-18',
    );

    expect(result.meta).toMatchObject({ calculationMode: 'ledger' });
    expect(result.body).toMatchObject({
      'Payments Received': '189.50',
      'Tax Collected': '19.50',
      'Royalty Free Items': '20.00',
      'Gross Category Revenue': '170.00',
      Revenue: '150.00',
      'Advertisement (Category Rates)': '7.50',
      'Royalty (Category Rates)': '8.50',
      Subtotal: '16.00',
      Tax: '2.08',
      Total: '18.08',
    });
    expect(result.body).not.toHaveProperty('Payments Received from POS');
    expect(result.body).not.toHaveProperty('Tax Collected from POS');
    expect(result.body).not.toHaveProperty('Royalty Free Items from POS');
    expect(result.body['Royalty By Category']).toContainEqual({
      categoryId: 6,
      categoryName: 'Accessories',
      type: 'POS',
      rate: '0.00',
      advertisementRate: '0.00',
      advertisement: '0.00',
      royaltyFree: true,
      revenue: '20.00',
      royalty: '0.00',
    });
  });

  it('excludes POS activity outside the production pilot', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const nonPilotLocation = {
      id: 2,
      provinceId: 1,
      slug: 'woodbridge',
    };
    const royaltyReportRepository = {
      findLocationBySlug: vi.fn().mockResolvedValue(nonPilotLocation),
      getReportContext: vi.fn().mockResolvedValue({
        location: nonPilotLocation,
        advertisementPercent: 5,
        historicalAdvertisementPercent: 5,
        locationRoyaltyPercent: 6,
        taxPercent: 13,
        payments: 113,
        giftCardPayments: 0,
        hasLedgerActivity: true,
      }),
      getLegacyAmounts: vi.fn(),
      getLegacyPosRoyaltyAmounts: vi.fn().mockResolvedValue({
        paymentsReceived: 50,
        taxCollected: 5,
        royaltyFreeItems: 0,
      }),
      getPaymentBasedRoyaltyData: vi.fn().mockResolvedValue({
        categoryRows: [
          {
            locationId: 2,
            categoryId: 1,
            categoryName: 'Lessons',
            type: 'Lesson',
            rate: 6,
            royaltyFree: false,
            revenue: 55,
            advertisementRate: 5,
            advertisement: 2.75,
            royalty: 3.3,
          },
        ],
        amounts: [{ locationId: 2, tax: 8, royaltyFree: 0 }],
      }),
    };

    const service = new RoyaltyReportService(royaltyReportRepository as never);
    const result = await service.getRoyalty(
      'woodbridge',
      '2026-09-18',
      '2026-09-18',
    );

    expect(
      royaltyReportRepository.getPaymentBasedRoyaltyData,
    ).toHaveBeenCalledWith(
      nonPilotLocation.id,
      '2026-09-18',
      '2026-09-18',
      false,
    );
    expect(result.body).toMatchObject({
      'Payments Received': '63.00',
      'Tax Collected': '8.00',
      'Gross Category Revenue': '55.00',
      Revenue: '55.00',
    });
    expect(result.body).not.toHaveProperty('Payments Received from POS');
    expect(result.body).not.toHaveProperty('Tax Collected from POS');
    expect(result.body).not.toHaveProperty('Royalty Free Items from POS');
  });

  it('uses the legacy location-rate formula for the standard presentation even when ledger activity exists', async () => {
    const royaltyReportRepository = {
      findLocationBySlug: vi.fn().mockResolvedValue(location),
      getReportContext: vi.fn().mockResolvedValue({
        location,
        advertisementPercent: 5,
        historicalAdvertisementPercent: 5,
        locationRoyaltyPercent: 6,
        taxPercent: 13,
        payments: 100,
        giftCardPayments: 0,
        hasLedgerActivity: true,
      }),
      getLegacyAmounts: vi.fn().mockResolvedValue({
        taxCollected: 10,
        royaltyFreeItems: 5,
      }),
      getPaymentBasedRoyaltyData: vi.fn(),
    };

    const service = new RoyaltyReportService(royaltyReportRepository as never);
    const result = await service.getRoyalty(
      'training-location',
      '2026-08-11',
      '2026-08-11',
      RoyaltyReportPresentation.STANDARD,
    );

    expect(royaltyReportRepository.getLegacyAmounts).toHaveBeenCalledWith(
      location.id,
      '2026-08-11',
      '2026-08-11',
    );
    expect(
      royaltyReportRepository.getPaymentBasedRoyaltyData,
    ).not.toHaveBeenCalled();
    expect(result.meta).toMatchObject({ calculationMode: 'legacy' });
    expect(result.body).toMatchObject({
      'Payments Received': '100.00',
      'Tax Collected': '10.00',
      'Royalty Free Items': '5.00',
      Revenue: '85.00',
      'Advertisement (5%)': '4.25',
      'Royalty (6%)': '5.10',
      Subtotal: '9.35',
      Tax: '1.22',
      Total: '10.57',
    });
    expect(result.body).not.toHaveProperty('Gross Category Revenue');
    expect(result.body).not.toHaveProperty('Royalty (Category Rates)');
    expect(result.body).not.toHaveProperty('Royalty By Category');
  });

  it('uses the legacy formula for every location in the standard all-locations report', async () => {
    const secondLocation = {
      id: 2,
      provinceId: 1,
      slug: 'second-location',
    };
    const royaltyReportRepository = {
      findActiveLocations: vi
        .fn()
        .mockResolvedValue([location, secondLocation]),
      getReportContext: vi
        .fn()
        .mockResolvedValueOnce({
          location,
          advertisementPercent: 2,
          historicalAdvertisementPercent: 2,
          locationRoyaltyPercent: 6,
          taxPercent: 13,
          payments: 100,
          giftCardPayments: 0,
          hasLedgerActivity: true,
        })
        .mockResolvedValueOnce({
          location: secondLocation,
          advertisementPercent: 2,
          historicalAdvertisementPercent: 2,
          locationRoyaltyPercent: 5,
          taxPercent: 13,
          payments: 200,
          giftCardPayments: 0,
          hasLedgerActivity: true,
        }),
      getLegacyAmounts: vi
        .fn()
        .mockResolvedValueOnce({ taxCollected: 0, royaltyFreeItems: 0 })
        .mockResolvedValueOnce({ taxCollected: 0, royaltyFreeItems: 0 }),
      getPaymentBasedRoyaltyData: vi.fn(),
    };

    const service = new RoyaltyReportService(royaltyReportRepository as never);
    const result = await service.getRoyaltyForAllLocations(
      '2026-08-01',
      '2026-08-31',
      RoyaltyReportPresentation.STANDARD,
    );

    expect(
      royaltyReportRepository.getPaymentBasedRoyaltyData,
    ).not.toHaveBeenCalled();
    expect(result.body).toHaveLength(2);
    expect(result.body[0]).toMatchObject({
      body: { Revenue: '100.00', 'Royalty (6%)': '6.00' },
      meta: { calculationMode: 'legacy' },
    });
    expect(result.body[1]).toMatchObject({
      body: { Revenue: '200.00', 'Royalty (5%)': '10.00' },
      meta: { calculationMode: 'legacy' },
    });
  });
});
