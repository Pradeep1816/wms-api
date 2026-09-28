import { Entity, PrimaryGeneratedColumn, Column, OneToOne } from 'typeorm';
import { ProformaPaymentFrequency } from './proforma-payment-frequency.entity';

@Entity('payment_frequency')
export class PaymentFrequency {
  @PrimaryGeneratedColumn({ type: 'tinyint', unsigned: true })
  id: number;

  @Column({ type: 'varchar', length: 20 })
  name: string;

  // @Column({ type: 'tinyint', unsigned: true, default: 1 })
  // active: number;

  @Column({ type: 'tinyint', unsigned: true })
  frequencyLength: number;

  @OneToOne(() => ProformaPaymentFrequency, proformaPayment => proformaPayment.paymentFrequency)
  proformaPayment: ProformaPaymentFrequency;

}

