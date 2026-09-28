import { ItemTypeEnum } from '../enums/item-type.enum';
import { InvoicePrintService } from './invoice-print.service';

describe('InvoicePrintService', () => {
  it('uses persisted net total for the effective printed discount', async () => {
    const repository = {
      getLineItemDiscountTotal: vi.fn(),
      getInvoicePaidAmount: vi.fn().mockResolvedValue(15.15),
    };
    const service = new InvoicePrintService(repository as any, {} as any);

    const totals = await (service as any).calculateTotals(
      [
        {
          id: 3001,
          itemTypeId: ItemTypeEnum.TYPE_PRIVATE_LESSON,
          amount: 65,
          unit: 0.25,
          netTotal: 15.15,
        },
      ],
      901,
    );

    expect(totals).toEqual({ discount: 1.1, paid: 15.15 });
    expect(repository.getLineItemDiscountTotal).not.toHaveBeenCalled();
  });

  it('falls back to stored discount rows when net total is unavailable', async () => {
    const repository = {
      getLineItemDiscountTotal: vi.fn().mockResolvedValue(1.09),
      getInvoicePaidAmount: vi.fn().mockResolvedValue(0),
    };
    const service = new InvoicePrintService(repository as any, {} as any);

    const totals = await (service as any).calculateTotals(
      [
        {
          id: 3002,
          itemTypeId: ItemTypeEnum.TYPE_PRIVATE_LESSON,
          amount: 65,
          unit: 0.25,
        },
      ],
      902,
    );

    expect(totals).toEqual({ discount: 1.09, paid: 0 });
    expect(repository.getLineItemDiscountTotal).toHaveBeenCalledWith(3002);
  });

  it('keeps the existing discount lookup for non-private invoice items', async () => {
    const repository = {
      getLineItemDiscountTotal: vi.fn().mockResolvedValue(2),
      getInvoicePaidAmount: vi.fn().mockResolvedValue(0),
    };
    const service = new InvoicePrintService(repository as any, {} as any);

    const totals = await (service as any).calculateTotals(
      [
        {
          id: 3003,
          itemTypeId: ItemTypeEnum.TYPE_GROUP_LESSON,
          amount: 30,
          unit: 1,
          netTotal: 29,
        },
      ],
      903,
    );

    expect(totals).toEqual({ discount: 2, paid: 0 });
    expect(repository.getLineItemDiscountTotal).toHaveBeenCalledWith(3003);
  });
});
