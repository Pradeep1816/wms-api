import { describe, expect, it } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { PricingModule } from './pricing.module';
import { CacheModule } from '../cache/cache.module';
import { AuditTrailModule } from '../audit-trail/audit-trail.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from '@nestjs/config';
import { TuitionPrice } from './entities/tuition-price.entity';
import { TuitionPrepaidPrice } from './entities/tuition-prepaid-price.entity';
import { EnrolmentTierChange } from './entities/enrolment-tier-change.entity';
import { Enrolment } from '../enrolment/entities/enrolment.entity';
import { PricingResolverService } from './services/pricing-resolver.service';
import { PricingRolloutService } from './services/pricing-rollout.service';
import { PricingAdoptionService } from './services/pricing-adoption.service';
import { TierResolverService } from './services/tier-resolver.service';
import { EnrolmentTierService } from './services/enrolment-tier.service';
import { CourseRateResolverService } from './services/course-rate-resolver.service';
import { ProgramPresentationService } from './services/program-presentation.service';
import { TierPricingOptionsService } from './services/tier-pricing-options.service';
import { BillingCycleService } from './services/billing-cycle.service';
import { Course } from '../course/entities/course.entity';
import { Program } from '../program/entities/program.entity';
import { Location } from '../location/entities/location.entity';

/**
 * Compiles the real module graph.
 *
 * Every other spec in this folder constructs its service directly with `new`,
 * which is fast but proves nothing about wiring. This caught seven services
 * that were listed in `exports` but never in `providers` - a combination Nest
 * rejects at bootstrap, so the API could not start at all while every unit test
 * passed.
 */
const ENTITIES = [
  TuitionPrice,
  TuitionPrepaidPrice,
  EnrolmentTierChange,
  Enrolment,
  Program,
  Course,
  Location,
];

/**
 * Enough of a DataSource for TypeOrmModule.forFeature to build its repository
 * providers without a database.
 */
const FAKE_DATA_SOURCE = {
  options: { type: 'mysql' },
  entityMetadatas: [],
  getRepository: () => ({}),
} as unknown as DataSource;

/** Stands in for TypeOrmModule.forRoot, which is global in the real app. */
@Global()
@Module({
  providers: [
    { provide: DataSource, useValue: FAKE_DATA_SOURCE },
    { provide: EntityManager, useValue: {} },
    ...ENTITIES.map((entity) => ({
      provide: getRepositoryToken(entity),
      useValue: {},
    })),
  ],
  exports: [
    DataSource,
    EntityManager,
    ...ENTITIES.map((entity) => getRepositoryToken(entity)),
  ],
})
class FakeTypeOrmRootModule {}

describe('PricingModule', () => {
  it('compiles and can resolve everything it exports', async () => {
    const moduleRef = await Test.createTestingModule({
      // CacheModule and AuditTrailModule are @Global in app.module, so the
      // real graph gets them for free; the test has to say so.
      imports: [
        FakeTypeOrmRootModule,
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        CacheModule,
        AuditTrailModule,
        ThrottlerModule.forRoot([{ ttl: 1000, limit: 1 }]),
        PricingModule,
      ],
    }).compile();

    for (const service of [
      PricingResolverService,
      PricingRolloutService,
      PricingAdoptionService,
      TierResolverService,
      EnrolmentTierService,
      CourseRateResolverService,
      ProgramPresentationService,
      TierPricingOptionsService,
      BillingCycleService,
    ]) {
      expect(moduleRef.get(service)).toBeDefined();
    }
  });
});
