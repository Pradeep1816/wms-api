import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { Payment } from './payment.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';

@Entity('lesson_payment')
export class LessonPayment {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'lessonId', type: 'int', unsigned: true })
  lessonId: number;

  @Column({ name: 'paymentId', type: 'int', unsigned: true })
  paymentId: number;

  @Column({ name: 'enrolmentId', type: 'int', unsigned: true, nullable: true })
  enrolmentId: number;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  amount: number;

  @Column({ name: 'royaltyCategoryId', type: 'int', unsigned: true, nullable: true })
  royaltyCategoryId: number | null;

  @Column({ name: 'royaltyRateApplied', type: 'decimal', precision: 5, scale: 2, nullable: true })
  royaltyRateApplied: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  advertisementRateApplied: number;

  @Column({ name: 'isDeleted', type: 'int' })
  isDeleted: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  date: Date;

  @CreateDateColumn({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @Column({ name: 'createdByUserId', type: 'int', unsigned: true })
  createdByUserId: number;

  @Column({ name: 'updatedByUserId', type: 'int', unsigned: true })
  updatedByUserId: number;

  @ManyToOne(() => Lesson, { nullable: true })
  @JoinColumn({ name: 'lessonId' })
  lesson: Lesson;

  @ManyToOne(() => Payment, { nullable: true })
  @JoinColumn({ name: 'paymentId' })
  payment: Payment;

  @ManyToOne(() => Enrolment, { nullable: true })
  @JoinColumn({ name: 'enrolmentId' })
  enrolment: Enrolment;
}
