import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { UserLocation } from '../../user/entities/user-location.entity';

@Entity('teacher_availability_day')
export class TeacherAvailability {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'teacher_location_id', type: 'int', unsigned: true })
  teacherLocationId: number;

  @Column({ type: 'tinyint', unsigned: true })
  day: number;

  @Column({ name: 'from_time', type: 'time' })
  fromTime: string;

  @Column({ name: 'to_time', type: 'time' })
  toTime: string;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1, default: false })
  isDeleted: boolean;

  @Column({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @Column({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @Column({ name: 'createdByUserId', type: 'int', unsigned: true })
  createdByUserId: number;

  @Column({ name: 'updatedByUserId', type: 'int', unsigned: true })
  updatedByUserId: number;

  // Relationship with UserLocation entity
  @ManyToOne(() => UserLocation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'teacher_location_id' })
  userLocation: UserLocation;
}
