import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Course } from './course.entity';

@Entity('course_program_rate')
export class CourseProgramRate {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'courseId', type: 'int', unsigned: true })
  @Index()
  courseId: number;

  @Column({ name: 'startDate', type: 'date' })
  startDate: Date;

  @Column({ name: 'endDate', type: 'date' })
  endDate: Date;

  @Column({ name: 'programRate', type: 'decimal', precision: 10, scale: 2 })
  programRate: number;

  @Column({ name: 'applyFullDiscount', type: 'tinyint', width: 1 })
  applyFullDiscount: boolean;

  @ManyToOne(() => Course, course => course.courseProgramRates)
  @JoinColumn({ name: 'courseId' })
  course: Course;
}


