import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Location } from '../../location/entities/location.entity';
import { User } from '../../user/entities/user.entity';
import { TeacherDocumentSignatureRequestType } from './teacher-document-signature-request.entity';

@Entity('teacher_compensation_adjustment')
export class TeacherCompensationAdjustment {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'locationId', type: 'int', unsigned: true })
  locationId: number;

  @Column({ name: 'teacherId', type: 'int' })
  teacherId: number;

  @Column({
    name: 'documentType',
    type: 'enum',
    enum: TeacherDocumentSignatureRequestType,
  })
  documentType: TeacherDocumentSignatureRequestType;

  @Column({ name: 'startDate', type: 'date' })
  startDate: string;

  @Column({ name: 'endDate', type: 'date' })
  endDate: string;

  @Column({ name: 'minimumHours', type: 'decimal', precision: 8, scale: 2 })
  minimumHours: string;

  @Column({
    name: 'hourlyRate',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  hourlyRate: string | null;

  @Column({ name: 'note', type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @Column({ name: 'createdByUserId', type: 'int' })
  createdByUserId: number;

  @Column({ name: 'updatedByUserId', type: 'int' })
  updatedByUserId: number;

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

  @ManyToOne(() => User)
  @JoinColumn({ name: 'updatedByUserId' })
  updatedByUser: User;
}
