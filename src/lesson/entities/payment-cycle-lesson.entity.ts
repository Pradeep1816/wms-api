import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Lesson } from './lesson.entity';
import { PaymentCycle } from '../../payment/entities/payment-cycle.entity';

@Entity('payment_cycle_lesson')
export class PaymentCycleLesson {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'paymentCycleId', type: 'int', unsigned: true, nullable: false })
  @Index()
  paymentCycleId: number;

  @Column({ name: 'lessonId', type: 'int', unsigned: true, nullable: false })
  @Index()
  lessonId: number;

  @Column({ name: 'isDeleted', type: 'int', nullable: false })
  isDeleted: number;

  // Relationships
  @ManyToOne(() => Lesson, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lessonId' })
  lesson: Lesson;

  @ManyToOne(() => PaymentCycle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'paymentCycleId' })
  paymentCycle: PaymentCycle;
}

