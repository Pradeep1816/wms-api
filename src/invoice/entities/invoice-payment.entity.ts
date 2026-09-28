import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Invoice } from './invoice.entity';
import { Payment } from '../../payment/entities/payment.entity';

@Entity('invoice_payment')
export class InvoicePayment {
  /** Immutable category split for an allocation to an invoice containing POS.
   * Later goods returns must not reclassify that earlier allocation. */
  @Column({ type: 'json', nullable: true })
  posPurposeSnapshot: { amount: number; purposes: Record<string, unknown>[] } | null;

  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'invoice_id', type: 'int', unsigned: true, nullable: false })
  invoiceId: number;

  @Column({ name: 'payment_id', type: 'int', unsigned: true, nullable: false })
  paymentId: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: false })
  amount: number;

  @Column({ name: 'isDeleted', type: 'int', nullable: false })
  isDeleted: number;

  @Column({ type: 'timestamp', nullable: false })
  date: Date;

  @CreateDateColumn({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @Column({ name: 'createdByUserId', type: 'int', nullable: false })
  createdByUserId: number;

  @Column({ name: 'updatedByUserId', type: 'int', nullable: false })
  updatedByUserId: number;

  @ManyToOne(() => Invoice)
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @ManyToOne(() => Payment)
  @JoinColumn({ name: 'payment_id' })
  payment: Payment;
}
