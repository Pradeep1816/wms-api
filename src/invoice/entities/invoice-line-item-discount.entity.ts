import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import type { Relation } from 'typeorm';
import type { InvoiceLineItem } from './invoice-line-item.entity';

@Entity('invoice_line_item_discount')
export class InvoiceLineItemDiscount {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'invoiceLineItemId', unsigned: true })
  @Index()
  invoiceLineItemId: number;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  value: number;

  @Column({ name: 'valueType', type: 'tinyint', unsigned: true })
  valueType: number;

  @Column({ type: 'tinyint', unsigned: true })
  type: number;

  // Bun evaluates circular entity imports more strictly than Node, so resolve
  // the target lazily here instead of touching InvoiceLineItem at module init.
  @ManyToOne(
    () => require('./invoice-line-item.entity').InvoiceLineItem,
    (invoiceLineItem: InvoiceLineItem) => invoiceLineItem.discounts,
  )
  @JoinColumn({ name: 'invoiceLineItemId' })
  invoiceLineItem: Relation<InvoiceLineItem>;

  // Constants matching legacy system
  static VALUE_TYPE_PERCENTAGE = 1;
  static VALUE_TYPE_DOLLAR = 0;
  
  static TYPE_CUSTOMER = 1;
  static TYPE_ENROLMENT_PAYMENT_FREQUENCY = 2;
  static TYPE_MULTIPLE_ENROLMENT = 3;
  static TYPE_LINE_ITEM = 4;
  static TYPE_GROUP = 5;

  /**
   * The published prepaid cycle reduction, in dollars.
   *
   * Numbered **7 to match `LessonDiscount.TYPE_PREPAID_CYCLE`**, deliberately
   * skipping 6 for the same reason - see the note there. Keeping the two enums
   * aligned is what lets a lesson discount be copied onto a line item by type
   * without a mapping table, which is exactly how the existing five are
   * handled.
   *
   * It **replaces** payment frequency rather than stacking with it, in every
   * place that reads it.
   */
  static TYPE_PREPAID_CYCLE = 7;
}
