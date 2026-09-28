import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Payment } from '../../payment/entities/payment.entity';
import { CustomerRecurringPayment } from './customer-recurring-payment.entity';

@Entity('recurring_payment')
export class RecurringPayment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  paymentId: number;

  @Column({ type: 'int' })
  customerRecurringPaymentId: number;

  @Column({ type: 'date' })
  date: string;

  @CreateDateColumn({ type: 'timestamp', name: 'createdOn', nullable: true })
  createdOn: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updatedOn', nullable: true })
  updatedOn: Date;

  @Column({ type: 'int' })
  createdByUserId: number;

  @Column({ type: 'int' })
  updatedByUserId: number;

  @ManyToOne(() => Payment, { nullable: true })
  @JoinColumn({ name: 'paymentId' })
  payment: Payment;

  @ManyToOne(() => CustomerRecurringPayment, { nullable: true })
  @JoinColumn({ name: 'customerRecurringPaymentId' })
  customerRecurringPayment: CustomerRecurringPayment;
}
