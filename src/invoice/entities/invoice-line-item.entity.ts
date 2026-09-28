import { Entity, PrimaryGeneratedColumn, Column, Index, OneToMany, ManyToOne, JoinColumn, OneToOne } from 'typeorm';
import { Invoice } from './invoice.entity';
import { InvoiceLineItemDiscount } from './invoice-line-item-discount.entity';
import { Item } from '../../item/entities/item.entity';
import { InvoiceItemLesson } from './invoice-item-lesson.entity';
import { InvoiceItemEnrolment } from './invoice-item-enrolment.entity';

@Entity('invoice_line_item')
export class InvoiceLineItem {
  /** Set only for new catalog purchases; never infer POS from a whole invoice. */
  @Column({ type: 'boolean', default: false })
  isPos: boolean;

  @Column({ type: 'json', nullable: true })
  posSnapshot: {
    code: string;
    upcCode: string | null;
    description: string;
    categoryId: number;
    categoryName: string;
    taxPercent: number;
  } | null;

  @Column({ type: 'int', unsigned: true, default: 0 })
  inventoryQuantityDeducted: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  returnedQuantity: number;

  @Column({ type: 'int', unsigned: true, nullable: true })
  returnedFromLineItemId: number | null;

  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'item_id', type: 'int', unsigned: true, nullable: false })
  @Index('item_id')
  itemId: number;

  @Column({ name: 'invoice_id', type: 'int', unsigned: true, nullable: false })
  @Index('invoice_id')
  invoiceId: number;

  @ManyToOne(() => Invoice, invoice => invoice.lineItems)
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @Column({ name: 'item_type_id', type: 'int', unsigned: true, nullable: false })
  @Index('item_type_id')
  itemTypeId: number;

  @Column({ type: 'float', nullable: false })
  unit: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  amount: number;

  @Column({ type: 'text', nullable: false })
  description: string;

  @Column({ name: 'royaltyFree', type: 'tinyint', unsigned: true, nullable: false })
  royaltyFree: number;

  /** Category and rate captured when the invoice line is created. */
  @Column({ name: 'royaltyCategoryId', type: 'int', unsigned: true, nullable: true })
  royaltyCategoryId: number | null;

  @Column({ name: 'royaltyRateApplied', type: 'decimal', precision: 5, scale: 2, nullable: false, default: 0 })
  royaltyRateApplied: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  advertisementRateApplied: number;

  @Column({ name: 'tax_type', type: 'varchar', length: 30, nullable: false })
  taxType: string;

  @Column({ name: 'tax_rate', type: 'decimal', precision: 10, scale: 4, nullable: true })
  taxRate: number;

  @Column({ name: 'tax_status', type: 'varchar', length: 30, nullable: false })
  taxStatus: string;

  @Column({ name: 'tax_code', type: 'varchar', length: 5, nullable: false })
  taxCode: string;

  @Column({ type: 'tinytext', nullable: false })
  code: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  cost: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, unsigned: true, nullable: true })
  rate: number;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1, nullable: true })
  @Index('IDX_invoice_line_item_is_deleted')
  isDeleted: boolean;

  @Column({ name: 'netTotal', type: 'decimal', precision: 10, scale: 4, nullable: false, default: 0.0000 })
  netTotal: number;

  @OneToMany(() => InvoiceLineItemDiscount, (discount) => discount.invoiceLineItem)
  discounts: InvoiceLineItemDiscount[];

   // @ManyToOne(() => Invoice, (invoice) => invoice.lineItems)
  // invoice: Invoice;

  @OneToOne(() => InvoiceItemLesson, (itemLesson) => itemLesson.invoiceLineItem)
  invoiceItemLesson: InvoiceItemLesson;

  @OneToOne(() => InvoiceItemEnrolment, invoiceItemEnrolment => invoiceItemEnrolment.invoiceLineItem)
  invoiceItemEnrolment: InvoiceItemEnrolment;

  @OneToOne(() => Item, item => item.invoiceLineItem)
  @JoinColumn({ name: 'item_id'})
  item: Item;

  // Legacy compatibility - matches legacy getItemDiscounts() method
  @OneToMany(() => InvoiceLineItemDiscount, (discount) => discount.invoiceLineItem)
  itemDiscounts: InvoiceLineItemDiscount[];
  
}
