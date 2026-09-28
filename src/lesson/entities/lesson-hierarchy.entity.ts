import { Entity, Column, ManyToOne, JoinColumn, PrimaryColumn } from 'typeorm';
import { Lesson } from './lesson.entity';

@Entity('lesson_hierarchy')
export class LessonHierarchy {
  @PrimaryColumn({ name: 'lessonId', type: 'int' })
  lessonId: number;

  @PrimaryColumn({ name: 'childLessonId', type: 'int' })
  childLessonId: number;

  @Column({ type: 'int' })
  depth: number;

  // Relationships
  @ManyToOne(() => Lesson, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lessonId' })
  lesson: Lesson;

  @ManyToOne(() => Lesson, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'childLessonId' })
  childLesson: Lesson;
}
