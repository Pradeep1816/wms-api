import { describe, expect, it, vi } from 'vitest';
import { InvoicePosReturnsService } from './invoice-pos-returns.service';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceLineItem } from '../entities/invoice-line-item.entity';

function fixture({ paid = true, existing = false, permission = true } = {}) {
  const invoice = {
    id: 1,
    locationId: 15,
    userId: 50,
    type: Invoice.TYPE_INVOICE,
    balance: paid ? 0 : 33.9,
    tax: 3.9,
    walkinBuyerName: 'Test Buyer',
  };
  const book = {
    id: 11,
    invoiceId: 1,
    itemId: 31,
    isPos: true,
    unit: 3,
    amount: 10,
    netTotal: 30,
    taxRate: 3.9,
    returnedQuantity: 0,
    inventoryQuantityDeducted: 3,
    royaltyCategoryId: 5,
    royaltyRateApplied: 4,
    advertisementRateApplied: 2,
    posSnapshot: { categoryName: 'Lesson Books' },
    royaltyFree: false,
  };
  const lesson = {
    id: 12,
    invoiceId: 1,
    isPos: false,
    unit: 0.5,
    netTotal: 32.5,
    taxRate: 0,
  };
  let id = 100;
  const saved: any[] = [];
  const manager = {
    query: vi
      .fn()
      .mockImplementation(async (sql: string) =>
        sql.startsWith('SELECT') && existing ? [{ id: 99, number: 100 }] : [],
      ),
    find: vi.fn().mockResolvedValue([book, lesson]),
    create: (_entity: unknown, data: any) => ({ ...data }),
    save: vi.fn().mockImplementation(async (_entity: unknown, data: any) => {
      if (!data.id) {
        data.id = ++id;
        saved.push(data);
      }
      return data;
    }),
    findBy: vi
      .fn()
      .mockImplementation(async (_entity: unknown, where: any) =>
        saved.filter((row) => row.invoiceId === where.invoiceId),
      ),
  };
  const stock = { changeQuantity: vi.fn() };
  const returns = {
    isReversedInvoice: vi.fn().mockResolvedValue(false),
    createCreditInvoice: vi
      .fn()
      .mockResolvedValue({ id: 2, userId: 50, date: new Date() }),
    createInvoiceReverse: vi.fn(),
    createPaymentPair: vi.fn(),
    recalculateInvoiceTotals: vi.fn(),
  };
  const royalty = { recordInvoiceReturn: vi.fn() };
  const service = new InvoicePosReturnsService(
    { transaction: async (run: any) => run(manager) } as never,
    {
      audit: vi.fn(),
      lockInvoice: vi.fn().mockResolvedValue(invoice),
    } as never,
    stock as never,
    returns as never,
    {
      createTransaction: vi.fn().mockResolvedValue(1),
      getNextInvoiceNumber: vi.fn().mockResolvedValue(100),
    } as never,
    royalty as never,
    {
      getUserPermissions: vi
        .fn()
        .mockResolvedValue(permission ? ['manageInvoices'] : []),
    } as never,
    { recalculateAndPersist: vi.fn() } as never,
  );
  const request = {
    requestId: '4a3c4b30-50f5-4f02-82ec-b1806cfe8070',
    reason: 'Book returned',
    lines: [{ lineItemId: 11, quantity: 1 }],
  };
  return {
    service,
    invoice,
    book,
    lesson,
    manager,
    saved,
    returns,
    stock,
    royalty,
    request,
  };
}

describe('Invoice POS selective returns', () => {
  it('credits one paid book, restores only its quantity and leaves the lesson unchanged', async () => {
    const f = fixture();
    const originalLesson = { ...f.lesson };
    await f.service.returnItems(15, 'burlington', 1, f.request, 7);
    const credit = f.manager.save.mock.calls.find(
      ([entity, row]) => entity === Invoice && row.total != null,
    )?.[1];
    expect(credit).toMatchObject({
      subTotal: -10,
      tax: -1.3,
      total: -11.3,
      balance: -11.3,
      walkinBuyerName: 'Test Buyer',
      posReturnRequestKey: `pos-return:1:${f.request.requestId}`,
    });
    expect(f.saved.find((row) => row.invoiceId === 2)).toMatchObject({
      unit: -1,
      returnedFromLineItemId: 11,
      isPos: true,
      royaltyRateApplied: 4,
      advertisementRateApplied: 2,
    });
    expect(f.stock.changeQuantity).toHaveBeenCalledWith(
      f.manager,
      15,
      f.book,
      3,
      2,
    );
    expect(f.book.returnedQuantity).toBe(1);
    expect(f.lesson).toEqual(originalLesson);
    expect(f.returns.createPaymentPair).not.toHaveBeenCalled();
  });
  it('cancels only the returned unpaid debt through the existing credit pair', async () => {
    const f = fixture({ paid: false });
    await f.service.returnItems(15, 'burlington', 1, f.request, 7);
    expect(f.returns.createPaymentPair).toHaveBeenCalledWith(
      f.invoice,
      expect.objectContaining({ total: -11.3 }),
      11.3,
      50,
      7,
      f.manager,
    );
    expect(
      f.royalty.recordInvoiceReturn.mock.invocationCallOrder[0],
    ).toBeLessThan(f.returns.createPaymentPair.mock.invocationCallOrder[0]);
  });
  it('returns the same credit on replay without moving stock or allocating a second credit', async () => {
    const f = fixture({ existing: true });
    expect(
      await f.service.returnItems(15, 'burlington', 1, f.request, 7),
    ).toMatchObject({ creditInvoiceId: 99 });
    expect(f.stock.changeQuantity).not.toHaveBeenCalled();
    expect(f.returns.createCreditInvoice).not.toHaveBeenCalled();
  });
  it.each(['lesson', 'excess', 'duplicate', 'permission'])(
    'rejects %s before writing a credit',
    async (mode) => {
      const f = fixture({ permission: mode !== 'permission' });
      if (mode === 'lesson') f.request.lines[0].lineItemId = 12;
      if (mode === 'excess') f.request.lines[0].quantity = 4;
      if (mode === 'duplicate') f.request.lines.push({ ...f.request.lines[0] });
      await expect(
        f.service.returnItems(15, 'burlington', 1, f.request, 7),
      ).rejects.toThrow();
      expect(f.returns.createCreditInvoice).not.toHaveBeenCalled();
      expect(f.stock.changeQuantity).not.toHaveBeenCalled();
    },
  );
});
