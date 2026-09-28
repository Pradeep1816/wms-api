import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO used to create a new private enrolment for a student.
 * This is intentionally flat and mirrors the data collected by the
 * NewEnrolment wizard on the frontend.
 */
export class CreateStudentEnrolmentDto {
  // Basic financial details

  @Type(() => Number)
  @IsInt()
  @Min(1)
  programId: number;

  @Type(() => Number)
  @IsNumber()
  programRate: number; // Rate per hour

  /**
   * Lesson duration in "HH:mm" format (e.g. "00:30").
   */
  @IsString()
  duration: string;

  /**
   * Payment frequency name, e.g. "Monthly".
   * Will be resolved to PaymentFrequency.id on the backend.
   */
  @IsString()
  paymentFrequency: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  paymentFrequencyDiscount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  multipleEnrolDiscount?: number;

  /**
   * Discounted rate per month (already calculated in UI with all discounts applied).
   * Used to calculate per lesson price = discountedRatePerMonth / 4
   */
  @Type(() => Number)
  @IsNumber()
  discountedRatePerMonth: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  lessonsCount: number;

  @Type(() => Boolean)
  @IsBoolean()
  autoRenew: boolean;

  // Dates and delivery mode

  /**
   * Enrolment start date in "YYYY-MM-DD" format.
   */
  @IsDateString()
  startDate: string;

  /**
   * Payment cycle effective date in "YYYY-MM-DD" format.
   * Currently accepted for parity with legacy wizard.
   */
  @IsDateString()
  paymentCycleEffectiveDate: string;

  @Type(() => Boolean)
  @IsBoolean()
  isOnline: boolean;

  // Teacher and schedule details

  @Type(() => Number)
  @IsInt()
  @Min(1)
  teacherId: number;

  /**
   * Day name, e.g. "Monday".
   */
  @IsString()
  day: string;

  /**
   * Lesson start time in "HH:mm" format (24-hour).
   */
  @IsString()
  startTime: string;

  /**
   * Which of the three September 2026 price tiers this enrolment is on.
   *
   * Optional because a program outside the new structure has no tier, and
   * because an enrolment created before the cutover keeps its own rate. When it
   * is sent it is treated as a **deliberate human choice**, not a default -
   * `pricingTierIsDefaulted` is left false and the selection is recorded in
   * `enrolment_tier_change`.
   *
   * A tier is never derived. Checked on 2026-08-11: nothing in the data implies
   * one, so the only correct source is the person creating the enrolment.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3])
  pricingTier?: number;

  /**
   * True when the tier above was filled in rather than chosen by a person.
   *
   * Set only by digital enrolment, which quotes at tier 1 because a parent is
   * never asked about tiers (D6). The enrolment is created so the parent is
   * not blocked, and the flag is what puts it on the location's review report
   * for staff to confirm the real tier - the alternative being tier 1 pricing
   * disappearing quietly into the population, which under-charges.
   */
  @IsOptional()
  @IsBoolean()
  pricingTierIsDefaulted?: boolean;

  /**
   * Keep this enrolment on the rate that applied before September 2026.
   *
   * Arcadia approved grandfathering on 2026-08-18 for students who commit
   * before September. Sending this instead of a tier is what records that
   * decision: the enrolment keeps `program.rate` and no September catalogue
   * rate is resolved for it, which is precisely how every enrolment behaved
   * before tiering existed.
   *
   * Mutually exclusive with `pricingTier`. Sending both is a contradiction -
   * a tier *is* the new pricing - and is rejected rather than silently
   * resolved in either direction.
   */
  @IsOptional()
  @IsBoolean()
  keepsPreviousRate?: boolean;

  /**
   * Why the previous rate was kept.
   *
   * Required alongside `keepsPreviousRate`, because in a year the only useful
   * question is "who agreed this and on what basis", and a blank reason cannot
   * answer it.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  previousRateReason?: string;
}


