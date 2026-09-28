import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { TeacherDocumentSignatureRequestType } from './teacher-document-signature-request.entity';

@Entity('teacher_document_disclosure')
export class TeacherDocumentDisclosure {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({
    name: 'documentType',
    type: 'enum',
    enum: TeacherDocumentSignatureRequestType,
  })
  documentType: TeacherDocumentSignatureRequestType;

  @Column({ name: 'content', type: 'longtext' })
  content: string;

  @Column({ name: 'createdByUserId', type: 'int' })
  createdByUserId: number;

  @Column({ name: 'updatedByUserId', type: 'int' })
  updatedByUserId: number;

  @Column({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @Column({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'createdByUserId' })
  createdByUser: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'updatedByUserId' })
  updatedByUser: User;
}
