import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';

@Entity('payment_cycle')
export class PaymentCycle {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'enrolmentId', type: 'int', unsigned: true })
  @Index()
  enrolmentId: number;

  @Column({ name: 'startDate', type: 'date' })
  startDate: Date;

  @Column({ name: 'endDate', type: 'date' })
  endDate: Date;

  @Column({ name: 'isDeleted', type: 'int', default: 0 })
  isDeleted: number;

  @Column({ name: 'isPreferredPaymentEnabled', type: 'tinyint', width: 1, default: false })
  isPreferredPaymentEnabled: boolean;

  // Relations
  @ManyToOne(() => Enrolment, enrolment => enrolment.paymentCycles)
  @JoinColumn({ name: 'enrolmentId' })
  enrolment: Enrolment;
}

