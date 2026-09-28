import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { PosTransactionLineItem } from './pos-transaction-line-item.entity';

export enum PosTransactionStatus {
  DRAFT = 'DRAFT',
  PAID = 'PAID',
  CANCELED = 'CANCELED',
  VOIDED = 'VOIDED',
  REFUNDED = 'REFUNDED',
  INVOICED = 'INVOICED',
}

export enum PosTransactionReversalType {
  VOID = 'VOID',
  REFUND = 'REFUND',
}

@Entity('pos_transaction')
export class PosTransaction {
  @Column({ type: 'int', unsigned: true, nullable: true })
  invoiceId: number | null;

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20, unique: true })
  transactionId: string;

  @Column({ type: 'int' })
  locationId: number;

  @Column({ type: 'int', default: 0, nullable: false })
  transactionSequence: number;

  @Column({ type: 'varchar', length: 1, default: 'P' })
  type: string;

  @CreateDateColumn()
  date: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  customerInfo: string | null; 

  @Column({ name: 'customer_id', type: 'int', unsigned: true, nullable: true })
  customerId: number | null;

  @Column({ type: 'boolean', default: false })
  isWalkIn: boolean;

  @Column({ type: 'varchar', length: 20, default: PosTransactionStatus.DRAFT })
  status: PosTransactionStatus;

  @Column({ type: 'int', unsigned: true, nullable: true })
  createdByUserId: number | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  soldByUserId: number | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  paymentId: number | null;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  cancelledByUserId: number | null;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  reversalType: PosTransactionReversalType | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reversalReason: string | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  reversedByUserId: number | null;

  @Column({ type: 'timestamp', nullable: true })
  reversedAt: Date | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  refundPaymentId: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  subtotal: number; 

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  discountAmount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  tax: number; 

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalAmount: number; 

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  paidAmount: number; 

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  balance: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => PosTransactionLineItem, lineItem => lineItem.posTransaction, {
    cascade: true,
    eager: true
  })
  lineItems: PosTransactionLineItem[];

  calculateTotals(): void {
    const subtotal = (this.lineItems ?? []).reduce((sum, item) => sum + item.getLineItemTotal(), 0);
    const discountAmount = Number(this.discountAmount) || 0;
    const tax = Number(this.tax) || 0;
    const paidAmount = Number(this.paidAmount) || 0;
    
    this.subtotal = subtotal;
    this.totalAmount = subtotal - discountAmount + tax;
    this.balance = this.totalAmount - paidAmount;
  }
}
