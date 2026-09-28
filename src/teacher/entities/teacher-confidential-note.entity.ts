import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Location } from '../../location/entities/location.entity';
import { User } from '../../user/entities/user.entity';

@Entity('teacher_confidential_note')
export class TeacherConfidentialNote {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'locationId', type: 'int', unsigned: true })
  locationId: number;

  @Column({ name: 'teacherId', type: 'int' })
  teacherId: number;

  @Column({ name: 'content', type: 'longtext' })
  content: string;

  @Column({ name: 'createdByUserId', type: 'int' })
  createdByUserId: number;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1, default: false })
  isDeleted: boolean;

  @Column({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @Column({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @ManyToOne(() => Location)
  @JoinColumn({ name: 'locationId' })
  location: Location;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'teacherId' })
  teacher: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'createdByUserId' })
  createdByUser: User;
}
