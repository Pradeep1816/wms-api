import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('enrolment_policy')
export class EnrolmentPolicy {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'content', type: 'longtext' })
  content: string;

  @Column({ name: 'sortOrder', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'isActive', type: 'tinyint', width: 1, default: 1 })
  isActive: boolean;

  // Nullable because seeded rows are not authored by a user.
  @Column({ name: 'createdByUserId', type: 'int', nullable: true })
  createdByUserId: number | null;

  @Column({ name: 'updatedByUserId', type: 'int', nullable: true })
  updatedByUserId: number | null;

  @Column({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @Column({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'createdByUserId' })
  createdByUser: User | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'updatedByUserId' })
  updatedByUser: User | null;
}
