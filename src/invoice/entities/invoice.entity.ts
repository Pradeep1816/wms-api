import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { InvoiceLineItem } from './invoice-line-item.entity';
import { InvoiceReverse } from './invoice-reverse.entity';
import { User } from '../../user/entities/user.entity';
import { forwardRef } from '@nestjs/common';
import { ProformaPaymentFrequency } from '../../payment/entities/proforma-payment-frequency.entity';
import { getInvoiceStatus } from '../../utils/helper';

@Entity('invoice')
export class Invoice {
  /** Buyer identity belongs to this invoice, not the shared Walkin Customer. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  walkinBuyerName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, unique: true })
  posReturnRequestKey: string | null;

  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'transactionId', type: 'int', nullable: true })
  @Index('tranctionId')
  transactionId: number;

  @Column({ name: 'user_id', type: 'int', unsigned: true, nullable: false })
  @Index('user_id')
  userId: number;

  @Column({ name: 'location_id', type: 'int', unsigned: true, nullable: false })
  @Index('location_id')
  locationId: number;

  @Column({ name: 'invoice_number', type: 'int', unsigned: true, nullable: false })
  @Index('invoice_number')
  invoiceNumber: number;

  @Column({ type: 'timestamp', nullable: true })
  @Index('IDX_invoice_date')
  date: Date;

  @Column({ 
    type: 'tinyint', 
    unsigned: true, 
    nullable: false,
    comment: '1 - Pro-forma-invoice/Request for pre-payment,2 - Invoice'
  })
  @Index('IDX_invoice_type')
  type: number;

  @Column({ name: 'subTotal', type: 'decimal', precision: 10, scale: 4, nullable: true })
  subTotal: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  tax: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  total: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  balance: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'tinyint', unsigned: true, nullable: false })
  status: number;

  @Column({ name: 'isSent', type: 'tinyint', width: 1, nullable: true })
  isSent: boolean;

  @Column({ name: 'isDeleted', type: 'tinyint', unsigned: true, nullable: false })
  @Index('IDX_invoice_is_deleted')
  isDeleted: boolean;

  @Column({ name: 'isTaxAdjusted', type: 'int', nullable: false })
  isTaxAdjusted: number;

  @Column({ name: 'isCanceled', type: 'tinyint', width: 1, nullable: false })
  @Index('IDX_invoice_is_canceled')
  isCanceled: boolean;

  @Column({ name: 'isEquipmentRentalContract', type: 'tinyint', width: 1, nullable: false, default: 0 })
  isEquipmentRentalContract: boolean;

  @CreateDateColumn({ name: 'createdOn', type: 'timestamp', nullable: false, default: 'CURRENT_TIMESTAMP' })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @Column({ name: 'createdUserId', type: 'int', unsigned: true, nullable: false })
  createdUserId: number;

  @Column({ name: 'updatedUserId', type: 'int', unsigned: true, nullable: false })
  updatedUserId: number;

  @Column({ name: 'dueDate', type: 'date', nullable: true })
  dueDate: Date;

  @Column({ name: 'isPosted', type: 'int', nullable: false })
  isPosted: number;

  @Column({ name: 'isVoid', type: 'int', nullable: false })
  isVoid: number;

  @Column({ name: 'paidStatus', type: 'int', nullable: false, default: 0 })
  paidStatus: number;

  @Column({ name: 'totalCopy', type: 'decimal', precision: 10, scale: 4, nullable: false, default: 0.0000 })
  totalCopy: number;

  @OneToMany(() => InvoiceLineItem, (lineItem) => lineItem.invoice)
  lineItems: InvoiceLineItem;

  @OneToOne(() => User, user => user.invoice)
  @JoinColumn({ name: 'user_id'})
  user: User;

  @OneToOne(() => ProformaPaymentFrequency, proformaPaymentFrequency => proformaPaymentFrequency.invoice)
  proformaPaymentFrequency: ProformaPaymentFrequency;

  static TYPE_PRO_FORMA_INVOICE = 1;
  static TYPE_INVOICE = 2;
  static STATUS_OWING = 1;
  static STATUS_PAID = 2;
  static STATUS_CREDIT = 3;
  static STATUS_CANCEL = 4;
  static STATUS_VOID = 5;

  // Get  invoice status
  getStatus(): string {
    return getInvoiceStatus(
      this.status,
      this.type,
      this.balance || 0,
      Boolean(this.isVoid)
    );
  }
}
