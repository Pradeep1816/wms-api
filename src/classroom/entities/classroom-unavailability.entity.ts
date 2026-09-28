import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Classroom } from './classroom.entity';

@Entity('classroom_unavailability')
export class ClassroomUnavailability {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ unsigned: true })
  classroomId: number;

  @Column({ type: 'timestamp' })
  fromDate: Date;

  @Column({ type: 'timestamp' })
  toDate: Date;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @ManyToOne(() => Classroom, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'classroomId' })
  classroom: Classroom;
}
