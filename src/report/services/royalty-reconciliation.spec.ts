import {
  RoyaltyReportPresentation,
  RoyaltyReportService,
} from './royalty-report.service';
import { PaymentBasedRoyaltyReportRepository } from '../repositories/payment-based-royalty-report.repository';
import type { DataSource } from 'typeorm';

function fixture({ tax = 216, posTax = 38.87, ledger = true } = {}) {
  const location = { id: 1, slug: 'training-location' };
  const repository = {
    findLocationBySlug: vi.fn().mockResolvedValue(location),
    findActiveLocations: vi.fn().mockResolvedValue([location]),
    getReportContext: vi
      .fn()
      .mockResolvedValue({
        location,
        payments: 113,
        giftCardPayments: 0,
        advertisementPercent: 6,
        historicalAdvertisementPercent: 5,
        locationRoyaltyPercent: 6,
        taxPercent: 13,
        hasLedgerActivity: ledger,
      }),
    getLegacyAmounts: vi
      .fn()
      .mockResolvedValue({ taxCollected: 13, royaltyFreeItems: 0 }),
    getLegacyPosRoyaltyAmounts: vi
      .fn()
      .mockResolvedValue({
        paymentsReceived: 0,
        taxCollected: 0,
        royaltyFreeItems: 0,
      }),
    getPaymentBasedRoyaltyData: vi
      .fn()
      .mockResolvedValue({
        categoryRows: [],
        amounts: [{ locationId: 1, tax, posTax, royaltyFree: 0 }],
      }),
  };
  return { repository, service: new RoyaltyReportService(repository as never) };
}

describe('royalty collected tax reconciliation metadata', () => {
  it.each([
    [216, 38.87, '177.13', '38.87', '216.00'],
    [-13, -2.6, '-10.40', '-2.60', '-13.00'],
    [10.005, 2.004, '8.01', '2.00', '10.01'],
    [0, 0, '0.00', '0.00', '0.00'],
  ])(
    'preserves total tax %s and identifies actual POS tax %s',
    async (tax, posTax, nonPos, pos, total) => {
      const { service } = fixture({ tax, posTax });
      const result = await service.getRoyalty('training-location');
      expect(result.meta).toMatchObject({
        collectedTaxBreakdown: { nonPos, pos, total },
      });
      expect(result.body['Tax Collected']).toBe(total);
    },
  );

  it('does not change charges or report body when only the tax attribution changes', async () => {
    const first = await fixture({ posTax: 13 }).service.getRoyalty(
      'training-location',
    );
    const second = await fixture({ posTax: 38.87 }).service.getRoyalty(
      'training-location',
    );
    expect(first.body).toEqual(second.body);
    expect(first.meta).not.toEqual(second.meta);
  });

  it('labels fallback tax as non-POS and keeps Owner metadata unchanged', async () => {
    const { service } = fixture({ ledger: false });
    const fallback = await service.getRoyalty('training-location');
    expect(fallback.meta).toMatchObject({
      calculationMode: 'legacy',
      collectedTaxBreakdown: { nonPos: '13.00', pos: '0.00', total: '13.00' },
    });
    const owner = await service.getRoyalty(
      'training-location',
      undefined,
      undefined,
      RoyaltyReportPresentation.STANDARD,
    );
    expect(owner.meta).not.toHaveProperty('collectedTaxBreakdown');
    expect(owner.body).toMatchObject({ 'Advertisement (6%)': '6.00' });
  });

  it('includes the same metadata for all-location reporting', async () => {
    const { service } = fixture();
    const result = await service.getRoyaltyForAllLocations();
    expect(result.body[0].meta).toMatchObject({
      collectedTaxBreakdown: {
        nonPos: '177.13',
        pos: '38.87',
        total: '216.00',
      },
    });
  });

  it('combines checkout and ledger POS tax, including negative refunds, per location', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { locationId: '1', tax: '15.00', posTax: '13.00', royaltyFree: '0' },
        { locationId: '2', tax: '5', posTax: '0', royaltyFree: '0' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { locationId: '1', tax: '-2.60', posTax: '-2.60', royaltyFree: '0' },
      ]);
    const repository = new PaymentBasedRoyaltyReportRepository({
      manager: { query },
    } as unknown as DataSource);
    const result = await repository.getPaymentBasedRoyaltyData(
      [1, 2],
      '2026-09-01',
      '2026-09-24',
    );
    expect(result.amounts).toEqual([
      { locationId: 1, tax: 12.4, posTax: 10.4, royaltyFree: 0 },
      { locationId: 2, tax: 5, posTax: 0, royaltyFree: 0 },
    ]);
    expect(query.mock.calls[1][0]).toContain('recognized.isPOS = 1');
    expect(query.mock.calls[3][0]).toContain("sourceType = 'POS_TRANSACTION'");
  });
});
