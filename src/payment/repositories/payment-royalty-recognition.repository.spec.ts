import { describe, expect, it, vi } from 'vitest';
import { PaymentRoyaltyRecognitionRepository } from './payment-royalty-recognition.repository';

describe('Mixed invoice recognition', () => {
  const repository = new PaymentRoyaltyRecognitionRepository();
  const base = { invoicePaymentId: 10, appliedAmount: 56.5, invoiceTotal: 113, invoiceSubTotal: 100, invoiceTax: 13 };
  it('keeps POS identity and allocates a partial payment tax to its saved taxable lines', () => {
    const purposes = (repository as any).mapInvoiceRows([
      { ...base, lineItemId: 1, lineNetTotal: 50, lineTax: 0, categoryName: 'Lesson', isPos: 0, rateApplied: 6 },
      { ...base, lineItemId: 2, lineNetTotal: 50, lineTax: 13, categoryName: 'Books', isPos: 1, rateApplied: 5, advertisementRateApplied: 2 },
    ]);
    expect(purposes[0]).toMatchObject({ isPos: false, revenueAmount: 25, taxAmount: 0, paymentAmount: 25, rateApplied: 6 });
    expect(purposes[1]).toMatchObject({ isPos: true, revenueAmount: 25, taxAmount: 6.5, paymentAmount: 31.5, rateApplied: 5, advertisementRateApplied: 2 });
  });
  it('preserves the established allocation on invoices without POS', () => {
    const purposes = (repository as any).mapInvoiceRows([
      { ...base, lineItemId: 1, lineNetTotal: 50, lineTax: 0, isPos: 0 },
      { ...base, lineItemId: 2, lineNetTotal: 50, lineTax: 13, isPos: 0 },
    ]);
    expect(purposes.map(p => p.taxAmount)).toEqual([3.25, 3.25]);
  });
  it('retains the royalty-free flag and zero advertisement snapshot', () => {
    const [purpose] = (repository as any).mapInvoiceRows([{ ...base, lineItemId: 2, lineNetTotal: 100, lineTax: 13, isPos: 1, royaltyFree: 1, advertisementRateApplied: 0 }]);
    expect(purpose).toMatchObject({ isPos: true, royaltyFree: true, advertisementRateApplied: 0 });
  });
  it('freezes remaining charges after a return and reuses that split after subsequent returns', async () => {
    const rows = [
      { ...base, appliedAmount: 50, lineItemId: 1, lineNetTotal: 50, lineTax: 0, categoryName: 'Lesson', itemCategoryId: 1, isPos: 0, rateApplied: 6 },
      { ...base, appliedAmount: 50, lineItemId: 2, lineNetTotal: 50, lineTax: 13, categoryName: 'Books', itemCategoryId: 5, isPos: 1, rateApplied: 5 },
    ];
    const manager = { queryRunner: { isTransactionActive: true }, query: vi.fn().mockResolvedValueOnce([{ id: 2, net: -50, tax: -13 }]).mockResolvedValueOnce({}) };
    const purposes = await (repository as any).mapSavedInvoiceRows(manager, rows);
    expect(purposes[0]).toMatchObject({ categoryName: 'Lesson', revenueAmount: 50, taxAmount: 0 });
    expect(purposes[1]).toMatchObject({ categoryName: 'Books', revenueAmount: 0, taxAmount: 0, returnOriginalRevenue: 50, returnPreviousRevenue: 50 });
    const saved = JSON.parse(manager.query.mock.calls[1][1][0]);
    manager.query.mockClear();
    const replay = await (repository as any).mapSavedInvoiceRows(manager, rows.map(row => ({ ...row, lineNetTotal: 999, posPurposeSnapshot: saved })));
    expect(replay).toEqual(purposes);
    expect(manager.query).not.toHaveBeenCalled();
  });
  it('allocates later cash over only the remaining net and tax after a partial book return', async () => {
    const manager = { queryRunner: { isTransactionActive: true }, query: vi.fn().mockResolvedValueOnce([{ id: 2, net: -25, tax: -6.5 }]).mockResolvedValueOnce({}) };
    const purposes = await (repository as any).mapSavedInvoiceRows(manager, [
      { ...base, appliedAmount: 81.5, lineItemId: 1, lineNetTotal: 50, lineTax: 0, categoryName: 'Lesson', itemCategoryId: 1, isPos: 0 },
      { ...base, appliedAmount: 81.5, lineItemId: 2, lineNetTotal: 50, lineTax: 13, categoryName: 'Books', itemCategoryId: 5, isPos: 1 },
    ]);
    expect(purposes[0]).toMatchObject({ revenueAmount: 50, taxAmount: 0 });
    expect(purposes[1]).toMatchObject({ revenueAmount: 25, taxAmount: 6.5, returnOriginalRevenue: 50, returnPreviousRevenue: 25 });
  });
});
