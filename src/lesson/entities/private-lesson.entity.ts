import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Lesson } from './lesson.entity';

@Entity('private_lesson')
export class PrivateLesson {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'lessonId', type: 'int', unsigned: true })
  lessonId: number;

  @Column({ name: 'expiryDate', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  expiryDate: Date;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0.0000 })
  total: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0.0000 })
  balance: number;

  @Column({ name: 'dueDate', type: 'date' })
  dueDate: Date;

  // Relationships
  @ManyToOne(() => Lesson, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lessonId' })
  lesson: Lesson;

}
