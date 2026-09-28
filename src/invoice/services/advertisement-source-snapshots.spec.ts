import { InvoiceLineItemCreateTransformationService } from './transformations/invoice-line-item-create-transformation.service';
import { InvoiceLineItemUpdateService } from './invoice-line-item-update.service';

describe('Invoice advertisement source snapshots', () => {
  it('captures advertisement without changing invoice pricing and retains it when prices are recalculated', () => {
    const service = new InvoiceLineItemCreateTransformationService({
      calculateLineItemDiscount: () => 0,
    } as never);
    const invoice = { id: 1 } as any;
    const line = service.buildNewLineItem(
      invoice,
      {
        id: 5,
        price: 100,
        code: 'QA',
        description: 'QA item',
        royaltyFree: 0,
      } as any,
      {
        taxTypeName: 'HST',
        taxCodeRate: 13,
        taxCodeCode: 'HST',
        taxStatusName: 'Taxable',
      },
      {
        categoryId: 5,
        rate: 6,
        advertisementRate: 1.25,
      },
    );
    expect(line).toMatchObject({
      netTotal: 100,
      taxRate: 13,
      royaltyRateApplied: 6,
      advertisementRateApplied: 1.25,
    });
    line.unit = 2;
    expect(service.refreshLineItemPricing(line, invoice, 13)).toMatchObject({
      netTotal: 200,
      taxRate: 26,
      advertisementRateApplied: 1.25,
    });
  });

  it.each([undefined, 0, 1])(
    'refreshes snapshots only for an explicit royalty-free edit (%s)',
    async (royaltyFree) => {
      const updateFields = { amount: 100 };
      const repository = {
        findLineItemById: vi
          .fn()
          .mockResolvedValue({
            id: 10,
            itemId: 5,
            invoice: { id: 1, userId: 20, isPosted: false },
          }),
        getFirstLineItem: vi.fn().mockResolvedValue({ itemTypeId: 1 }),
        isReversedInvoice: vi.fn().mockResolvedValue(false),
        lookupTaxData: vi.fn().mockResolvedValue({}),
        getLineItemsWithDiscounts: vi.fn().mockResolvedValue([]),
        getLineItemTaxSum: vi.fn().mockResolvedValue(13),
        getInvoicePaidAmount: vi.fn().mockResolvedValue(0),
        getRoyaltySnapshot: vi
          .fn()
          .mockResolvedValue({
            categoryId: 5,
            rate: royaltyFree ? 0 : 6,
            advertisementRate: royaltyFree ? 0 : 1.25,
          }),
        updateLineItem: vi.fn(),
        updateInvoiceTotals: vi.fn(),
      };
      const transform = {
        transformLineItemCalculation: () => ({
          updateFields,
          newSubTotal: 100,
          newTax: 13,
          newTotal: 113,
          newBalance: 113,
          newStatus: 1,
        }),
        transformUpdateLineItemResponse: () => ({}),
      };
      const balances = { recalculateAndPersist: vi.fn() };
      const service = new InvoiceLineItemUpdateService(
        repository as never,
        transform as never,
        balances as never,
        { hasPos: vi.fn().mockResolvedValue(false) } as never,
      );
      await service.updateLineItem(
        15,
        'training-location',
        10,
        {
          amount: 100,
          ...(royaltyFree === undefined ? {} : { royaltyFree }),
        } as any,
        1,
      );
      if (royaltyFree === undefined) {
        expect(repository.getRoyaltySnapshot).not.toHaveBeenCalled();
        expect(updateFields).not.toHaveProperty('advertisementRateApplied');
      } else {
        expect(updateFields).toMatchObject({
          advertisementRateApplied: royaltyFree ? 0 : 1.25,
          royaltyRateApplied: royaltyFree ? 0 : 6,
        });
      }
      expect(balances.recalculateAndPersist).toHaveBeenCalledWith(20, {
        locationSlug: 'training-location',
        updatedByUserId: 1,
      });
    },
  );
});
