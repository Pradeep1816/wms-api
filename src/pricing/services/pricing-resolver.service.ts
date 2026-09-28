import { Injectable } from '@nestjs/common';
import { TuitionPriceRepository } from '../repositories/tuition-price.repository';
import { TuitionPrice } from '../entities/tuition-price.entity';
import { PricingCategoryEnum } from '../enums/pricing-category.enum';
import { ProgramTypeEnum } from '../../program/enums/program-type';
import {
  PricingResolutionError,
  PricingResolutionErrorCode,
} from '../errors/pricing-resolution.error';
import { multiplyAmount, normaliseAmount } from '../utils/decimal-money';

/** Terms the client priced explicitly. Anything else is monthly times N. */
export const APPROVED_PREPAID_TERMS = [3, 6, 12];

export const SUPPORTED_DURATIONS = [30, 45, 60];

/**
 * Widened to `number` deliberately: `program.type` arrives from the database as
 * a plain integer, so comparing it against the enum member directly is an
 * unsafe cross-type comparison.
 */
const PRIVATE_PROGRAM_TYPE: number = ProgramTypeEnum.PRIVATE_PROGRAM;

export interface ResolvePriceInput {
  /** `null` resolves against the global catalogue only. */
  locationId: number | null;
  pricingCategory: PricingCategoryEnum;
  pricingTier: number;
  durationMinutes: number;
  /** 1 for ordinary monthly billing; 3, 6 or 12 for an approved prepaid term. */
  termMonths: number;
  /** `YYYY-MM-DD`, or a Date which is read in UTC. */
  effectiveDate: string | Date;
  /** Guard: only private programs are in the September 2026 structure. */
  programType?: number;
  /**
   * Which sheet to read. Defaults to the September structure; grandfathered
   * enrolments read the legacy sheet, which they keep after the cutover.
   */
  priceBook?: string;
}

export type ResolvedPriceSource =
  /** Ordinary monthly billing straight from the catalogue. */
  | 'catalogue_monthly'
  /** An exact approved 3, 6 or 12 month total. */
  | 'catalogue_prepaid'
  /** A term the client did not price: monthly times N, no reduction. */
  | 'catalogue_monthly_multiple';

export interface ResolvedPrice {
  pricingCategory: PricingCategoryEnum;
  pricingTier: number;
  durationMinutes: number;
  termMonths: number;
  /** Exact approved monthly tuition. */
  monthlyAmount: string;
  /** What is actually charged for the requested term. */
  termAmount: string;
  /** Hourly value written to `lesson.programRate`. */
  hourlyRate: string;
  source: ResolvedPriceSource;
  effectiveFrom: string;
  effectiveTo: string | null;
  tuitionPriceId: number;
  tuitionPrepaidPriceId: number | null;
  /** True when the row came from a location override rather than the global catalogue. */
  isLocationOverride: boolean;
}

/**
 * The single backend authority for September 2026 tuition.
 *
 * Enrolment creation and preview, payment cycles, recurring payments, lesson
 * generation, invoice preview and digital enrolment must all resolve through
 * this service or through a snapshot it produced. Any path that calculates its
 * own price will eventually disagree with the invoice.
 *
 * Grandfathering is deliberately absent here. The client decided on 2026-08-04
 * that a grandfathered rate is a manual, removable recurring discount, so it
 * belongs in the discount cascade, not in the base price lookup. This resolver
 * returns the catalogue price; the cascade then reduces it.
 */
@Injectable()
export class PricingResolverService {
  constructor(
    private readonly tuitionPriceRepository: TuitionPriceRepository,
  ) {}

  async resolve(input: ResolvePriceInput): Promise<ResolvedPrice> {
    const effectiveDate = this.normaliseDate(input.effectiveDate);
    this.assertSupportedInput(input);

    const candidates =
      await this.tuitionPriceRepository.findEffectiveCandidates({
        priceBook: input.priceBook,
        locationId: input.locationId,
        pricingCategory: input.pricingCategory,
        pricingTier: input.pricingTier,
        durationMinutes: input.durationMinutes,
        effectiveDate,
      });

    const price = this.selectSingleRow(candidates, input, effectiveDate);
    const monthlyAmount = normaliseAmount(price.monthlyAmount);
    const hourlyRate = normaliseAmount(price.hourlyRate);

    const { termAmount, source, tuitionPrepaidPriceId } =
      await this.resolveTermAmount(price, monthlyAmount, input.termMonths);

    return {
      pricingCategory: input.pricingCategory,
      pricingTier: input.pricingTier,
      durationMinutes: input.durationMinutes,
      termMonths: input.termMonths,
      monthlyAmount,
      termAmount,
      hourlyRate,
      source,
      effectiveFrom: this.formatDate(price.effectiveFrom),
      effectiveTo: price.effectiveTo
        ? this.formatDate(price.effectiveTo)
        : null,
      tuitionPriceId: price.id,
      tuitionPrepaidPriceId,
      isLocationOverride: price.locationId !== null,
    };
  }

  /**
   * Location rows beat global rows; ambiguity at either scope is an error.
   *
   * Never take the first of several candidates. Two rows covering the same date
   * means the catalogue is wrong, and picking one silently produces a plausible
   * price that nobody can explain later.
   */
  private selectSingleRow(
    candidates: TuitionPrice[],
    input: ResolvePriceInput,
    effectiveDate: string,
  ): TuitionPrice {
    const context = {
      locationId: input.locationId,
      pricingCategory: input.pricingCategory,
      pricingTier: input.pricingTier,
      durationMinutes: input.durationMinutes,
      effectiveDate,
    };

    const locationRows = candidates.filter((row) => row.locationId !== null);
    const globalRows = candidates.filter((row) => row.locationId === null);
    const scoped = locationRows.length > 0 ? locationRows : globalRows;

    if (scoped.length === 0) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.NO_MATCHING_PRICE,
        'No effective tuition price covers this combination on this date',
        context,
      );
    }

    if (scoped.length > 1) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.AMBIGUOUS_PRICE,
        `${scoped.length} effective tuition prices overlap for this combination on this date`,
        { ...context, tuitionPriceIds: scoped.map((row) => row.id) },
      );
    }

    return scoped[0];
  }

  private async resolveTermAmount(
    price: TuitionPrice,
    monthlyAmount: string,
    termMonths: number,
  ): Promise<{
    termAmount: string;
    source: ResolvedPriceSource;
    tuitionPrepaidPriceId: number | null;
  }> {
    if (termMonths === 1) {
      return {
        termAmount: monthlyAmount,
        source: 'catalogue_monthly',
        tuitionPrepaidPriceId: null,
      };
    }

    if (APPROVED_PREPAID_TERMS.includes(termMonths)) {
      const prepaid = await this.tuitionPriceRepository.findPrepaidPrice(
        price.id,
        termMonths,
      );

      if (!prepaid) {
        throw new PricingResolutionError(
          PricingResolutionErrorCode.MISSING_PREPAID_PRICE,
          `No approved ${termMonths}-month total is configured for this price`,
          { tuitionPriceId: price.id, termMonths },
        );
      }

      // The stored figure is returned verbatim. It is an approved total, not a
      // percentage applied to the monthly amount, and the two deliberately
      // differ - three months of the 30-minute tier 2 price is 510.00, where
      // 3% of 175.00 x 3 would give 509.25.
      return {
        termAmount: normaliseAmount(prepaid.amount),
        source: 'catalogue_prepaid',
        tuitionPrepaidPriceId: prepaid.id,
      };
    }

    // Terms the client did not price - bi-monthly, four and five months are the
    // ones in live use. Charge the monthly amount times the term with no
    // reduction, since reductions were defined for three, six and twelve only.
    // Nobody pays more than they would on monthly billing.
    return {
      termAmount: multiplyAmount(monthlyAmount, termMonths),
      source: 'catalogue_monthly_multiple',
      tuitionPrepaidPriceId: null,
    };
  }

  private assertSupportedInput(input: ResolvePriceInput): void {
    if (
      input.programType !== undefined &&
      input.programType !== PRIVATE_PROGRAM_TYPE
    ) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.UNSUPPORTED_PROGRAM_TYPE,
        'The September 2026 tuition structure covers private programs only',
        { programType: input.programType },
      );
    }

    if (!SUPPORTED_DURATIONS.includes(input.durationMinutes)) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.INVALID_INPUT,
        `Duration ${input.durationMinutes} minutes is not part of the tuition structure`,
        { durationMinutes: input.durationMinutes },
      );
    }

    if (!Number.isSafeInteger(input.termMonths) || input.termMonths < 1) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.INVALID_INPUT,
        `Term ${input.termMonths} is not a whole number of months`,
        { termMonths: input.termMonths },
      );
    }
  }

  /** Dates are handled as `YYYY-MM-DD` so no timezone can move the cutover. */
  private normaliseDate(value: string | Date): string {
    if (typeof value === 'string') {
      if (!/^\d{4}-\d{2}-\d{2}/.test(value)) {
        throw new PricingResolutionError(
          PricingResolutionErrorCode.INVALID_INPUT,
          `Effective date "${value}" is not in YYYY-MM-DD form`,
          { effectiveDate: value },
        );
      }
      return value.slice(0, 10);
    }

    return this.formatDate(value);
  }

  private formatDate(value: Date | string): string {
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }
    return value.toISOString().slice(0, 10);
  }
}
