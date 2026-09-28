import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Payment } from '../../payment/entities/payment.entity';

@Entity('credit_usage')
export class CreditUsage {
    @PrimaryGeneratedColumn({ unsigned: true })
    id: number;
  
    @Column({ name: 'credit_payment_id', unsigned: true })
    creditPaymentId: number;
  
    @Column({ name: 'debit_payment_id', unsigned: true })
    debitPaymentId: number;

    @ManyToOne(() => Payment)
    @JoinColumn({ name: 'credit_payment_id' })
    creditPayment: Payment;

    @ManyToOne(() => Payment)
    @JoinColumn({ name: 'debit_payment_id' })
    debitPayment: Payment;
}