import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('teacher_room')
export class TeacherRoom {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'classroomId', type: 'int', unsigned: true })
  classroomId: number;

  @Column({ name: 'teacherAvailabilityId', type: 'int', unsigned: true })
  teacherAvailabilityId: number;
}

