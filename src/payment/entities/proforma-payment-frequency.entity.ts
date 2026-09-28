import { Invoice } from '../../invoice/entities/invoice.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn
} from 'typeorm';
import { PaymentFrequency } from './payment-frequency.entity';

@Entity('proforma_payment_frequency')
export class ProformaPaymentFrequency {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ type: 'int', unsigned: true })
  invoiceId: number;

  @Column({ type: 'tinyint', unsigned: true })
  paymentFrequencyId: number;

  @OneToOne(() => Invoice, invoice => invoice.proformaPaymentFrequency)
  @JoinColumn({ name: 'invoiceId' })
  invoice: Invoice;

  @OneToOne(() => PaymentFrequency, paymentFrequency => paymentFrequency.proformaPayment)
  @JoinColumn({ name: 'paymentFrequencyId' })
  paymentFrequency: PaymentFrequency;

}