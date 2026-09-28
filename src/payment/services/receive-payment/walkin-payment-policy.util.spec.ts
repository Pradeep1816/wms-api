import { describe, expect, it } from 'vitest';
import { assertWalkinPurchaseAllocation } from './walkin-payment-policy.util';

const valid = {
  amount: 22.59,
  invoices: [{ id: 1, requested: 22.59 }],
  hasCredits: false,
  hasOtherCharges: false,
};
describe('shared walk-in purchase payment policy', () => {
  it('accepts a new payment allocated to one invoice', () =>
    expect(() => assertWalkinPurchaseAllocation(valid)).not.toThrow());
  it.each([
    { hasCredits: true },
    { invoices: [] },
    { invoices: [...valid.invoices, { id: 2, requested: 1 }] },
    { hasOtherCharges: true },
    { amount: 0 },
    { amount: 23 },
    { amount: 20 },
  ])('rejects unsafe allocation %j', (change) =>
    expect(() =>
      assertWalkinPurchaseAllocation({ ...valid, ...change }),
    ).toThrow(),
  );
});
