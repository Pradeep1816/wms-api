import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { PosTransaction } from './pos-transaction.entity';
import { Item } from '../../item/entities/item.entity';

@Entity('pos_transaction_line_item')
export class PosTransactionLineItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  posTransactionId: number;

  @Column({ type: 'int', unsigned: true })
  itemId: number;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number; // Price at time of sale (from Item.price)

  /** Item details captured when the sale is paid, independent of later catalog edits. */
  @Column({ type: 'varchar', length: 150, nullable: true })
  itemCodeSnapshot: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  itemUpcCodeSnapshot: string | null;

  @Column({ type: 'text', nullable: true })
  itemDescriptionSnapshot: string | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  itemCategoryIdSnapshot: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  itemCategoryNameSnapshot: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  discount: number; // Discount per line item

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  overridePrice: number | null; // Reserved for a future price override phase.

  /** Category and royalty rate captured for reporting when the sale is paid. */
  @Column({ name: 'royaltyCategoryId', type: 'int', unsigned: true, nullable: true })
  royaltyCategoryId: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  royaltyCategoryNameSnapshot: string | null;

  @Column({ name: 'royaltyRateApplied', type: 'decimal', precision: 5, scale: 2, default: 0 })
  royaltyRateApplied: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  advertisementRateApplied: number;

  @Column({ type: 'tinyint', unsigned: true, nullable: true })
  royaltyFreeSnapshot: number | null;

  /**
   * Exact quantity removed from managed inventory at checkout. Reversals use
   * this snapshot instead of the item's current Track Inventory setting.
   */
  @Column({ type: 'int', unsigned: true, nullable: true })
  inventoryQuantityDeducted: number | null;

  @CreateDateColumn()
  createdAt: Date;

  // Relationships
  @ManyToOne(() => PosTransaction, posTransaction => posTransaction.lineItems, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  })
  @JoinColumn({ name: 'posTransactionId' })
  posTransaction: PosTransaction;

  @ManyToOne(() => Item, {
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION'
  })
  @JoinColumn({ name: 'itemId' })
  item: Item;

  // Helper method to get line item total
  getLineItemTotal(): number {
    const effectivePrice = this.overridePrice ?? this.price;
    const effectiveDiscount = this.discount ?? 0;
    return (effectivePrice * this.quantity) - effectiveDiscount;
  }
}
