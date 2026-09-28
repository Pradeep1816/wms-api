import { describe, expect, it, vi } from 'vitest';
import { InvoicePosStockService } from './invoice-pos-stock.service';
import { InvoiceLineItem } from '../entities/invoice-line-item.entity';
import { EntityManager } from 'typeorm';

function setup(stockQuantity: number | null = 10, trackInventory = true) {
  const stock = {
    itemId: 23,
    locationId: 15,
    stockQuantity,
    trackInventory,
    lowStockQuantity: 9,
  };
  const query = {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    orIgnore: vi.fn().mockReturnThis(),
    execute: vi.fn(),
  };
  const repository = {
    createQueryBuilder: () => query,
    findOneOrFail: vi.fn().mockResolvedValue(stock),
    save: vi.fn(),
    update: vi.fn(),
  };
  const manager = {
    queryRunner: { isTransactionActive: true },
    getRepository: () => repository,
    insert: vi.fn(),
  } as unknown as EntityManager;
  const line = {
    id: 99,
    itemId: 23,
    isPos: true,
    code: 'BOOK',
    inventoryQuantityDeducted: 0,
  } as InvoiceLineItem;
  return {
    stock,
    repository,
    manager,
    line,
    service: new InvoicePosStockService(),
  };
}

describe('Invoice POS stock lifecycle', () => {
  it('deducts on saved quantity, emits one crossing alert and does nothing for unchanged quantity', async () => {
    const { service, manager, line, stock, repository } = setup();
    await service.changeQuantity(manager, 15, line, 0, 2);
    expect(stock.stockQuantity).toBe(8);
    expect(line.inventoryQuantityDeducted).toBe(2);
    expect(manager.insert).toHaveBeenCalledTimes(1);
    await service.changeQuantity(manager, 15, line, 2, 3);
    expect(stock.stockQuantity).toBe(7);
    expect(manager.insert).toHaveBeenCalledTimes(1);
    await service.changeQuantity(manager, 15, line, 3, 3);
    expect(repository.save).toHaveBeenCalledTimes(2);
    expect(repository.findOneOrFail).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });
  it.each([null, 0, 1])(
    'refuses quantity 2 when tracked available stock is %s',
    async (available) => {
      const { service, manager, line, stock, repository } = setup(available);
      await expect(
        service.changeQuantity(manager, 15, line, 0, 2),
      ).rejects.toThrow('Insufficient stock');
      expect(stock.stockQuantity).toBe(available);
      expect(repository.save).not.toHaveBeenCalled();
      expect(manager.insert).not.toHaveBeenCalled();
    },
  );
  it('allows untracked purchases and never invents stock when returned', async () => {
    const { service, manager, line, stock } = setup(null, false);
    await service.changeQuantity(manager, 15, line, 0, 4);
    await service.changeQuantity(manager, 15, line, 4, 0);
    expect(stock.stockQuantity).toBeNull();
    expect(line.inventoryQuantityDeducted).toBe(0);
  });
  it('restores only deducted stock after tracking changes and prevents a repeated restoration', async () => {
    const { service, manager, line, stock } = setup();
    await service.changeQuantity(manager, 15, line, 0, 3);
    stock.trackInventory = false;
    await service.changeQuantity(manager, 15, line, 3, 5);
    await service.changeQuantity(manager, 15, line, 5, 4);
    expect(stock.stockQuantity).toBe(8);
    expect(line.inventoryQuantityDeducted).toBe(2);
    await service.restoreAll(manager, 15, line);
    await service.restoreAll(manager, 15, line);
    expect(stock.stockQuantity).toBe(10);
    expect(line.inventoryQuantityDeducted).toBe(0);
  });
  it('requires a transaction and whole quantities', async () => {
    const { service, manager, line } = setup();
    await expect(
      service.changeQuantity(manager, 15, line, 0, 1.5),
    ).rejects.toThrow('whole number');
    manager.queryRunner.isTransactionActive = false;
    await expect(
      service.changeQuantity(manager, 15, line, 0, 1),
    ).rejects.toThrow('transaction');
  });
});
