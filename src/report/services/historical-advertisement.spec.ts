import { applyHistoricalAdvertisement } from './historical-advertisement';

const category = (revenue: number, saved = 0, free = false) => ({
  historicalAdvertisementRevenue: revenue,
  historicalAdvertisementFreeRevenue: free ? revenue : 0,
  advertisement: saved,
  royaltyFree: free,
});

describe('historical advertisement compatibility', () => {
  it('rounds historical revenue once rather than adding rounded payment amounts', () => {
    const rows = [category(296.25), category(358.75)];
    expect(applyHistoricalAdvertisement(rows, 2)).toEqual({
      historicalRevenue: '655.00',
      historicalRate: '2.00',
      historicalAmount: '13.10',
      savedCategoryAmount: '0.00',
    });
    expect(rows.map((row) => row.advertisement)).toEqual([5.93, 7.17]);
  });

  it('combines old revenue with exact saved fees, including a new backdated payment in the same category', () => {
    const rows = [category(655, 7.13), category(0, 0.01)];
    const result = applyHistoricalAdvertisement(rows, 2);
    expect(result.historicalAmount).toBe('13.10');
    expect(result.savedCategoryAmount).toBe('7.14');
    expect(rows.map((row) => row.advertisement)).toEqual([20.23, 0.01]);
  });

  it('preserves negative historical refunds and exact new refund cents', () => {
    const rows = [category(-296.25, -1.17), category(-358.75)];
    expect(applyHistoricalAdvertisement(rows, 2).historicalAmount).toBe(
      '-13.10',
    );
    expect(rows.map((row) => row.advertisement)).toEqual([-7.09, -7.18]);
  });

  it('handles sales and returns with a zero net balance', () => {
    const rows = [category(296.25), category(-296.25)];
    expect(applyHistoricalAdvertisement(rows, 2).historicalAmount).toBe('0.00');
    expect(rows.reduce((sum, row) => sum + row.advertisement, 0)).toBe(0);
  });

  it('subtracts historical free revenue once, with the original location-level precision', () => {
    const rows = [
      category(296.25),
      category(10.004, 0, true),
      category(10.004, 0, true),
    ];
    expect(applyHistoricalAdvertisement(rows, 2).historicalRevenue).toBe(
      '296.24',
    );
    expect(rows.map((row) => row.advertisement)).toEqual([5.92, 0, 0]);
  });

  it('does not recalculate new-only fees from revenue or the lesson baseline', () => {
    const rows = [category(0, 5.93), category(0, -5.93), category(0, 7.18)];
    expect(applyHistoricalAdvertisement(rows, 99).historicalAmount).toBe(
      '0.00',
    );
    expect(rows.map((row) => row.advertisement)).toEqual([5.93, -5.93, 7.18]);
  });

  it.each([0, 1.5, 2, 5, 100])(
    'reconciles deterministic allocations across signed rows at %s%%',
    (rate) => {
      const rows = [
        category(83.3333),
        category(-67.125),
        category(296.25),
        category(20, 0, true),
        category(0, 1.31),
      ];
      const copy = structuredClone(rows);
      const result = applyHistoricalAdvertisement(rows, rate);
      expect(
        Math.round(rows.reduce((sum, row) => sum + row.advertisement, 0) * 100),
      ).toBe(Math.round((Number(result.historicalAmount) + 1.31) * 100));
      applyHistoricalAdvertisement(copy, rate);
      expect(copy).toEqual(rows);
    },
  );
});
