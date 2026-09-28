import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Location } from '../../location/entities/location.entity';
import { DigitalEnrollmentSubmission } from './digital-enrollment-submission.entity';

export enum DigitalEnrollmentInvitationStatus {
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

@Entity('digital_enrollment_invitation')
export class DigitalEnrollmentInvitation {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'locationId', type: 'int', unsigned: true })
  @Index('IDX_digital_enrollment_invitation_location_id')
  locationId: number;

  @Column({ name: 'locationSlug', type: 'varchar', length: 30 })
  @Index('IDX_digital_enrollment_invitation_location_slug')
  locationSlug: string;

  @Column({ name: 'tokenHash', type: 'char', length: 64, unique: true })
  tokenHash: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: DigitalEnrollmentInvitationStatus,
    default: DigitalEnrollmentInvitationStatus.PENDING,
  })
  status: DigitalEnrollmentInvitationStatus;

  @Column({ name: 'customerEmail', type: 'varchar', length: 255, nullable: true })
  customerEmail: string | null;

  @Column({ name: 'customerName', type: 'varchar', length: 255, nullable: true })
  customerName: string | null;

  @Column({ name: 'expiresAt', type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'submittedAt', type: 'timestamp', nullable: true })
  submittedAt: Date | null;

  /**
   * When the enrolment link was last successfully emailed to the customer. Null
   * if the link was only generated/copied, never sent, or every send attempt
   * failed. Surfaced on the "Sent Links" tab so staff can see which links went
   * out and when.
   */
  @Column({ name: 'emailSentAt', type: 'timestamp', nullable: true })
  emailSentAt: Date | null;

  /**
   * When a send was last attempted (success or failure), so a failed attempt
   * leaves a trail even though emailSentAt stays null.
   */
  @Column({ name: 'emailLastAttemptAt', type: 'timestamp', nullable: true })
  emailLastAttemptAt: Date | null;

  /**
   * Short reason the last send failed (e.g. SMTP unavailable). Cleared on a
   * successful send. Drives the "Send failed" status on the Sent Links tab.
   */
  @Column({ name: 'emailLastError', type: 'varchar', length: 500, nullable: true })
  emailLastError: string | null;

  @Column({ name: 'submissionId', type: 'int', unsigned: true, nullable: true })
  submissionId: number | null;

  @Column({ name: 'createdByUserId', type: 'int', unsigned: true, nullable: true })
  createdByUserId: number | null;

  /**
   * A kiosk invitation is a permanent, reusable link for in-studio walk-ins:
   * it never expires and is not consumed on submit (each submission creates a
   * fresh queue entry). Access is gated by a PIN. One per location.
   */
  @Column({ name: 'isKiosk', type: 'tinyint', width: 1, default: 0 })
  isKiosk: boolean;

  /** Raw token for kiosk links so the front desk can always retrieve the URL (PIN-protected). */
  @Column({ name: 'kioskToken', type: 'varchar', length: 128, nullable: true })
  kioskToken: string | null;

  @Column({ name: 'pinHash', type: 'char', length: 64, nullable: true })
  pinHash: string | null;

  @Column({ name: 'cancelledAt', type: 'timestamp', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancelledByUserId', type: 'int', unsigned: true, nullable: true })
  cancelledByUserId: number | null;

  @CreateDateColumn({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @ManyToOne(() => Location)
  @JoinColumn({ name: 'locationId' })
  location: Location;

  @ManyToOne(() => DigitalEnrollmentSubmission, { nullable: true })
  @JoinColumn({ name: 'submissionId' })
  submission: DigitalEnrollmentSubmission | null;
}
