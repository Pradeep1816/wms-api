import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { IsDateString } from 'class-validator';

/**
 * Turns the query-string forms of a boolean into a real one.
 *
 * `?onNewPricing=false` arrives as the string `"false"`, which is truthy. Left
 * to `@IsBoolean` alone the filter would silently invert - the one failure mode
 * that looks like working software, because a list still comes back.
 */
const toOptionalBoolean = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no'].includes(normalized)) {
    return false;
  }

  // Anything else is left alone so validation rejects it rather than guessing.
  return value;
};

export class PricingAdoptionRequestDto {
  /**
   * The day "active" is measured against. Defaults to today in Eastern time,
   * set by the controller - a report that quietly used the server's own day
   * would disagree with every other report in the system.
   */
  @IsOptional()
  @IsDateString()
  asOf?: string;
}

export class PricingAdoptionListRequestDto extends PricingAdoptionRequestDto {
  /** True for the new pricing, false for the old, omitted for both. */
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  onNewPricing?: boolean;

  /** Only enrolments whose tier was defaulted rather than chosen. */
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  defaultedOnly?: boolean;

  /**
   * Only enrolments deliberately held on the pre-September rate.
   *
   * Separate from `onNewPricing: false`, which also returns every enrolment
   * that simply predates the rollout - a location reviewing the concessions it
   * has granted wants the handful, not the hundreds.
   */
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  previousRateOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // Capped because a location can hold thousands of active enrolments and this
  // is a screen, not an export.
  @Max(200)
  limit?: number;
}
