import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { PaymentMethod } from './payment-method.entity';

@Entity('payment')
export class Payment {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  /** 1: historical report-level advertisement rounding; 2: saved category amounts. */
  @Column({ type: 'tinyint', unsigned: true, default: 2 })
  advertisementCalculationVersion: number;

  @Column({ type: 'int', nullable: true })
  transactionId: number;

  @Column({ name: 'user_id', type: 'int', unsigned: true })
  userId: number;

  @Column({ name: 'payment_method_id', type: 'tinyint', unsigned: true })
  paymentMethodId: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  amount: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  date: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'tinyint', nullable: true })
  isDeleted: number;

  @CreateDateColumn({ type: 'timestamp', nullable: true })
  createdOn: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true })
  updatedOn: Date;

  @Column({ name: 'createdByUserId', type: 'int', unsigned: true })
  createdByUserId: number;

  @Column({ name: 'updatedByUserId', type: 'int', unsigned: true })
  updatedByUserId: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0.0000 })
  balance: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => PaymentMethod, { nullable: true })
  @JoinColumn({ name: 'payment_method_id' })
  paymentMethod: PaymentMethod;
}
