import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Lesson } from './lesson.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';

@Entity('group_lesson')
export class GroupLesson {
  // Status constants
  static readonly STATUS_OWING = 1;
  static readonly STATUS_PAID = 2;
  static readonly STATUS_CREDIT = 3;

  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ name: 'lessonId', type: 'int' })
  lessonId: number;

  @Column({ name: 'enrolmentId', type: 'int' })
  enrolmentId: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0.0000 })
  total: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0.0000 })
  balance: number;

  @Column({ name: 'paidStatus', type: 'int' })
  paidStatus: number;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1 })
  isDeleted: boolean;

  @Column({ name: 'dueDate', type: 'date', nullable: true })
  dueDate: Date;

  @Column({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @Column({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @Column({ name: 'createdByUserId', type: 'int' })
  createdByUserId: number;

  @Column({ name: 'updatedByUserId', type: 'int' })
  updatedByUserId: number;

  // Relationships
  @ManyToOne(() => Lesson, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lessonId' })
  lesson: Lesson;

  @ManyToOne(() => Enrolment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'enrolmentId' })
  enrolment: Enrolment;

}
