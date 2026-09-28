import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  OneToOne,
  OneToMany,
} from 'typeorm';
import { Course } from '../../course/entities/course.entity';
import { Student } from '../../student/entities/student.entity';
import { InvoiceItemEnrolment } from '../../invoice/entities/invoice-item-enrolment.entity';
import { PaymentFrequency } from '../../payment/entities/payment-frequency.entity';
import { PaymentCycle } from '../../payment/entities/payment-cycle.entity';
import { CustomerRecurringPaymentEnrolment } from '../../recurring-payment/entities/customer-recurring-payment-enrolment.entity';
import { EnrolmentDiscount } from './enrolment-discount.entity';

@Entity('enrolment')
export class Enrolment {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'courseId', type: 'int', unsigned: true })
  @Index()
  courseId: number;

  @Column({ name: 'studentId', type: 'int', unsigned: true })
  @Index()
  studentId: number;

  @Column({ name: 'isDeleted', type: 'tinyint', width: 1 })
  @Index('IDX_enrolment_is_deleted')
  isDeleted: boolean;

  @Column({
    name: 'endDateTime',
    type: 'datetime',
    default: () => "'0000-00-00 00:00:00'",
  })
  endDateTime: Date;

  @Column({
    name: 'paymentFrequencyId',
    type: 'tinyint',
    unsigned: true,
    comment: '1 - Full, 2 - Monthly',
  })
  @Index()
  paymentFrequencyId: number;

  @Column({
    name: 'isConfirmed',
    type: 'tinyint',
    unsigned: true,
    comment: '0 - unConfirmed, 1 - confirmed',
  })
  isConfirmed: number;

  @Column({ name: 'isAutoRenew', type: 'int' })
  isAutoRenew: number;

  @Column({ name: 'is_online', type: 'tinyint', default: 0 })
  isOnline: number;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamp', nullable: true })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', type: 'timestamp', nullable: true })
  updatedAt: Date;

  @Column({ name: 'createdByUserId', type: 'int' })
  createdByUserId: number;

  @Column({ name: 'updatedByUserId', type: 'int' })
  updatedByUserId: number;

  @Column({ name: 'isEnableInfo', type: 'tinyint', width: 1, nullable: true })
  isEnableInfo: boolean;

  /**
   * Internal pricing tier, 1 to 3.
   *
   * Anchored here rather than on the program: this is the superset of the
   * options the client might confirm, since a teacher-anchored or
   * program-anchored rule can still populate this column. Read it only through
   * `TierResolverService`, never directly, so the anchor stays switchable in
   * one place.
   *
   * NULL means the enrolment is not on the September 2026 structure, which is
   * every enrolment created before it, permanently. The automated conversion
   * of existing enrolments was paused by Arcadia on 2026-08-14, so nothing
   * sets this on an existing row.
   */
  @Column({
    name: 'pricingTier',
    type: 'tinyint',
    unsigned: true,
    nullable: true,
  })
  pricingTier: number | null;

  /**
   * True when the tier was filled in rather than chosen by a person - a
   * digital-enrolment submission quoted at tier 1 before staff confirm it, or
   * a pre-filled default if Arcadia asks for one instead of a required field.
   *
   * Tier 1 is the cheapest price in each category, so an unreviewed default
   * quietly under-charges. This flag is what puts the enrolment on a location's
   * review report instead of letting it disappear into the population.
   */
  @Column({
    name: 'pricingTierIsDefaulted',
    type: 'tinyint',
    width: 1,
    default: 0,
  })
  pricingTierIsDefaulted: boolean;

  /**
   * True when this enrolment was deliberately left on the rate that was in
   * force before September 2026, rather than being put on a tier.
   *
   * Arcadia approved grandfathering on 2026-08-18: a student who commits
   * before September may keep the previous rate. This is how that is recorded.
   *
   * ## Why a flag and not a discount
   *
   * Ashif proposed entering the enrolment at the new rate and applying a
   * manual discount to bring it back down. That was tried on 2026-08-11 and
   * abandoned - see `0c48e173`. Three reasons it cannot work, all still true:
   *
   *  1. **Prepaid.** The published previous totals are not derivable from any
   *     percentage. Vocal 45-minute over three months is a printed $633.00
   *     where the percentage gives $632.93. No monthly discount reproduces
   *     three, six and twelve month totals that were never computed.
   *  2. **Collision.** The only enrolment-level dollar field is the multiple
   *     enrolment discount, and `enrolment_discount` holds one row per type
   *     per enrolment. 191 active enrolments at the two pilot locations
   *     already carry a real sibling discount and could not hold both.
   *  3. **Invisibility.** A discounted enrolment counts as "on new pricing",
   *     so nobody could answer who is grandfathered.
   *
   * This flag has none of those problems, because it does not adjust a price -
   * it declines to apply the new one. The enrolment keeps `program.rate`
   * exactly as every enrolment did before tiering existed, so the monthly
   * figure, the prepaid cycle and the sibling discount all behave as they do
   * today. There is no new money path to get wrong.
   *
   * Deliberately not an absence. An untiered enrolment at a pilot location
   * could only ever be this - `assertTierSuppliedIfRequired` rejects the
   * accidental case - but relying on that would mean reading an intention out
   * of a NULL. Recorded explicitly so the report can name it and the audit
   * columns below can say who agreed to it.
   */
  @Column({
    name: 'keepsPreviousRate',
    type: 'tinyint',
    width: 1,
    default: 0,
  })
  keepsPreviousRate: boolean;

  /** Why the previous rate was kept, in the words of whoever agreed it. */
  @Column({
    name: 'previousRateReason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  previousRateReason: string | null;

  /**
   * Who agreed it. A rate concession outlives the person who granted it, so
   * "the school says they were promised the old price" needs an answer.
   */
  @Column({
    name: 'previousRateApprovedByUserId',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  previousRateApprovedByUserId: number | null;

  @Column({
    name: 'previousRateApprovedOn',
    type: 'datetime',
    nullable: true,
  })
  previousRateApprovedOn: Date | null;

  /**
   * The hourly previous rate confirmed by staff when this enrolment has no
   * pre-September course-rate period.
   */
  @Column({
    name: 'confirmedPreviousRate',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  confirmedPreviousRate: number | null;

  @Column({
    name: 'isEnableRescheduleInfo',
    type: 'tinyint',
    width: 1,
    nullable: true,
  })
  isEnableRescheduleInfo: boolean;

  // Relations
  @ManyToOne(() => Course, (course) => course.enrolments)
  @JoinColumn({ name: 'courseId' })
  course: Course;

  @ManyToOne(() => Student, (student) => student.enrolments)
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @OneToOne(
    () => InvoiceItemEnrolment,
    (invoiceItemEnrolment) => invoiceItemEnrolment.enrolment,
  )
  invoiceItemEnrolment: InvoiceItemEnrolment;

  @ManyToOne(() => PaymentFrequency, { eager: false })
  @JoinColumn({ name: 'paymentFrequencyId' })
  paymentFrequency: PaymentFrequency;

  @OneToMany(
    () => CustomerRecurringPaymentEnrolment,
    (crpEnrol) => crpEnrol.enrolment,
  )
  customerRecurringPaymentEnrolments: CustomerRecurringPaymentEnrolment[];

  @OneToMany(() => EnrolmentDiscount, (discount) => discount.enrolment)
  discounts: EnrolmentDiscount[];

  @OneToMany(() => PaymentCycle, (paymentCycle) => paymentCycle.enrolment)
  paymentCycles: PaymentCycle[];
}
