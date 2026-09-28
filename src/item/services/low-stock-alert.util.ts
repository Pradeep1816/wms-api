import { EntityManager } from 'typeorm';
import { ItemLocationStock } from '../entities/item-location-stock.entity';
import { LowStockAlert } from '../entities/low-stock-alert.entity';

export function isLowStock(stock: ItemLocationStock | null): boolean {
  return (
    !!stock?.trackInventory &&
    stock.stockQuantity != null &&
    stock.lowStockQuantity != null &&
    Number(stock.stockQuantity) < Number(stock.lowStockQuantity)
  );
}

/** Call with an immutable before image while holding the stock row lock. Both
 * manual stock edits and POS/invoice movements must share this transaction.
 * No separate rearm flag: returning to a non-low state rearms the next drop. */
export async function queueLowStockAlert(
  manager: EntityManager,
  before: ItemLocationStock | null,
  after: ItemLocationStock,
): Promise<void> {
  if (!manager.queryRunner?.isTransactionActive) {
    throw new Error('Low-stock alerts require the stock transaction');
  }
  if (isLowStock(before) || !isLowStock(after)) return;
  const now = Date.now();
  await manager.insert(LowStockAlert, {
    itemId: after.itemId,
    locationId: after.locationId,
    stockQuantity: after.stockQuantity!,
    lowStockQuantity: after.lowStockQuantity!,
    status: 'pending',
    attempts: 0,
    createdAt: now,
    nextAttemptAt: now,
  });
}
