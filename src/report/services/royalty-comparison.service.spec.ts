import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoyaltyComparisonService } from './royalty-comparison.service';

describe('RoyaltyComparisonService legacy POS royalty', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('splits POS source rows and applies the displayed location rate to all eligible revenue', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const location = {
      id: 1,
      provinceId: 1,
      slug: 'training-location',
    };
    const royaltyReportRepository = {
      findLocationBySlug: vi.fn().mockResolvedValue(location),
      getReportContext: vi.fn().mockResolvedValue({
        location,
        advertisementPercent: 2,
        locationRoyaltyPercent: 6,
        taxPercent: 13,
        payments: 226,
        giftCardPayments: 0,
        hasLedgerActivity: false,
      }),
      getLegacyAmounts: vi.fn().mockResolvedValue({
        taxCollected: 10,
        royaltyFreeItems: 5,
      }),
      getLegacyPosRoyaltyAmounts: vi.fn().mockResolvedValue({
        paymentsReceived: 113,
        taxCollected: 13,
        royaltyFreeItems: 20,
      }),
    };
    const service = new RoyaltyComparisonService(
      royaltyReportRepository as never,
      {} as never,
    );

    const result = await service.getLegacyReport(
      'training-location',
      '2026-09-01',
      '2026-09-30',
    );

    expect(
      royaltyReportRepository.getLegacyPosRoyaltyAmounts,
    ).toHaveBeenCalledWith(1, '2026-09-01', '2026-09-30');
    expect(result.body).toEqual({
      'Payments Received': '113.00',
      'Payments Received from POS': '113.00',
      'Gift Card Payments': '0.00',
      'Tax Collected': '10.00',
      'Tax Collected from POS': '13.00',
      'Royalty Free Items': '5.00',
      'Royalty Free Items from POS': '20.00',
      Revenue: '178.00',
      'Advertisement (2%)': '3.56',
      'Royalty (6%)': '10.68',
      Subtotal: '14.24',
      Tax: '1.85',
      Total: '16.09',
    });
  });

  it('records refund-date advertisement and royalty as negative legacy activity', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const location = {
      id: 1,
      provinceId: 1,
      slug: 'training-location',
    };
    const royaltyReportRepository = {
      findLocationBySlug: vi.fn().mockResolvedValue(location),
      getReportContext: vi.fn().mockResolvedValue({
        location,
        advertisementPercent: 5,
        locationRoyaltyPercent: 6,
        taxPercent: 13,
        payments: -22.59,
        giftCardPayments: 0,
        hasLedgerActivity: false,
      }),
      getLegacyAmounts: vi.fn().mockResolvedValue({
        taxCollected: 0,
        royaltyFreeItems: 0,
      }),
      getLegacyPosRoyaltyAmounts: vi.fn().mockResolvedValue({
        paymentsReceived: -22.59,
        taxCollected: -2.6,
        royaltyFreeItems: 0,
      }),
    };
    const service = new RoyaltyComparisonService(
      royaltyReportRepository as never,
      {} as never,
    );

    const result = await service.getLegacyReport(
      'training-location',
      '2026-09-21',
      '2026-09-21',
    );

    expect(result.body).toMatchObject({
      'Payments Received from POS': '-22.59',
      'Tax Collected from POS': '-2.60',
      Revenue: '-19.99',
      'Advertisement (5%)': '-1.00',
      'Royalty (6%)': '-1.20',
      Subtotal: '-2.20',
      Tax: '-0.29',
      Total: '-2.49',
    });
  });

  it('does not load or expose POS amounts outside pilot locations in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const location = { id: 2, provinceId: 1, slug: 'woodbridge' };
    const royaltyReportRepository = {
      findLocationBySlug: vi.fn().mockResolvedValue(location),
      getReportContext: vi.fn().mockResolvedValue({
        location,
        advertisementPercent: 2,
        locationRoyaltyPercent: 6,
        taxPercent: 13,
        payments: 100,
        giftCardPayments: 0,
        hasLedgerActivity: false,
      }),
      getLegacyAmounts: vi.fn().mockResolvedValue({
        taxCollected: 10,
        royaltyFreeItems: 5,
      }),
      getLegacyPosRoyaltyAmounts: vi.fn(),
    };
    const service = new RoyaltyComparisonService(
      royaltyReportRepository as never,
      {} as never,
    );

    const result = await service.getLegacyReport(
      'woodbridge',
      '2026-09-01',
      '2026-09-30',
    );

    expect(
      royaltyReportRepository.getLegacyPosRoyaltyAmounts,
    ).not.toHaveBeenCalled();
    expect(result.body).not.toHaveProperty('Payments Received from POS');
    expect(result.body).not.toHaveProperty('Tax Collected from POS');
    expect(result.body).not.toHaveProperty('Royalty Free Items from POS');
    expect(result.body).toMatchObject({
      Revenue: '85.00',
      'Royalty (6%)': '5.10',
      Subtotal: '6.80',
    });
  });
});
