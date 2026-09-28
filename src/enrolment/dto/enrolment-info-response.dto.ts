import { Expose } from 'class-transformer';

export class EnrolmentRateDto {
  @Expose()
  fromDate: string;

  @Expose()
  toDate: string;

  @Expose()
  amount: string;
}

export class EnrolmentDiscountsDto {
  // For Private programs
  @Expose()
  pfDiscount?: string;

  @Expose()
  multipleEnrolDiscount?: string;

  // For Group programs
  @Expose()
  discount?: string;

  @Expose()
  discountType?: number; // 0 = percentage, 1 = dollar
}

export class EnrolmentInfoDto {
  @Expose()
  id: number;

  @Expose()
  programId: number;

  @Expose()
  studentId: number;

  @Expose()
  customerId: number;

  @Expose()
  program: string;

  @Expose()
  programType: string;

  @Expose()
  teacher: string;

  @Expose()
  rates: EnrolmentRateDto[];

  @Expose()
  discounts: EnrolmentDiscountsDto;

  @Expose()
  autoRenewal: string;

  @Expose()
  duration: string;

  @Expose()
  student: string;

  @Expose()
  customer: string;

  @Expose()
  online: string;

  /**
   * The September 2026 tier, or null when this enrolment is not on that
   * structure - which is every enrolment created before it.
   *
   * Exposed because until 2026-08-18 the tier existed only in the database and
   * on one report. Staff could choose one when creating an enrolment and then
   * had no way to see what they had chosen, which makes a mistake invisible
   * and a $60-a-month difference unauditable from the screen it was made on.
   */
  @Expose()
  pricingTier: number | null;

  /** True when nobody chose that tier - a digital enrolment quoted at tier 1. */
  @Expose()
  pricingTierIsDefaulted: boolean;

  /** True when the enrolment is deliberately held on the pre-September rate. */
  @Expose()
  keepsPreviousRate: boolean;

  /** Why it was held, in the words of whoever agreed it. */
  @Expose()
  previousRateReason: string | null;

  /**
   * A single phrase for the screen: `Tier 2`, `Previous rate`, or
   * `Not on September pricing`. Built here so two screens cannot disagree
   * about how to describe the same three states.
   */
  @Expose()
  pricingBasis: string;
}

export class EnrolmentInfoDataDto {
  @Expose()
  body: EnrolmentInfoDto;
}

export class EnrolmentInfoResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Enrolment Details retrieved successfully';

  @Expose()
  data: EnrolmentInfoDataDto;
}
