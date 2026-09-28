import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Lesson } from './lesson.entity';

@Entity('bulk_reschedule_lesson')
export class BulkRescheduleLesson {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'lessonId', type: 'int', unsigned: true, nullable: false })
  lessonId: number;

  @CreateDateColumn({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @Column({ name: 'createdByUserId', type: 'int', nullable: false })
  createdByUserId: number;

  @Column({ name: 'updatedByUserId', type: 'int', nullable: false })
  updatedByUserId: number;

  // Relations
  @ManyToOne(() => Lesson, lesson => lesson.id)
  @JoinColumn({ name: 'lessonId' })
  lesson: Lesson;
}
