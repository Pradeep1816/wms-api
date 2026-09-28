import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Course } from './course.entity';

@Entity('course_extra')
export class CourseExtra {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ name: 'courseId', type: 'int' })
  courseId: number;

  @Column({ name: 'extraCourseId', type: 'int' })
  extraCourseId: number;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1 })
  isDeleted: boolean;

  // Relations
  @ManyToOne(() => Course)
  @JoinColumn({ name: 'courseId' })
  course: Course;

  @ManyToOne(() => Course)
  @JoinColumn({ name: 'extraCourseId' })
  extraCourse: Course;
}
