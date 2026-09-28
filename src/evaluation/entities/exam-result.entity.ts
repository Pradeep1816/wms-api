import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Student } from '../../student/entities/student.entity';
import { Program } from '../../program/entities/program.entity';
import { User } from '../../user/entities/user.entity';

@Entity('exam_result')
export class ExamResult {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'studentId', type: 'int', unsigned: true })
  @Index()
  studentId: number;

  @Column({ name: 'date', type: 'timestamp', nullable: true })
  date: Date;

  @Column({ name: 'mark', type: 'decimal', precision: 10, scale: 2, nullable: true })
  mark: number;

  @Column({ name: 'level', type: 'varchar', length: 10 })
  level: string;

  @Column({ name: 'programId', type: 'int', unsigned: true })
  @Index()
  programId: number;

  @Column({ name: 'type', type: 'varchar', length: 30, nullable: true })
  type: string;

  @Column({ name: 'teacherId', type: 'int', unsigned: true })
  @Index()
  teacherId: number;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1 })
  isDeleted: boolean;

  // Relations
  @ManyToOne(() => Student)
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @ManyToOne(() => Program)
  @JoinColumn({ name: 'programId' })
  program: Program;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'teacherId' })
  teacher: User;
}
