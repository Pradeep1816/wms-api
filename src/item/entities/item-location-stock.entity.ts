import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('item_location_stock')
@Index('IDX_item_location_stock_location', ['locationId'])
export class ItemLocationStock {
  @PrimaryColumn({ type: 'int', unsigned: true })
  itemId: number;

  @PrimaryColumn({ type: 'int', unsigned: true })
  locationId: number;

  @Column({ type: 'boolean', default: false })
  trackInventory: boolean;

  @Column({ type: 'int', unsigned: true, nullable: true })
  stockQuantity: number | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  lowStockQuantity: number | null;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
