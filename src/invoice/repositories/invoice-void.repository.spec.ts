import { describe, expect, it, vi } from 'vitest';
import { InvoiceVoidRepository } from './invoice-void.repository';
import { Invoice } from '../entities/invoice.entity';

function createManagerMock() {
  let rawCallCount = 0;
  const builder = {
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    getRawOne: vi.fn(async () => {
      rawCallCount += 1;
      if (rawCallCount === 1) {
        return { subTotal: '0.145' };
      }
      if (rawCallCount === 2) {
        return { totalTax: '0' };
      }
      return { totalPaid: '0' };
    }),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
  };

  const manager: any = {
    createQueryBuilder: vi.fn(() => builder),
    getRepository: vi.fn(() => ({
      findOne: vi.fn().mockResolvedValue(null),
    })),
  };

  return { manager, builder };
}

describe('InvoiceVoidRepository rounding', () => {
  it('rounds voided invoice totals through the shared decimal helper', async () => {
    const repository = new InvoiceVoidRepository(
      { createQueryBuilder: vi.fn() } as any,
      { createQueryBuilder: vi.fn() } as any,
      { createQueryBuilder: vi.fn() } as any,
      { createQueryBuilder: vi.fn() } as any,
      { createQueryBuilder: vi.fn() } as any,
      { createQueryBuilder: vi.fn() } as any,
      { writeUpdateEntry: vi.fn() } as any,
    );
    const { manager, builder } = createManagerMock();

    await repository.recalculateInvoiceTotals(1, 7001, manager as any, false);

    expect(builder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        subTotal: 0.145,
        total: 0.145,
        balance: 0.15,
        status: Invoice.STATUS_OWING,
      }),
    );
  });
});
