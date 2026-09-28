import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ItemLocationStock } from '../../item/entities/item-location-stock.entity';
import { queueLowStockAlert } from '../../item/services/low-stock-alert.util';
import { InvoiceLineItem } from '../entities/invoice-line-item.entity';

/** Stock belongs to saved invoice lines, never to their payment allocations. */
@Injectable()
export class InvoicePosStockService {
  async changeQuantity(
    manager: EntityManager,
    locationId: number,
    line: InvoiceLineItem,
    previousQuantity: number,
    quantity: number,
  ): Promise<void> {
    if (!line.isPos) return;
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error('Invoice stock changes require a transaction');
    }
    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      throw new BadRequestException(
        'POS quantity must be a non-negative whole number.',
      );
    }
    const delta = quantity - previousQuantity;
    if (!delta) return;
    const repository = manager.getRepository(ItemLocationStock);
    // Seed the unique item/location row before locking, like manual stock edits.
    await repository
      .createQueryBuilder()
      .insert()
      .values({
        itemId: line.itemId,
        locationId,
        trackInventory: false,
        stockQuantity: null,
        lowStockQuantity: null,
      })
      .orIgnore()
      .execute();
    const stock = await repository.findOneOrFail({
      where: { itemId: line.itemId, locationId },
      lock: { mode: 'pessimistic_write' },
    });
    const before = { ...stock };
    const deducted = Number(line.inventoryQuantityDeducted || 0);
    if (delta > 0 && stock.trackInventory) {
      if (stock.stockQuantity == null || Number(stock.stockQuantity) < delta) {
        throw new BadRequestException(
          `Insufficient stock for ${line.code}. Available: ${stock.stockQuantity ?? 0}; required: ${delta}. Update inventory before saving.`,
        );
      }
      stock.stockQuantity = Number(stock.stockQuantity) - delta;
      line.inventoryQuantityDeducted = deducted + delta;
    } else if (delta < 0 && deducted > 0) {
      // Restore only stock actually deducted, even if tracking was later disabled.
      const restored = Math.min(deducted, -delta);
      stock.stockQuantity = Number(stock.stockQuantity ?? 0) + restored;
      line.inventoryQuantityDeducted = deducted - restored;
    } else {
      return;
    }
    await repository.save(stock);
    await queueLowStockAlert(manager, before, stock);
  }

  async restoreAll(
    manager: EntityManager,
    locationId: number,
    line: InvoiceLineItem,
  ) {
    await this.changeQuantity(
      manager,
      locationId,
      line,
      Number(line.inventoryQuantityDeducted || 0),
      0,
    );
    await manager.getRepository(InvoiceLineItem).update(line.id, {
      inventoryQuantityDeducted: line.inventoryQuantityDeducted,
    });
  }
}
