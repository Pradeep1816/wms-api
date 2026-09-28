import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { Lesson } from './lesson.entity';
import { Payment } from '../../payment/entities/payment.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';

@Entity('lesson_payment')
export class LessonPayment {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ name: 'lessonId', type: 'int', nullable: false })
  @Index()
  lessonId: number;

  @Column({ name: 'paymentId', type: 'int', nullable: false })
  @Index()
  paymentId: number;

  @Column({ name: 'enrolmentId', type: 'int', nullable: true })
  @Index()
  enrolmentId: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: false })
  amount: number;

  @Column({ name: 'royaltyCategoryId', type: 'int', unsigned: true, nullable: true })
  royaltyCategoryId: number | null;

  @Column({ name: 'royaltyRateApplied', type: 'decimal', precision: 5, scale: 2, nullable: true })
  royaltyRateApplied: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  advertisementRateApplied: number;

  @Column({ name: 'isDeleted', type: 'int', nullable: false })
  isDeleted: number;

  @Column({ type: 'timestamp', nullable: false, default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  date: Date;

  @CreateDateColumn({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @Column({ name: 'createdByUserId', type: 'int', nullable: false })
  createdByUserId: number;

  @Column({ name: 'updatedByUserId', type: 'int', nullable: false })
  updatedByUserId: number;

  // Relationships
  @ManyToOne(() => Lesson, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lessonId' })
  lesson: Lesson;

  @ManyToOne(() => Payment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'paymentId' })
  payment: Payment;

  @ManyToOne(() => Enrolment, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'enrolmentId' })
  enrolment: Enrolment;
}
