import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';
import { Entity, PrimaryGeneratedColumn, Column, Index, OneToOne } from 'typeorm';

@Entity('item')
export class Item {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'itemCategoryId', type: 'int', unsigned: true, nullable: false })
  @Index('itemCategoryId')
  itemCategoryId: number;

  @Column({ name: 'locationId', type: 'int', unsigned: true, nullable: false })
  @Index('locationId')
  locationId: number;

  /**
   * Item code used by SMW for item naming/grouping. This is not the POS scanner UPC.
   */
  @Column({ type: 'varchar', length: 150, nullable: false })
  code: string;

  @Column({ name: 'upcCode', type: 'varchar', length: 150, nullable: true })
  @Index('IDX_item_upc_code')
  upcCode: string | null;

  @Column({ type: 'text', nullable: false })
  description: string;

  @Column({ type: 'float', precision: 10, scale: 2, nullable: true })
  price: number;

  @Column({ name: 'royaltyFree', type: 'tinyint', unsigned: true, nullable: false })
  royaltyFree: number;

  @Column({ name: 'taxStatusId', type: 'int', unsigned: true, nullable: false })
  taxStatusId: number;

  @Column({ type: 'tinyint', unsigned: true, nullable: false })
  status: number;

  @Column({ name: 'isDeleted', type: 'tinyint', unsigned: true, nullable: false })
  isDeleted: boolean;

  @OneToOne(() => InvoiceLineItem, (invoiceLineItem) => invoiceLineItem.item)
  invoiceLineItem: InvoiceLineItem;

  static TYPE_RENTAL = 12; // Item category id for rental
}
