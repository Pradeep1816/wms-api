import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TuitionPrice } from './entities/tuition-price.entity';
import { TuitionPrepaidPrice } from './entities/tuition-prepaid-price.entity';
import { TuitionPriceRepository } from './repositories/tuition-price.repository';
import { CourseRateResolverService } from './services/course-rate-resolver.service';
import { PricingRolloutService } from './services/pricing-rollout.service';
import { PricingAdoptionService } from './services/pricing-adoption.service';
import { ProgramPresentationService } from './services/program-presentation.service';
import { EnrolmentTierChange } from './entities/enrolment-tier-change.entity';
import { EnrolmentTierService } from './services/enrolment-tier.service';
import { Enrolment } from '../enrolment/entities/enrolment.entity';
import { PricingResolverService } from './services/pricing-resolver.service';
import { TierResolverService } from './services/tier-resolver.service';
import { TierPricingOptionsService } from './services/tier-pricing-options.service';
import { PricingController } from './controllers/pricing.controller';
import { BillingCycleService } from './services/billing-cycle.service';
import { EnrolmentPricingBasisService } from './services/enrolment-pricing-basis.service';
import { PrepaidPricingService } from './services/prepaid-pricing.service';
import { PrepaidCycleApplicationService } from './services/prepaid-cycle-application.service';
import { EnrolmentPrepaidPricingService } from './services/enrolment-prepaid-pricing.service';
import { EnrolmentCatalogueRateService } from './services/enrolment-catalogue-rate.service';
import { Course } from '../course/entities/course.entity';
import { CourseProgramRate } from '../course/entities/course-program-rate.entity';
import { Lesson } from '../lesson/entities/lesson.entity';
import { Program } from '../program/entities/program.entity';
import { Location } from '../location/entities/location.entity';
import { AuthModule } from '../auth/auth.module';
import { LocationModule } from '../location/location.module';

/**
 * Pricing module for the September 2026 tuition structure.
 *
 * This module is the single backend authority for tuition amounts. Enrolment,
 * payment cycles, recurring payments, lesson generation, invoice preview, and
 * digital enrolment must all resolve prices through it rather than calculating
 * their own, so that no two paths can diverge.
 *
 * Scope note: the automated conversion of existing enrolments was paused by
 * Arcadia on 2026-08-14. Nothing here converts an existing enrolment - the
 * catalogue applies to enrolments created with a tier and to nothing else.
 * The paused migration engine lives on `feature/september-2026-lesson-pricing`.
 */
@Module({
  imports: [
    // The controller's guards need AuthService and LocationService. Neither
    // module is global, so they are imported rather than assumed.
    AuthModule,
    LocationModule,
    TypeOrmModule.forFeature([
      TuitionPrice,
      TuitionPrepaidPrice,
      EnrolmentTierChange,
      Enrolment,
      Program,
      Course,
      CourseProgramRate,
      Lesson,
      Location,
    ]),
  ],
  providers: [
    TuitionPriceRepository,
    PricingRolloutService,
    PricingAdoptionService,
    PricingResolverService,
    TierResolverService,
    CourseRateResolverService,
    ProgramPresentationService,
    EnrolmentTierService,
    TierPricingOptionsService,
    BillingCycleService,
    EnrolmentPricingBasisService,
    PrepaidPricingService,
    PrepaidCycleApplicationService,
    EnrolmentPrepaidPricingService,
    EnrolmentCatalogueRateService,
  ],
  controllers: [PricingController],
  exports: [
    PricingRolloutService,
    PricingAdoptionService,
    PricingResolverService,
    TierResolverService,
    CourseRateResolverService,
    ProgramPresentationService,
    EnrolmentTierService,
    TierPricingOptionsService,
    BillingCycleService,
    EnrolmentPricingBasisService,
    PrepaidPricingService,
    PrepaidCycleApplicationService,
    EnrolmentPrepaidPricingService,
    EnrolmentCatalogueRateService,
    TypeOrmModule,
  ],
})
export class PricingModule {}
