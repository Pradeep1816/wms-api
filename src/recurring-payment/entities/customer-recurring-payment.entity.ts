import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  DeleteDateColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CustomerRecurringPaymentEnrolment } from './customer-recurring-payment-enrolment.entity';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { PaymentFrequency } from '../../payment/entities/payment-frequency.entity';
import { User } from '../../user/entities/user.entity';

@Entity('customer_recurring_payment')
export class CustomerRecurringPayment {
 
  static readonly DEFAULT_PAYMENT_METHOD_ID = 8; // Credit Card
  static readonly DEFAULT_RATE = 115;
  static readonly DEFAULT_PAYMENT_DAY = 1;
  static readonly DEFAULT_PAYMENT_FREQUENCY_ID = 1; // Monthly

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  customerId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'customerId' })
  customer: User;

  @Column()
  entryDay: number;

  @Column()
  paymentDay: number;

  @Column()
  paymentMethodId: number;

  @Column()
  paymentFrequencyId: number;


  @Column({ type: 'date', nullable: true })
  expiryDate: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  amount: number;

  @Column({ default: false })
  isDeleted: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'createdOn' })
  createdOn: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updatedOn' })
  updatedOn: Date;

  @Column()
  createdByUserId: number;

  @Column()
  updatedByUserId: number;

  @Column({ type: 'boolean', default: false })
  isRecurringPaymentEnabled: boolean;

  @Column({ type: 'date', nullable: true })
  startDate: string;

  @Column({ type: 'date', nullable: true })
  nextEntryDay: string;

  /**
   * Relationships
   */

  @OneToMany(() => CustomerRecurringPaymentEnrolment, enrol => enrol.customerRecurringPayment, {
    cascade: true,
  })
  enrolments: CustomerRecurringPaymentEnrolment[];

  @ManyToOne(() => PaymentMethod)
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethod: PaymentMethod;

  @ManyToOne(() => PaymentFrequency)
  @JoinColumn({ name: 'paymentFrequencyId' })
  paymentFrequency: PaymentFrequency;

}
