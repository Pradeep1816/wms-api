import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('payment_cycle_lesson')
export class PaymentCycleLesson {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'paymentCycleId', type: 'int', unsigned: true })
  @Index()
  paymentCycleId: number;

  @Column({ name: 'lessonId', type: 'int', unsigned: true })
  @Index()
  lessonId: number;

  @Column({ name: 'isDeleted', type: 'int' })
  isDeleted: number;
}

