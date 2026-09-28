import { describe, expect, it } from 'vitest';
import { allocatePosInvoiceTax } from './pos-invoice-tax.util';
describe('POS invoice tax cents', () => {
  it('allocates a one-cent remainder once and independent of input order', () => {
    const lines = [
      { id: 2, net: 0.05, tax: 0.0065 },
      { id: 1, net: 0.05, tax: 0.0065 },
    ];
    const tax = allocatePosInvoiceTax(lines, 0.013);
    expect([...tax.values()].reduce((sum, value) => sum + value, 0)).toBe(0.01);
    expect(tax).toEqual(allocatePosInvoiceTax([...lines].reverse(), 0.013));
  });
  it('does not attribute book tax to an untaxed lesson or book', () => {
    const tax = allocatePosInvoiceTax(
      [
        { id: 1, net: 100, tax: 0 },
        { id: 2, net: 19.99, tax: 2.5987 },
      ],
      2.5987,
    );
    expect(tax.get(1)).toBe(0);
    expect(tax.get(2)).toBe(2.6);
  });
  it('allocates manually adjusted tax using saved taxable weights', () => {
    expect([
      ...allocatePosInvoiceTax(
        [
          { id: 1, net: 100, tax: 0 },
          { id: 2, net: 20, tax: 2.6 },
        ],
        1.0,
      ).values(),
    ]).toEqual([0, 1]);
  });
});
