import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Lesson } from './lesson.entity';

@Entity('lesson_split_usage')
export class LessonSplitUsage {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'lessonId', type: 'int', unsigned: true, nullable: false })
  @Index()
  lessonId: number;

  @Column({ name: 'extendedLessonId', type: 'int', unsigned: true, nullable: false })
  @Index()
  extendedLessonId: number;

  @Column({ name: 'mergedOn', type: 'timestamp', nullable: false, default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  mergedOn: Date;

  // Relationships
  @ManyToOne(() => Lesson, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lessonId' })
  lesson: Lesson;

  @ManyToOne(() => Lesson, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'extendedLessonId' })
  extendedLesson: Lesson;
}

