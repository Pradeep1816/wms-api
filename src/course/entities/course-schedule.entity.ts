import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Course } from './course.entity';
import { User } from '../../user/entities/user.entity';

@Entity('course_schedule')
export class CourseSchedule {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'courseId', type: 'int', unsigned: true })
  courseId: number;

  @Column({ name: 'day', type: 'tinyint', unsigned: true })
  day: number;

  @Column({ name: 'fromTime', type: 'time' })
  fromTime: string;

  @Column({ name: 'duration', type: 'time' })
  duration: string;

  @Column({ name: 'startDate', type: 'datetime'})
  startDate: Date;

  @Column({ name: 'endDate', type: 'datetime'})
  endDate: Date;

  @Column({ name: 'teacherId', type: 'int' })
  teacherId: number;

  @Column({ name: 'isRecent', type: 'tinyint', width: 1, nullable: true })
  isRecent: boolean;

  // Relations
  @ManyToOne(() => Course, course => course.courseSchedule)
  @JoinColumn({ name: 'courseId' })
  course: Course;

  @ManyToOne(() => User, user => user.id)
  @JoinColumn({ name: 'teacherId' })
  teacher: User;
}
