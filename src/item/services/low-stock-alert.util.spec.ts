import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { queueLowStockAlert } from './low-stock-alert.util';
import { ItemLocationStock } from '../entities/item-location-stock.entity';

const stock = (
  quantity: number | null,
  threshold: number | null = 9,
  tracked = true,
) =>
  Object.assign(new ItemLocationStock(), {
    itemId: 10,
    locationId: 15,
    trackInventory: tracked,
    stockQuantity: quantity,
    lowStockQuantity: threshold,
  });

describe('low-stock transition alerts', () => {
  it('queues only on entry below the threshold and rearms after recovery', async () => {
    const insert = vi.fn();
    const manager = {
      queryRunner: { isTransactionActive: true },
      insert,
    } as any;
    await queueLowStockAlert(manager, stock(10), stock(8));
    await queueLowStockAlert(manager, stock(8), stock(7));
    await queueLowStockAlert(manager, stock(7), stock(9));
    await queueLowStockAlert(manager, stock(9), stock(8));
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[0][1]).toMatchObject({
      itemId: 10,
      locationId: 15,
      stockQuantity: 8,
      lowStockQuantity: 9,
      status: 'pending',
    });
  });

  it.each([
    [stock(10), stock(9)],
    [stock(10), stock(0, 0)],
    [stock(10), stock(0, null)],
    [stock(10), stock(null)],
    [stock(10), stock(0, 9, false)],
    [stock(8), stock(8)],
  ])(
    'does not enqueue equality, unconfigured, untracked or continuing low stock',
    async (before, after) => {
      const insert = vi.fn();
      await queueLowStockAlert(
        { queryRunner: { isTransactionActive: true }, insert } as any,
        before,
        after,
      );
      expect(insert).not.toHaveBeenCalled();
    },
  );

  it('alerts when tracking or a threshold is first configured below the threshold', async () => {
    const insert = vi.fn();
    await queueLowStockAlert(
      { queryRunner: { isTransactionActive: true }, insert } as any,
      stock(null, null, false),
      stock(2),
    );
    expect(insert).toHaveBeenCalledOnce();
  });

  it('refuses nontransactional enqueue and propagates persistence failure for rollback', async () => {
    await expect(
      queueLowStockAlert({} as any, stock(10), stock(8)),
    ).rejects.toThrow('transaction');
    await expect(
      queueLowStockAlert(
        {
          queryRunner: { isTransactionActive: true },
          insert: vi.fn().mockRejectedValue(new Error('write failed')),
        } as any,
        stock(10),
        stock(8),
      ),
    ).rejects.toThrow('write failed');
  });
});
