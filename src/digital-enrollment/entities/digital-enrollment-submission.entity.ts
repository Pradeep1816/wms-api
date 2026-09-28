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

export enum DigitalEnrollmentSubmissionStatus {
  SUBMITTED = 'submitted',
  REVIEWING = 'reviewing',
  CONVERTED = 'converted',
  REJECTED = 'rejected',
}

export enum DigitalEnrollmentPaymentMethod {
  // PRE_AUTHORIZED_PAYMENT = `pre_authorized`,
  E_TRANSFER = 'e-transfer',
  CASH = 'cash',
  CHEQUE = 'cheque',
  DEBIT = 'debit',
  VISA = 'visa',
  MC = "mc",
  PAD = 'pad',
}

export enum DigitalEnrollmentSubmissionSource {
  /** Submitted from an emailed one-time invitation link. */
  INVITATION = 'invitation',
  /** Submitted in-studio from the permanent kiosk link. */
  KIOSK = 'kiosk',
}

@Entity('digital_enrollment_submission')
export class DigitalEnrollmentSubmission {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ name: 'locationId', type: 'int', unsigned: true })
  @Index('IDX_digital_enrollment_submission_location_id')
  locationId: number;

  @Column({ name: 'locationSlug', type: 'varchar', length: 30 })
  @Index('IDX_digital_enrollment_submission_location_slug')
  locationSlug: string;

  @Column({ name: 'token', type: 'varchar', length: 128 })
  @Index('IDX_digital_enrollment_submission_token')
  token: string;

  /**
   * Unique, unguessable token for the public enrolment-package PDF link. Unlike
   * `token` (which for a kiosk submission is the shared, persistent kiosk token),
   * this is per-submission, so the package link identifies exactly one enrolment
   * — never another family's. Nullable for rows created before this existed;
   * generated on first use.
   */
  @Column({ name: 'packageToken', type: 'varchar', length: 128, nullable: true })
  @Index('IDX_digital_enrollment_submission_package_token', { unique: true })
  packageToken: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: DigitalEnrollmentSubmissionStatus,
    default: DigitalEnrollmentSubmissionStatus.SUBMITTED,
  })
  status: DigitalEnrollmentSubmissionStatus;

  /**
   * Where the submission came from: an emailed invitation link or the in-studio
   * kiosk. Nullable for pre-existing rows (treated as invitation on read).
   */
  @Column({
    name: 'submissionSource',
    type: 'varchar',
    length: 20,
    nullable: true,
    default: DigitalEnrollmentSubmissionSource.INVITATION,
  })
  submissionSource: string | null;

  @Column({ name: 'studentData', type: 'simple-json' })
  studentData: Record<string, unknown>;

  @Column({ name: 'guardianData', type: 'simple-json' })
  guardianData: Record<string, unknown>;

  @Column({ name: 'programPreferenceData', type: 'simple-json' })
  programPreferenceData: Record<string, unknown>;

  @Column({ name: 'schedulePreferenceData', type: 'simple-json' })
  schedulePreferenceData: Record<string, unknown>;

  @Column({ name: 'feeSnapshotData', type: 'simple-json' })
  feeSnapshotData: Record<string, unknown>;

  /**
   * Free-text lesson preferences captured from the parent/guardian on the public
   * form (instruments, preferred days/times, rental, notes). Informational only —
   * the real schedule is still set by staff. Nullable for pre-existing rows.
   */
  @Column({ name: 'parentPreferenceData', type: 'simple-json', nullable: true })
  parentPreferenceData: Record<string, unknown> | null;

  /**
   * Extra students enrolled by the same family on one form. Each entry carries
   * the student's basics plus their own instrument/lesson preferences. The
   * primary student stays in studentData; the shared customer/guardian is in
   * guardianData. Nullable/empty for single-student submissions. Staff create a
   * separate student + enrolment record for each.
   */
  @Column({ name: 'additionalStudentsData', type: 'simple-json', nullable: true })
  additionalStudentsData: Array<Record<string, unknown>> | null;

  /**
   * Point-in-time copy of the primary student's enrolment package (fees,
   * schedule, discounts, lesson count) captured when the enrolment is first
   * attached. The detail page / PDF / email prefer this snapshot over a live
   * rebuild so later enrolment/discount edits don't rewrite history. Null until
   * an enrolment is created/linked (and for pre-existing rows → rebuilt live).
   */
  @Column({ name: 'enrollmentPackageSnapshot', type: 'simple-json', nullable: true })
  enrollmentPackageSnapshot: Record<string, unknown> | null;

  @Column({ name: 'policyAcknowledgementData', type: 'simple-json' })
  policyAcknowledgementData: Record<string, unknown>;

  /** Point-in-time copy of the enrolment policy the customer agreed to. */
  @Column({ name: 'policySnapshot', type: 'longtext', nullable: true })
  policySnapshot: string | null;

  @Column({ name: 'signaturePrintedName', type: 'varchar', length: 255 })
  signaturePrintedName: string;

  @Column({ name: 'signatureSignedDate', type: 'date' })
  signatureSignedDate: string;

  @Column({ name: 'signatureDataUrl', type: 'longtext' })
  signatureDataUrl: string;

  @Column({ name: 'submittedIpAddress', type: 'varchar', length: 64, nullable: true })
  submittedIpAddress: string | null;

  @Column({ name: 'submittedUserAgent', type: 'varchar', length: 512, nullable: true })
  submittedUserAgent: string | null;

  @Column({ name: 'submittedAt', type: 'timestamp' })
  submittedAt: Date;

  @Column({ name: 'reviewedAt', type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'linkedCustomerId', type: 'int', unsigned: true, nullable: true })
  linkedCustomerId: number | null;

  @Column({ name: 'linkedStudentId', type: 'int', unsigned: true, nullable: true })
  linkedStudentId: number | null;

  @Column({ name: 'linkedEnrolmentId', type: 'int', unsigned: true, nullable: true })
  linkedEnrolmentId: number | null;

  @Column({ name: 'linkedCourseId', type: 'int', unsigned: true, nullable: true })
  linkedCourseId: number | null;

  @Column({ name: 'convertedAt', type: 'timestamp', nullable: true })
  convertedAt: Date | null;

  @Column({ name: 'completionNote', type: 'text', nullable: true })
  completionNote: string | null;

  /**
   * Payment method the front desk selected for the enrolment package. Left
   * unset ("Not selected") until staff choose one, so nothing about payment is
   * presented — no method, no amount — until a human confirms it.
   */
  @Column({
    name: 'paymentMethod',
    type: 'varchar',
    length: 20,
    nullable: true,
    default: null,
  })
  paymentMethod: string | null;

  /**
   * Staff-entered payment figures for this enrolment. Nothing is auto-calculated
   * any more (the old placeholder produced wrong e-transfer / total amounts), so
   * the front desk types the real amounts here and they flow to the email and
   * the enrolment-form PDF. Each key is optional; a missing/blank value renders
   * blank. Independent of paymentMethod — the amounts apply to any method.
   * Keys: amount (the "pay now" / e-transfer figure, shown in the email),
   * lessonPaymentFee, rentalFee, booksFee, totalFeePayable (shown on the PDF).
   */
  @Column({ name: 'paymentAmounts', type: 'simple-json', nullable: true })
  paymentAmounts: Record<string, string> | null;

  /**
   * Soft-delete for erroneous / trial / rejected submissions. A voided record
   * stays on file (never hard-deleted) but is hidden from the default queue.
   */
  @Column({ name: 'voidedAt', type: 'timestamp', nullable: true })
  voidedAt: Date | null;

  @Column({ name: 'voidReason', type: 'varchar', length: 500, nullable: true })
  voidReason: string | null;

  @Column({ name: 'voidedByUserId', type: 'int', unsigned: true, nullable: true })
  voidedByUserId: number | null;

  @CreateDateColumn({ name: 'createdOn', type: 'timestamp', nullable: true })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updatedOn', type: 'timestamp', nullable: true })
  updatedOn: Date;

  @ManyToOne(() => Location)
  @JoinColumn({ name: 'locationId' })
  location: Location;
}
