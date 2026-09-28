import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Lesson } from './lesson.entity';

@Entity('group_lesson_email_status')
export class GroupLessonEmailStatus {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'lessonId', type: 'int', unsigned: true })
  lessonId: number;

  @Column({ name: 'studentId', type: 'int', unsigned: true })
  studentId: number;

  @Column({ name: 'notificationType', type: 'int' })
  notificationType: number;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  status: number;

  // Relationships
  @ManyToOne(() => Lesson, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lessonId' })
  lesson: Lesson;
}

