import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export class TierPricingOptionsRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  programId: number;

  /** 30, 45 or 60 in the September structure; anything else simply has no tiers. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMinutes: number;

  /**
   * The enrolment start date, `YYYY-MM-DD`. Prices are effective-dated, so an
   * August start legitimately has no tiers and the caller keeps its own rate.
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'effectiveDate must be YYYY-MM-DD',
  })
  effectiveDate?: string;

  /**
   * How many months the customer pays for at once, from the enrolment's
   * payment frequency. 1 for ordinary monthly billing.
   *
   * Present so the selector can quote what a prepaid enrolment actually costs.
   * Ashif reported on 2026-08-24 that changing the payment frequency left the
   * monthly figure on screen, because until then this endpoint had no term at
   * all and the service asked the resolver for one month every time.
   *
   * Capped at 12 to match `payment_frequency`, whose twelve rows are the only
   * frequencies an enrolment can hold.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  termMonths?: number;
}
