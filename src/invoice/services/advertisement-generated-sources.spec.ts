import { InvoiceLineItem } from '../entities/invoice-line-item.entity';
import { PrivateLessonInvoiceRepository } from '../../lesson/repositories/generate-invoice.repository';
import { ReceivePaymentRepository } from '../repositories/receive-payment.repository';
import { EquipmentRentalReturnRepository } from '../../equipment-rental/repositories/equipment-rental-return.repository';
import { InvoiceEquipmentRentalsCronRepository } from '../../cron/repositories/invoice-equipment-rentals-cron.repository';
import { EquipmentRentalConstants } from '../../equipment-rental/enums/equipment-rental.enum';

function fixture() {
  const item = {
    id: 10,
    itemCategoryId: 5,
    royaltyFree: 0,
    price: 100,
    description: 'Rental',
    taxStatusId: EquipmentRentalConstants.TAX_STATUS_HST,
  };
  const query = {
    select: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    getRawOne: vi.fn().mockResolvedValue({ locationId: 15 }),
  };
  const manager = {
    create: vi.fn((_entity, value) => ({ ...value })),
    save: vi.fn(async (_entity, value) => value),
    update: vi.fn(),
    findOneOrFail: vi.fn().mockResolvedValue({ locationId: 15 }),
    findOne: vi.fn(async (entity, options) => {
      if (entity.name === 'Item') return { ...item, itemCategoryId: 1 };
      if (entity.name === 'ItemCategory') return { id: 5, isDeleted: false };
      if (entity.name === 'LocationCategoryRoyalty')
        return { royality: 4, advertisement: 1.25 };
      if (entity.name === 'LocationDebt')
        return { value: options.where.type === 2 ? 2 : 6 };
      return null;
    }),
    getRepository: vi.fn(() => ({ createQueryBuilder: () => query })),
  };
  return { manager, item };
}

describe('Generated source advertisement snapshots', () => {
  it('captures the lesson rate on a generated private invoice without changing its price', async () => {
    const { manager } = fixture();
    const repository = new PrivateLessonInvoiceRepository();
    const line = await repository.createInvoiceLineItem(
      {
        invoiceId: 1,
        itemId: 10,
        unit: 1,
        amount: 100,
        description: 'Lesson',
        cost: 0,
        rate: 0,
        netTotal: 100,
        taxType: 'HST',
        taxRate: 13,
        taxStatus: 'Taxable',
        taxCode: 'HST',
      },
      manager as never,
    );
    expect(line).toMatchObject({
      advertisementRateApplied: 2,
      royaltyRateApplied: 6,
      netTotal: 100,
      taxRate: 13,
    });
  });

  it.each([11, 12])(
    'captures the lesson advertisement on private/group allocation %s',
    async (lessonId) => {
      const { manager } = fixture();
      const repository = new ReceivePaymentRepository();
      const payment = await repository.createLessonPayment(
        lessonId,
        100,
        10,
        50,
        1,
        manager as never,
      );
      expect(payment).toMatchObject({
        lessonId,
        amount: 50,
        royaltyRateApplied: 6,
        advertisementRateApplied: 2,
      });
    },
  );

  it('captures the rental return category rate while retaining prorated rent and tax', async () => {
    const { manager, item } = fixture();
    const repository = new EquipmentRentalReturnRepository(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await (repository as any).processLineItemsLegacy(
      manager,
      1,
      15,
      [{ instrument: 10, equipmentRentalsId: 1, item }],
      30,
      15,
      new Date('2026-09-15'),
      new Date('2026-09-01'),
    );
    expect(manager.save).toHaveBeenLastCalledWith(
      InvoiceLineItem,
      expect.objectContaining({
        amount: 50,
        advertisementRateApplied: 1.25,
        royaltyRateApplied: 4,
      }),
    );
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      { id: 1 },
      expect.objectContaining({
        subTotal: 50,
        tax: 6.5,
        total: 56.5 + EquipmentRentalConstants.LATE_FEE,
      }),
    );
  });

  it('captures the category rate on a scheduled rental invoice without changing billed totals', async () => {
    const { manager, item } = fixture();
    const repository = new InvoiceEquipmentRentalsCronRepository(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    vi.spyOn(repository as any, 'resolveTaxContext').mockResolvedValue({
      taxRate: 13,
      taxTypeName: 'HST',
      taxStatusName: 'Taxable',
      taxCode: 'HST',
    });
    const result = await (repository as any).processInvoiceLineItems({
      manager,
      invoice: { id: 1 },
      rental: { startDate: new Date('2026-09-01'), duration: 2, hst: 26 },
      location: { id: 15, provinceId: 1 },
      instruments: [{ instrument: 10, equipmentRentalsId: 1, item }],
      billingMode: 'fixed',
      firstInvoice: true,
    });
    expect(result).toMatchObject({ subtotal: 200, tax: 26, total: 226 });
    expect(manager.save).toHaveBeenCalledWith(
      InvoiceLineItem,
      expect.objectContaining({
        advertisementRateApplied: 1.25,
        royaltyRateApplied: 4,
        netTotal: 200,
      }),
    );
  });
});
