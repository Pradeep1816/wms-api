import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Program } from '../../program/entities/program.entity';
import { PricingResolverService } from './pricing-resolver.service';
import { ProgramPresentationService } from './program-presentation.service';
import { PricingRolloutService } from './pricing-rollout.service';
import { DEFAULT_PRICING_TIER } from './enrolment-tier.service';

export interface CatalogueRateInput {
  locationId: number;
  programId: number;
  /** `HH:mm` or `HH:mm:ss`. */
  duration: string;
  /** `YYYY-MM-DD`. Prices are effective-dated. */
  effectiveDate: string;
  pricingTier?: number | null;
  keepsPreviousRate?: boolean | null;
}

/**
 * The hourly rate an enrolment should be on, or `null` for "not ours".
 *
 * ## Why this is a service and not a helper on each caller
 *
 * Every path that creates or extends lessons has to answer the same question,
 * and each gate below is a rule someone had to discover. Written out per caller,
 * they drift: `enrolment-payment-frequency` was written in April, before tiers
 * existed, and priced its extension lessons from `program.rate`. A tier 1
 * enrolment that had its payment frequency edited silently reverted to the
 * pre-September rate - $32.50 a lesson against the $36.25 it was sold at - for
 * every lesson the extension created.
 *
 * This project has already been bitten by the same money rule living in ten
 * places. One implementation, and callers decide only what to do with `null`.
 *
 * ## Returning null rather than throwing
 *
 * `null` means "the catalogue has no opinion here" and the caller keeps whatever
 * it would have used before this existed. That is the safe direction for every
 * current caller: a location outside the pilot, a program holding an older
 * sheet, or a duration nobody priced all keep working exactly as they did.
 */
@Injectable()
export class EnrolmentCatalogueRateService {
  constructor(
    @InjectRepository(Program)
    private readonly programRepository: Repository<Program>,
    private readonly rollout: PricingRolloutService,
    private readonly programPresentation: ProgramPresentationService,
    private readonly pricingResolver: PricingResolverService,
  ) {}

  async hourlyRateFor(input: CatalogueRateInput): Promise<number | null> {
    // Grandfathering. A held enrolment keeps the rate it already has, and must
    // not be handed a September price - least of all the cheapest tier, which
    // is what the tier fallback below would give it.
    if (input.keepsPreviousRate) {
      return null;
    }

    // The rollout gate. Outside the pilot there is no catalogue rate at all.
    if (!(await this.rollout.isEnabledForLocation(input.locationId))) {
      return null;
    }

    const program = await this.programRepository.findOne({
      where: { id: input.programId },
    });

    // `isTierable`, not `isClassified` - a marker-prefixed program holds a
    // frozen older sheet and keeps the rate it already carries.
    if (!program || !this.programPresentation.isTierable(program)) {
      return null;
    }

    const [hoursRaw = '0', minutesRaw = '0'] = input.duration.split(':');
    const durationMinutes =
      (Number(hoursRaw) || 0) * 60 + (Number(minutesRaw) || 0);

    try {
      const resolved = await this.pricingResolver.resolve({
        locationId: input.locationId,
        pricingCategory: this.programPresentation.pricingCategoryFor(program),
        // Falls back to tier 1 only when the caller has none. That is the
        // cheapest price, so a missing tier under-charges rather than billing
        // someone more than they were quoted.
        pricingTier: input.pricingTier ?? DEFAULT_PRICING_TIER,
        durationMinutes,
        termMonths: 1,
        effectiveDate: input.effectiveDate,
        programType: program.type,
      });

      return Number(resolved.hourlyRate);
    } catch {
      // The resolver fails closed by design. Here that means "no catalogue
      // answer", which is a fallback rather than an error.
      return null;
    }
  }
}
