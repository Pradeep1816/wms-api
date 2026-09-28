import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, OneToMany, ManyToOne, JoinColumn, OneToOne } from 'typeorm';
import { Program } from '../../program/entities/program.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { InvoiceItemEnrolment } from '../../invoice/entities/invoice-item-enrolment.entity';
import { CourseSchedule } from './course-schedule.entity';
import { CourseProgramRate } from './course-program-rate.entity';
import { CourseGroup } from './course-group.entity';
import { User } from 'src/user/entities/user.entity';

@Entity('course')
export class Course {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'programId', type: 'int', unsigned: true })
  @Index()
  programId: number;

  @Column({ name: 'teacherId', type: 'int', unsigned: true })
  @Index()
  teacherId: number;

  @Column({ name: 'locationId', type: 'int', unsigned: true })
  @Index()
  locationId: number;

  @Column({ type: 'int', default: 1 })
  type: number;

  @Column({ name: 'startDate', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  startDate: Date;

  @Column({ name: 'endDate', type: 'datetime', nullable: true })
  endDate: Date;

  @Column({ name: 'isConfirmed', type: 'tinyint', unsigned: true })
  @Index('IDX_course_is_confirmed')
  isConfirmed: number;

  @Column({ name: 'lessonsCount', type: 'int' })
  lessonsCount: number;

  @Column({ name: 'is_online', type: 'tinyint', default: 0 })
  isOnline: number;

  @CreateDateColumn({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @Column({ name: 'createdByUserId', type: 'int' })
  createdByUserId: number;

  @Column({ name: 'updatedByUserId', type: 'int' })
  updatedByUserId: number;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1 })
  @Index('IDX_course_is_deleted')
  isDeleted: boolean;

  // Relations
  @ManyToOne(() => Program, program => program.courses)
  @JoinColumn({ name: 'programId' })
  program: Program;

  @OneToMany(() => Lesson, lesson => lesson.course)
  lessons: Lesson[];

  @OneToMany(() => Enrolment, enrolment => enrolment.course)
  enrolments: Enrolment[];

  @OneToMany(() => InvoiceItemEnrolment, invoiceItemEnrolment => invoiceItemEnrolment.course)
  invoiceItemsEnrolment: InvoiceItemEnrolment[];

  @ManyToOne(() => User, user => user.courses)
  @JoinColumn({ name: 'teacherId' })
  teacher: User;
  
  @OneToMany(() => CourseSchedule, courseSchedule => courseSchedule.course)
  courseSchedule: CourseSchedule[];

  @OneToMany(() => CourseProgramRate, courseProgramRate => courseProgramRate.course)
  courseProgramRates: CourseProgramRate[];

  @OneToOne(() => CourseGroup, courseGroup => courseGroup.course)
  courseGroup: CourseGroup;

  // Type constants
  static TYPE_REGULAR = 1;
  static TYPE_EXTRA = 2;
}
