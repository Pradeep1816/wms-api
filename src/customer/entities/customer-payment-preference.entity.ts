import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('customer_payment_preference')
export class CustomerPaymentPreference {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'userId' })
  userId: number;

  @Column({ name: 'dayOfMonth' })
  dayOfMonth: number;

  @Column({ name: 'paymentMethodId' })
  paymentMethodId: number;

  @Column({ name: 'expiryDate', type: 'date', nullable: true })
  expiryDate: Date;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1, nullable: true })
  isDeleted: boolean;

  @Column({ name: 'isPreferredPaymentEnabled', type: 'tinyint', width: 1, nullable: true })
  isPreferredPaymentEnabled: boolean;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  customer: User;
}
