import { describe, expect, it, vi } from 'vitest';
import { EquipmentRentalDeleteRepository } from './equipment-rental-delete.repository';
import { EquipmentRental } from '../entities/equipment-rental.entity';
import { EquipmentRentalInvoice } from '../entities/equipment-rental-invoice.entity';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';

describe('EquipmentRentalDeleteRepository', () => {
  it('loads and saves the rental so its soft delete reaches the audit subscriber', async () => {
    const rental = { id: 101, isDeleted: false } as EquipmentRental;
    const rentalInvoice = {
      equipmentRentalsId: 101,
      invoiceId: 201,
      isDeleted: false,
    } as EquipmentRentalInvoice;
    const lineItem = { id: 301, isDeleted: false } as InvoiceLineItem;
    const invoice = {
      id: 201,
      isDeleted: false,
      lineItems: [lineItem],
    } as Invoice;

    const manager = {
      queryRunner: { data: {} as Record<string, unknown> },
      find: vi.fn().mockResolvedValue([rentalInvoice]),
      findOne: vi.fn(async (entity: unknown) => {
        if (entity === EquipmentRental) return rental;
        if (entity === Invoice) return invoice;
        return null;
      }),
      save: vi.fn(async (_entity: unknown, value: unknown) => value),
    };
    const equipmentRentalRepository = {
      manager: {
        transaction: vi.fn(async (callback: (transactionManager: typeof manager) => unknown) =>
          callback(manager),
        ),
      },
    };
    const repository = new EquipmentRentalDeleteRepository(
      equipmentRentalRepository as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await repository.delete(101, false, 7001);

    expect(result).toEqual({ status: true });
    expect(manager.queryRunner.data.currentUserId).toBe(7001);
    expect(manager.findOne).toHaveBeenCalledWith(EquipmentRental, {
      where: { id: 101 },
    });
    expect(manager.save).toHaveBeenCalledWith(
      EquipmentRental,
      expect.objectContaining({
        id: 101,
        isDeleted: true,
        updatedByUserId: 7001,
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      EquipmentRentalInvoice,
      expect.objectContaining({ isDeleted: true }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      InvoiceLineItem,
      expect.objectContaining({ isDeleted: true }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      Invoice,
      expect.objectContaining({ isDeleted: true }),
    );
  });
});
