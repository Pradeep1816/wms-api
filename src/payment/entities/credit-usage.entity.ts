import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Payment } from './payment.entity';

@Entity('credit_usage')
export class CreditUsage {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'credit_payment_id', type: 'int', unsigned: true, nullable: false })
  creditPaymentId: number;

  @Column({ name: 'debit_payment_id', type: 'int', unsigned: true, nullable: false })
  debitPaymentId: number;

  @ManyToOne(() => Payment)
  @JoinColumn({ name: 'credit_payment_id' })
  creditPayment: Payment;

  @ManyToOne(() => Payment)
  @JoinColumn({ name: 'debit_payment_id' })
  debitPayment: Payment;
}
