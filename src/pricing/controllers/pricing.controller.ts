import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { TierPricingOptionsService } from '../services/tier-pricing-options.service';
import { TierPricingOptionsRequestDto } from '../dto/tier-pricing-options-request.dto';
import {
  PricingAdoptionListRequestDto,
  PricingAdoptionRequestDto,
} from '../dto/pricing-adoption-request.dto';
import { PricingAdoptionService } from '../services/pricing-adoption.service';
import { getCurrentESTDate } from '../../utils/date-utils';
import { EnrolmentPricingBasisService } from '../services/enrolment-pricing-basis.service';
import { ChangePricingBasisRequestDto } from '../dto/change-pricing-basis-request.dto';
import { PricingResolutionError } from '../errors/pricing-resolution.error';
import { EnrolmentTierService } from '../services/enrolment-tier.service';

@Controller('admin/v2/:location/pricing')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class PricingController {
  constructor(
    private readonly tierPricingOptions: TierPricingOptionsService,
    private readonly adoption: PricingAdoptionService,
    private readonly pricingBasis: EnrolmentPricingBasisService,
    private readonly enrolmentTier: EnrolmentTierService,
  ) {}

  /**
   * Change what an existing enrolment is priced from.
   *
   * `POST /admin/v2/:location/pricing/enrolments/:id/basis`
   *
   * Send `pricingTier`, or `keepsPreviousRate`, never both. A reason is
   * required in either direction: this moves money on an enrolment that may
   * already have been quoted to a parent.
   *
   * The response reports how many lessons were actually re-priced and how many
   * were left alone, because those are different questions. An enrolment
   * halfway through its term will have invoiced lessons that deliberately do
   * not move, and staff should see that rather than assume everything changed.
   */
  @Post('enrolments/:id/basis')
  @Roles(RolesEnum.BACKEND_USER)
  async changePricingBasis(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) enrolmentId: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: ChangePricingBasisRequestDto,
    @Req() req: { user?: { id?: number } },
  ) {
    const changedByUserId = req.user?.id;
    if (!changedByUserId) {
      return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
    }

    try {
      const result = await this.pricingBasis.change({
        locationId,
        enrolmentId,
        pricingTier: body.pricingTier,
        keepsPreviousRate: body.keepsPreviousRate,
        confirmedPreviousRate: body.confirmedPreviousRate,
        reason: body.reason,
        effectiveFrom: body.effectiveFrom,
        changedByUserId,
      });

      return ResponseHelper.success(
        result,
        `This enrolment is now on ${result.basis.toLowerCase()}. ` +
          `${result.lessonsRepriced} lesson(s) re-priced` +
          (result.lessonsSkipped > 0
            ? `, ${result.lessonsSkipped} left as they are.`
            : '.'),
      );
    } catch (error) {
      // The resolver's own error type carries a message written for a person,
      // so it is safe to show. Anything else is ours and stays generic.
      if (error instanceof PricingResolutionError) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      console.error('Error in changePricingBasis controller:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to change what this enrolment is priced from',
      );
    }
  }

  /**
   * The hourly rate offered when staff select Previous rate.
   *
   * Historical course data is authoritative. When none exists, the response
   * marks the program/default rate as requiring confirmation so the screen can
   * show an editable money field before anything is changed.
   */
  @Get('enrolments/:id/previous-rate-option')
  @Roles(RolesEnum.BACKEND_USER)
  async getPreviousRateOption(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) enrolmentId: number,
  ) {
    try {
      const result = await this.pricingBasis.previousRateOption(
        locationId,
        enrolmentId,
      );
      return ResponseHelper.success(result, 'Previous rate option retrieved');
    } catch (error) {
      if (error instanceof PricingResolutionError) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      console.error('Error in getPreviousRateOption controller:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve the previous rate',
      );
    }
  }

  /**
   * Everything that has changed what this enrolment is priced from, and why.
   *
   * `GET /admin/v2/:location/pricing/enrolments/:id/basis-history`
   *
   * Ashif asked on 2026-08-27 where the "why" note goes once it is typed. It
   * was already being stored - `enrolment_tier_change.reason`, alongside the
   * tier it moved from and to, the effective date, who did it and when - but
   * nothing read it back. `findHistory` existed with no caller, no route and
   * no screen, so the note was reachable only by querying the database.
   *
   * Newest first, because the question staff actually ask is "what is this on
   * now and who put it there", not "what happened first".
   *
   * Readable by any backend user. It is the audit trail for a change they are
   * already allowed to make, and the adoption report's restriction does not
   * apply: that one shows every student at the location, this one shows one
   * enrolment the staff member is already looking at.
   */
  @Get('enrolments/:id/basis-history')
  @Roles(RolesEnum.BACKEND_USER)
  async getPricingBasisHistory(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) enrolmentId: number,
  ) {
    const entries = await this.enrolmentTier.findHistoryForDisplay(
      enrolmentId,
      locationId,
    );

    return ResponseHelper.success(
      { entries },
      entries.length === 0
        ? 'This enrolment has no recorded pricing changes'
        : 'Pricing basis history retrieved',
    );
  }

  /**
   * The prices staff choose between when setting an enrolment's tier.
   *
   * Answers `isTiered: false` rather than an error when the program is not on
   * the September structure, so the enrolment screen can fall back to its
   * existing manual rate field without treating it as a failure.
   *
   * `termMonths` quotes a prepaid term rather than a month. Omit it and the
   * answer is the monthly price, which is what every caller wanted before
   * prepaid terms reached this screen.
   */
  @Get('tier-options')
  @Roles(RolesEnum.BACKEND_USER)
  async getTierOptions(
    @LocationId() locationId: number,
    @Query(ValidationPipe) query: TierPricingOptionsRequestDto,
  ) {
    const effectiveDate =
      query.effectiveDate ?? getCurrentESTDate().toISOString().slice(0, 10);

    const result = await this.tierPricingOptions.findForProgram({
      locationId,
      programId: query.programId,
      durationMinutes: query.durationMinutes,
      effectiveDate,
      termMonths: query.termMonths,
    });

    return ResponseHelper.success(result, 'Tier pricing options retrieved');
  }

  /**
   * How far the new pricing has actually reached at this location.
   *
   * Arcadia paused the automated conversion, so the schools convert by hand and
   * need to see where they are. It is also the only way to notice that a
   * location is being offered tiers and not using them.
   */
  @Get('adoption')
  // Owners and administrators only. BACKEND_USER also covers staffmembers, and
  // this report shows what every student at the location is paying and who has
  // been held on a previous rate - commercial information the schools do not
  // want on the front desk. Requested by Arcadia 2026-08-21.
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async getAdoptionSummary(
    @LocationId() locationId: number,
    @Query(ValidationPipe) query: PricingAdoptionRequestDto,
  ) {
    const result = await this.adoption.summaryForLocation(
      locationId,
      query.asOf ?? this.today(),
    );

    return ResponseHelper.success(result, 'Pricing adoption retrieved');
  }

  /** The enrolments behind those counts. */
  @Get('adoption/enrolments')
  // Same restriction as the summary above - this is the row-level detail.
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async getAdoptionEnrolments(
    @LocationId() locationId: number,
    @Query(ValidationPipe) query: PricingAdoptionListRequestDto,
  ) {
    const { rows, total } = await this.adoption.listForLocation({
      locationId,
      asOf: query.asOf ?? this.today(),
      onNewPricing: query.onNewPricing,
      defaultedOnly: query.defaultedOnly,
      previousRateOnly: query.previousRateOnly,
      page: query.page ?? 1,
      limit: query.limit ?? 50,
    });

    return ResponseHelper.success(
      { rows, total, page: query.page ?? 1, limit: query.limit ?? 50 },
      'Pricing adoption enrolments retrieved',
    );
  }

  /**
   * Today in Eastern time.
   *
   * Every other report in this system measures "active" against the Eastern
   * day, so this one has to as well or the counts disagree across a screen.
   */
  private today(): string {
    return getCurrentESTDate().toISOString().slice(0, 10);
  }
}
