import { describe, expect, it, vi } from 'vitest';
import { InvoiceReturnRepository } from './invoice-return.repository';
import { Invoice } from '../entities/invoice.entity';

function createManagerMock() {
  let rawCallCount = 0;
  const builder = {
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    getRawOne: vi.fn(async () => {
      rawCallCount += 1;
      if (rawCallCount === 1) {
        return { netSubtotal: '0.145', lineItemTax: '0' };
      }
      if (rawCallCount === 2) {
        return { paidTotal: '0.14' };
      }
      return { total: '0' };
    }),
    getOne: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
  };

  const invoice = {
    id: 1,
    type: Invoice.TYPE_INVOICE,
    isTaxAdjusted: 0,
    tax: 0,
    subTotal: 0,
    total: 0,
    balance: 0,
    status: 0,
    updatedUserId: 0,
  };

  const manager: any = {
    createQueryBuilder: vi.fn(() => builder),
    findOne: vi.fn(async (entity: unknown) => {
      if (entity === Invoice) {
        return { ...invoice };
      }
      return null;
    }),
    save: vi.fn(async (_entity: unknown, payload: Record<string, unknown>) => payload),
  };

  return { manager, builder };
}

describe('InvoiceReturnRepository rounding', () => {
  it('rounds returned invoice totals through the shared decimal helper', async () => {
    const repository = new InvoiceReturnRepository({} as any);
    const { manager } = createManagerMock();

    await repository.recalculateInvoiceTotals(1, 7001, manager as any);

    expect(manager.save).toHaveBeenCalledWith(
      Invoice,
      expect.objectContaining({
        subTotal: 0.145,
        total: 0.145,
        balance: 0.005,
        status: Invoice.STATUS_OWING,
      }),
    );
  });
});
