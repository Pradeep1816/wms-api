import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { Course } from './course.entity';

@Entity('course_group')
export class CourseGroup {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'courseId', type: 'int', unsigned: true })
  courseId: number;

  @Column({ name: 'weeksCount', type: 'tinyint', unsigned: true })
  weeksCount: number;

  @Column({ name: 'lessonsPerWeekCount', type: 'tinyint', unsigned: true })
  lessonsPerWeekCount: number;

  // Relations
  @OneToOne(() => Course, course => course.courseGroup)
  @JoinColumn({ name: 'courseId' })
  course: Course;
}
