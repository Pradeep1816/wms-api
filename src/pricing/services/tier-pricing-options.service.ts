import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Program } from '../../program/entities/program.entity';
import { PricingCategoryEnum } from '../enums/pricing-category.enum';
import {
  PricingResolverService,
  type ResolvedPrice,
  type ResolvedPriceSource,
} from './pricing-resolver.service';
import { ProgramPresentationService } from './program-presentation.service';
import { PricingRolloutService } from './pricing-rollout.service';

/** The three tiers staff choose between. */
export const SELECTABLE_TIERS = [1, 2, 3];

export interface TierPriceOption {
  pricingTier: number;
  /** Written to `lesson.programRate`. */
  hourlyRate: string;
  /** What the customer pays each month - the figure staff should read. */
  monthlyAmount: string;
  /**
   * What the customer pays up front for the whole term.
   *
   * Equal to `monthlyAmount` on monthly billing. For 3, 6 and 12 months it is
   * the exact approved total from the client's schedule, which is deliberately
   * NOT the monthly figure times the term and NOT a percentage of it - three
   * months of standard 30-minute tier 2 is a printed $510.00 where 3% off
   * $175.00 x 3 gives $509.25.
   *
   * `null` only when the catalogue holds no approved total for the term. The
   * tier is still offered on its monthly price rather than being withdrawn,
   * because withdrawing it would leave staff unable to enrol at all.
   */
  termAmount: string | null;
  /**
   * How `termAmount` was arrived at, so the screen can say whether a figure is
   * an approved prepaid total or simply the monthly price multiplied up.
   */
  termAmountSource: ResolvedPriceSource | null;
}

export interface TierPricingOptions {
  /**
   * False when this program is not on the September structure, when it is a
   * marker-prefixed program holding an older sheet, or when the location is
   * not yet in the rollout. The caller keeps its existing behaviour and shows
   * no tier selector at all.
   */
  isTiered: boolean;
  /**
   * Why there are no tiers, so the screen can say something a staff member can
   * act on. Null when `isTiered` is true.
   *
   * Arcadia hit the need on 2026-09-02: Brampton West could not move Instrument
   * enrolments to Tier 2 and were told only that it was "not on the list",
   * which reads as a fault rather than as missing setup. The two cases want
   * opposite responses - one is permanent and correct, the other is a gap
   * somebody has to fill - so the caller has to be able to tell them apart.
   *
   * - `retired-program` - a marker-prefixed program holding an older sheet.
   *   Deliberate and permanent: it keeps the rate it already carries.
   * - `unclassified-program` - nobody has given it a pricing category yet.
   *   Fixable, and head office has to do it.
   * - `location-not-in-rollout` - the location is outside the pilot.
   */
  noTiersReason:
    | 'retired-program'
    | 'unclassified-program'
    | 'location-not-in-rollout'
    | null;
  /** The program's name, so a message can name it rather than say "this program". */
  programName: string | null;
  pricingCategory: PricingCategoryEnum | null;
  durationMinutes: number;
  effectiveDate: string;
  /** The term these options were quoted for. 1 for ordinary monthly billing. */
  termMonths: number;
  options: TierPriceOption[];
}

/**
 * The prices staff choose between when they set an enrolment's tier.
 *
 * Exists because a tier cannot be derived. Checked on 2026-08-11:
 * `qualification.rate` is the teacher's pay rate and spreads across 41 distinct
 * values from $1.00 to $100.00, with 113 of 326 teachers carrying none, so
 * nothing in the data implies a tier. It is a human judgement, and the only
 * useful thing the system can do is show what each choice costs.
 *
 * Hence `monthlyAmount` alongside the hourly rate: a tier step is $15.00 an
 * hour, which is $60 a month on a 60-minute weekly enrolment. Staff should be
 * choosing "$290 a month", not "1".
 *
 * Returns `isTiered: false` rather than throwing when the program is not on the
 * new structure. An unclassified program, or a lesson length the client never
 * priced, is an ordinary case here - the enrolment screen simply keeps the
 * manual rate field it has always had.
 */
@Injectable()
export class TierPricingOptionsService {
  constructor(
    @InjectRepository(Program)
    private readonly programRepository: Repository<Program>,
    private readonly pricingResolver: PricingResolverService,
    private readonly programPresentation: ProgramPresentationService,
    private readonly rollout: PricingRolloutService,
  ) {}

  async findForProgram(input: {
    locationId: number | null;
    programId: number;
    durationMinutes: number;
    /** `YYYY-MM-DD` - normally the enrolment start date. */
    effectiveDate: string;
    /**
     * Months paid for at once, from the enrolment's payment frequency.
     * Defaults to monthly, which is what every caller asked for before
     * prepaid terms reached this screen.
     */
    termMonths?: number;
  }): Promise<TierPricingOptions> {
    const termMonths = input.termMonths ?? 1;

    const empty: TierPricingOptions = {
      isTiered: false,
      noTiersReason: null,
      programName: null,
      pricingCategory: null,
      durationMinutes: input.durationMinutes,
      effectiveDate: input.effectiveDate,
      termMonths,
      options: [],
    };

    // The rollout gate first, so a location outside the pilot gets the same
    // answer as an unclassified program: no selector, and the screen keeps the
    // manual rate field it has always had.
    if (
      input.locationId !== null &&
      !(await this.rollout.isEnabledForLocation(input.locationId))
    ) {
      return { ...empty, noTiersReason: 'location-not-in-rollout' };
    }

    const program = await this.programRepository.findOne({
      where: { id: input.programId },
    });

    // `isTierable`, not `isClassified`. The 32 marker-prefixed programs are
    // classified but hold a frozen older sheet, so offering tiers on them
    // would quote September prices from the very programs that exist to keep
    // the previous ones.
    if (!program) {
      return empty;
    }

    // Two different answers, deliberately not merged. A marker-prefixed
    // program is meant to have no tiers and never will; an unclassified one is
    // waiting on somebody. Telling a location "not on the list" for both is
    // what sent Brampton West looking for a bug on 2026-09-02.
    if (!this.programPresentation.isTierable(program)) {
      return {
        ...empty,
        programName: program.name,
        noTiersReason: this.programPresentation.hasInternalMarker(program)
          ? 'retired-program'
          : 'unclassified-program',
      };
    }

    const pricingCategory =
      this.programPresentation.pricingCategoryFor(program);
    const options: TierPriceOption[] = [];

    for (const pricingTier of SELECTABLE_TIERS) {
      const request = {
        locationId: input.locationId,
        pricingCategory,
        pricingTier,
        durationMinutes: input.durationMinutes,
        effectiveDate: input.effectiveDate,
        programType: program.type,
      };

      let resolved: ResolvedPrice;
      let termIsPriced = true;

      try {
        resolved = await this.pricingResolver.resolve({
          ...request,
          termMonths,
        });
      } catch {
        // The resolver fails closed. A tier with no price for this duration or
        // date is simply not offered, rather than failing the whole screen.
        if (termMonths === 1) continue;

        // The tier itself may be perfectly priced and only the prepaid total
        // missing. Withdrawing the tier for that would leave staff unable to
        // enrol the student at all, so fall back to the monthly price and say
        // the term is unpriced rather than inventing a total for it.
        termIsPriced = false;
        try {
          resolved = await this.pricingResolver.resolve({
            ...request,
            termMonths: 1,
          });
        } catch {
          continue;
        }
      }

      options.push({
        pricingTier,
        hourlyRate: resolved.hourlyRate,
        monthlyAmount: resolved.monthlyAmount,
        termAmount: termIsPriced ? resolved.termAmount : null,
        termAmountSource: termIsPriced ? resolved.source : null,
      });
    }

    // All three tiers share one catalogue row shape, so a partial answer means
    // the catalogue is incomplete. Offering two of three tiers would let staff
    // pick a price that exists while a colleague cannot, so offer none.
    if (options.length !== SELECTABLE_TIERS.length) {
      return empty;
    }

    return {
      isTiered: true,
      noTiersReason: null,
      programName: program.name,
      pricingCategory,
      durationMinutes: input.durationMinutes,
      effectiveDate: input.effectiveDate,
      termMonths,
      options,
    };
  }
}
