import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * What an existing enrolment should be priced from.
 *
 * Send a tier, or send `keepsPreviousRate`. Never both - they are opposite
 * answers to the same question and differ by $90 a month on a Standard
 * 60-minute enrolment, so the service refuses the pair rather than picking one.
 */
export class ChangePricingBasisRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3])
  pricingTier?: number;

  @IsOptional()
  @IsBoolean()
  keepsPreviousRate?: boolean;

  /**
   * Hourly rate explicitly confirmed by staff when the enrolment has no
   * pre-September course-rate period. It is refused when real history exists,
   * so this cannot override an enrolment's known previous rate.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  confirmedPreviousRate?: number;

  /**
   * Why this is changing.
   *
   * Required in both directions, unlike at creation where only a held rate
   * needs one. This endpoint moves money on an enrolment that already exists
   * and may already have been quoted to a parent, so "who changed this and on
   * what basis" has to be answerable without asking anyone.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string;

  /**
   * The day the new price starts applying, `YYYY-MM-DD`.
   *
   * Lessons on or after it take the new rate; lessons before it keep the one
   * they were on. Arcadia asked for this on 2026-09-02 - *"it would be
   * beneficial to have the ability to select a specific effective date when
   * changing pricing, for example new pricing effective December 1 or
   * August 1, 2027"* - having found that a change made on the 2nd moved a
   * lesson on the 3rd but not the 1st.
   *
   * Optional, and omitting it keeps exactly the behaviour that shipped: the
   * September cutover. That is deliberate, so an existing caller that does not
   * send it is unaffected.
   *
   * The floor is the September cutover itself. Before that date the tier
   * structure did not exist, so there is no tier price to apply and reaching
   * further back would only collide with periods already settled.
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'effectiveFrom must be a date in YYYY-MM-DD form',
  })
  effectiveFrom?: string;
}
