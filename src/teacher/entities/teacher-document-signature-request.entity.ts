import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Location } from '../../location/entities/location.entity';
import { User } from '../../user/entities/user.entity';

export enum TeacherDocumentSignatureRequestType {
  TIME_VOUCHER = 'time_voucher',
  INVOICED_LESSONS = 'invoiced_lessons',
}

export enum TeacherDocumentSignatureRequestStatus {
  PENDING = 'pending',
  SIGNED = 'signed',
  /** Reserved for a future teacher-initiated cancellation of their own request. */
  CANCELLED = 'cancelled',
  REJECTED = 'rejected', // added a new enum
  /** Voided by the school: the document is retained but no longer counts. */
  VOID = 'void',
}

@Entity('teacher_document_signature_request')
export class TeacherDocumentSignatureRequest {
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

  @Column({ name: 'summaryOnly', type: 'tinyint', width: 1, default: false })
  summaryOnly: boolean;

  @Column({
    name: 'status',
    type: 'enum',
    enum: TeacherDocumentSignatureRequestStatus,
    default: TeacherDocumentSignatureRequestStatus.PENDING,
  })
  status: TeacherDocumentSignatureRequestStatus;

  // added reason For Rejection for document rejected by teacher
  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejection_reason: string | null;

  @Column({ name: 'requestedByUserId', type: 'int' })
  requestedByUserId: number;

  @Column({ name: 'requestedAt', type: 'timestamp', nullable: true })
  requestedAt: Date;

  /** Set each time the request notification is re-sent; null if never chased. */
  @Column({ name: 'lastRemindedAt', type: 'timestamp', nullable: true })
  lastRemindedAt: Date | null;

  @Column({
    name: 'signedByUserId',
    type: 'int',
    nullable: true,
  })
  signedByUserId: number | null;

  @Column({ name: 'signedAt', type: 'timestamp', nullable: true })
  signedAt: Date | null;

  @Column({
    name: 'signedSignerName',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  signedSignerName: string | null;

  @Column({ name: 'voidedByUserId', type: 'int', nullable: true })
  voidedByUserId: number | null;

  @Column({ name: 'voidedAt', type: 'timestamp', nullable: true })
  voidedAt: Date | null;

  @Column({
    name: 'voidReason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  voidReason: string | null;

  @Column({ name: 'signedSignatureDataUrl', type: 'longtext', nullable: true })
  signedSignatureDataUrl: string | null;

  @Column({ name: 'signedSnapshotHtml', type: 'longtext', nullable: true })
  signedSnapshotHtml: string | null;

  @Column({
    name: 'signedPdfUrl',
    type: 'varchar',
    length: 1024,
    nullable: true,
  })
  signedPdfUrl: string | null;

  @Column({ name: 'disclosureSnapshot', type: 'longtext', nullable: true })
  disclosureSnapshot: string | null;

  @Column({ name: 'documentDataSnapshot', type: 'longtext', nullable: true })
  documentDataSnapshot: string | null;

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
  @JoinColumn({ name: 'requestedByUserId' })
  requestedByUser: User;
}
