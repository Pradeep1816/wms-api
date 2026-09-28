import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { Course } from '../../course/entities/course.entity';
import { CourseProgramRate } from '../../course/entities/course-program-rate.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonDiscount } from '../../lesson/entities/lesson-discount.entity';
import { Program } from '../../program/entities/program.entity';
import { EnrolmentTierChange } from '../entities/enrolment-tier-change.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import {
  PricingResolutionError,
  PricingResolutionErrorCode,
} from '../errors/pricing-resolution.error';
import { CourseRateResolverService } from './course-rate-resolver.service';
import { EnrolmentPrepaidPricingService } from './enrolment-prepaid-pricing.service';
import { PricingResolverService } from './pricing-resolver.service';
import { PricingRolloutService } from './pricing-rollout.service';
import { ProgramPresentationService } from './program-presentation.service';
import { RoundingUtils } from '../../utils/rounding.utils';
import {
  validCourseDay,
  hasValidCourseBounds,
} from '../../course/utils/course-date.utils';
import { getCurrentESTDate } from '../../utils/date-utils';

/** The day the September structure begins. */
export const SEPTEMBER_2026_EFFECTIVE_FROM = '2026-09-01';

export interface ChangePricingBasisInput {
  locationId: number;
  enrolmentId: number;
  /** Tier 1-3, or omitted when holding the previous rate. */
  pricingTier?: number;
  /** True to hold the pre-September rate instead of taking a tier. */
  keepsPreviousRate?: boolean;
  /** Required confirmation when no pre-September rate exists. */
  confirmedPreviousRate?: number;
  /** Why. Required either way - this is a money change somebody must own. */
  reason: string;
  changedByUserId: number;
  /**
   * The day the new price starts applying, `YYYY-MM-DD`.
   *
   * Omitted means the September cutover, which is what shipped before this was
   * configurable. Never earlier than that cutover - see `resolveEffectiveFrom`.
   */
  effectiveFrom?: string;
}

export interface ChangePricingBasisResult {
  enrolmentId: number;
  basis: string;
  /** Rate periods after the change, oldest first. */
  rates: Array<{ startDate: string; endDate: string; programRate: number }>;
  lessonsRepriced: number;
  /** Left alone because they are already invoiced or paid, or cancelled. */
  lessonsSkipped: number;
  skippedReasons: {
    inThePast: number;
    invoicedOrPaid: number;
    notScheduled: number;
  };
}

export type PreviousRateSource =
  | 'course_history'
  | 'confirmed_previous_rate'
  | 'program_default';

export interface PreviousRateOption {
  hourlyRate: number;
  source: PreviousRateSource;
  /** True when no authoritative pre-September course rate exists. */
  requiresConfirmation: boolean;
}

interface LessonRepricePlan {
  lesson: Lesson;
  baseRate: number;
  programRate: number;
  lessonTotal: number;
  billedTotal: number;
}

interface ExplodedLineageRow {
  lessonId: number | string;
  explodedParentId: number | string;
  explodedBranchId: number | string;
  explodedBranchDate: Date | string;
  descendantDepth: number | string;
  splitCount: number | string;
}

/**
 * Changes what an enrolment is priced from, after it has been created.
 *
 * ## Why this exists
 *
 * Until 2026-08-18 the tier and the held-rate flag were **write-once**. Staff
 * chose one when creating an enrolment and there was no way to change it: a
 * mistaken "Previous rate" could only be undone by deleting the enrolment and
 * building it again, and a grandfathered rate could never be ended - which the
 * client explicitly expects to do, having confirmed on 2026-08-04 that a
 * protected rate lasts "until a location removes it".
 *
 * ## Why it re-prices rather than only relabelling
 *
 * `lesson.programRate` is the money. `course_program_rate` is what future
 * lesson generation reads, and `private_lesson.total`/`balance` are copied
 * from `lesson.total` at confirmation. Changing the enrolment record alone
 * would leave a screen reading "Tier 2" over lessons still billing $65 - worse
 * than offering nothing, because it would look correct.
 *
 * Note the existing `editProgramRate` endpoint has exactly that gap: it
 * rewrites `course_program_rate` and never touches a lesson. That is not
 * changed here, but it is the reason this does its own re-pricing rather than
 * delegating.
 *
 * ## What it refuses to touch
 *
 * A lesson that is invoiced, carries a payment, or has already happened is left
 * exactly as it is. Re-pricing a settled lesson would move money a customer has
 * already been billed or has already paid, and the correct remedy for that is a
 * credit note, not a silent update. The counts come back so the caller can say
 * how much was actually changed.
 */
@Injectable()
export class EnrolmentPricingBasisService {
  private readonly logger = new Logger(EnrolmentPricingBasisService.name);

  constructor(
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(CourseProgramRate)
    private readonly courseProgramRateRepository: Repository<CourseProgramRate>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(Program)
    private readonly programRepository: Repository<Program>,
    private readonly dataSource: DataSource,
    private readonly rollout: PricingRolloutService,
    private readonly programPresentation: ProgramPresentationService,
    private readonly pricingResolver: PricingResolverService,
    private readonly courseRateResolver: CourseRateResolverService,
    private readonly enrolmentPrepaidPricing: EnrolmentPrepaidPricingService,
  ) {}

  /**
   * The rate the Change Pricing screen should show for "Previous rate".
   *
   * Real course history is authoritative and needs no second confirmation.
   * A course created after the cutover has no such row, so its program rate is
   * only a suggestion: the UI must show it to a person and POST the confirmed
   * value back. Once confirmed, that value is remembered for the next change.
   */
  async previousRateOption(
    locationId: number,
    enrolmentId: number,
  ): Promise<PreviousRateOption> {
    const enrolment = await this.enrolmentRepository.findOne({
      where: { id: enrolmentId, isDeleted: false },
    });
    if (!enrolment) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.INVALID_INPUT,
        `Enrolment ${enrolmentId} was not found`,
        { enrolmentId },
      );
    }

    const course = await this.courseRepository.findOne({
      where: { id: enrolment.courseId, locationId },
    });
    if (!course) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.INVALID_INPUT,
        `Enrolment ${enrolmentId} does not belong to this location`,
        { enrolmentId, locationId },
      );
    }

    const program = await this.programRepository.findOne({
      where: { id: course.programId },
    });
    if (!program) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.INVALID_INPUT,
        'The program for this enrolment was not found',
        { enrolmentId, programId: course.programId },
      );
    }

    const rates = await this.courseProgramRateRepository.find({
      where: { courseId: course.id },
    });

    return this.resolvePreviousRateOption(rates, program, enrolment);
  }

  async change(
    input: ChangePricingBasisInput,
  ): Promise<ChangePricingBasisResult> {
    this.assertOneBasis(input);
    const effectiveFrom = this.resolveEffectiveFrom(input.effectiveFrom);

    const enrolment = await this.enrolmentRepository.findOne({
      where: { id: input.enrolmentId, isDeleted: false },
    });
    if (!enrolment) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.INVALID_INPUT,
        `Enrolment ${input.enrolmentId} was not found`,
        { enrolmentId: input.enrolmentId },
      );
    }

    const course = await this.courseRepository.findOne({
      where: { id: enrolment.courseId, locationId: input.locationId },
    });
    if (!course) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.INVALID_INPUT,
        `Enrolment ${input.enrolmentId} does not belong to this location`,
        { enrolmentId: input.enrolmentId, locationId: input.locationId },
      );
    }

    if (!(await this.rollout.isEnabledForLocation(input.locationId))) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.INVALID_INPUT,
        'September pricing is not switched on for this location',
        { locationId: input.locationId },
      );
    }

    const program = await this.programRepository.findOne({
      where: { id: course.programId },
    });
    if (!program) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.INVALID_INPUT,
        'This program is not on the September structure, so it has no pricing basis to change',
        { programId: course.programId },
      );
    }

    // Two refusals, deliberately worded differently.
    //
    // A marker-prefixed program is meant to have no tiers and never will: it
    // exists to hold an older sheet, and keeping its rate is the correct
    // outcome. An unclassified program is a gap somebody has to fill.
    //
    // They used to share one message. Brampton West met it on 2026-09-02
    // trying to move Instrument enrolments to Tier 2, and reported only that
    // "Instrument is not on the list" - which reads as a fault rather than as
    // missing setup, and left them recreating enrolments as a workaround.
    // Ashif's own note was that it "could become a bigger issue when other
    // locations start doing mass moves to the new pricing".
    if (!this.programPresentation.isTierable(program)) {
      const isRetired = this.programPresentation.hasInternalMarker(program);
      throw new PricingResolutionError(
        PricingResolutionErrorCode.INVALID_INPUT,
        isRetired
          ? `${program.name} is a retired program, so it keeps the rate it already has and no tier applies`
          : `${program.name} has not been given a pricing category yet, so it has no tier prices. Head office needs to classify it before this enrolment can move to a tier`,
        {
          programId: course.programId,
          programName: program.name,
          reason: isRetired ? 'retired-program' : 'unclassified-program',
        },
      );
    }

    if (!hasValidCourseBounds(course.startDate, course.endDate)) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.INVALID_INPUT,
        'This course has invalid start or end dates. Please contact support to correct them before changing pricing. No pricing changes were made.',
        { courseId: course.id, enrolmentId: input.enrolmentId },
      );
    }
    this.assertEffectiveFromIsWithinCourse(effectiveFrom, course, input);

    // A real pre-September course rate remains authoritative. A course created
    // after the cutover has no such history; for that case the program rate is
    // shown to staff as a suggestion and must be explicitly confirmed.
    const existingRates = await this.courseProgramRateRepository.find({
      where: { courseId: course.id },
    });
    const previousRateOption = this.resolvePreviousRateOption(
      existingRates,
      program,
      enrolment,
    );
    const previousRate = input.keepsPreviousRate
      ? this.confirmPreviousRate(input, previousRateOption)
      : this.rateBeforeDate(existingRates, program, effectiveFrom);

    const targetRate = input.keepsPreviousRate
      ? previousRate
      : await this.catalogueRate(
          input.locationId,
          program,
          course,
          input.pricingTier as number,
          effectiveFrom,
        );

    return this.dataSource.transaction(async (manager) => {
      const courseStart = this.day(course.startDate);
      const courseEnd = this.day(course.endDate);

      const planned = input.keepsPreviousRate
        ? [
            {
              startDate: courseStart,
              endDate: courseEnd,
              programRate: previousRate,
            },
          ]
        : this.courseRateResolver.planNewCourseRateRows(
            courseStart,
            courseEnd,
            previousRate,
            effectiveFrom,
            targetRate,
          );

      // Validate before deleting anything: some legacy rate tables are not
      // transactional, so rollback cannot rescue a delete followed by no plan.
      if (
        planned.length === 0 ||
        planned[0].startDate !== courseStart ||
        planned[planned.length - 1].endDate !== courseEnd ||
        planned.some((row, index) => {
          if (
            !hasValidCourseBounds(row.startDate, row.endDate) ||
            !Number.isFinite(row.programRate) ||
            row.programRate < 0
          )
            return true;
          if (index === 0) return false;
          const next = new Date(`${planned[index - 1].endDate}T00:00:00.000Z`);
          next.setUTCDate(next.getUTCDate() + 1);
          return next.toISOString().slice(0, 10) !== row.startDate;
        })
      ) {
        throw new PricingResolutionError(
          PricingResolutionErrorCode.INVALID_INPUT,
          'A complete valid course rate schedule could not be prepared. No pricing changes were made. Please contact support.',
          { courseId: course.id, enrolmentId: input.enrolmentId },
        );
      }

      // Rebuild only after the complete replacement has passed validation.
      await manager
        .getRepository(CourseProgramRate)
        .delete({ courseId: course.id });

      for (const row of planned) {
        await manager.getRepository(CourseProgramRate).save(
          manager.getRepository(CourseProgramRate).create({
            courseId: course.id,
            startDate: new Date(`${row.startDate}T00:00:00.000Z`),
            endDate: new Date(`${row.endDate}T00:00:00.000Z`),
            programRate: row.programRate,
          }),
        );
      }

      const repriced = await this.repriceLessons(
        manager,
        course.id,
        planned,
        input.changedByUserId,
        effectiveFrom,
      );

      await manager.getRepository(Enrolment).update(
        { id: enrolment.id },
        {
          pricingTier: input.keepsPreviousRate
            ? null
            : (input.pricingTier as number),
          pricingTierIsDefaulted: false,
          keepsPreviousRate: Boolean(input.keepsPreviousRate),
          previousRateReason: input.keepsPreviousRate
            ? input.reason.trim()
            : null,
          previousRateApprovedByUserId: input.keepsPreviousRate
            ? input.changedByUserId
            : null,
          previousRateApprovedOn: input.keepsPreviousRate
            ? getCurrentESTDate()
            : null,
          ...(input.keepsPreviousRate && previousRateOption.requiresConfirmation
            ? { confirmedPreviousRate: previousRate }
            : {}),
          updatedByUserId: input.changedByUserId,
        },
      );

      // Audit the tier half in the same table staff already read for tier
      // history, so one change does not appear in two places depending on
      // which way it went. A move to the previous rate is recorded as a change
      // away from the tier, with the reason carrying the explanation.
      await manager.getRepository(EnrolmentTierChange).save(
        manager.getRepository(EnrolmentTierChange).create({
          enrolmentId: enrolment.id,
          previousTier: enrolment.pricingTier ?? null,
          newTier: input.keepsPreviousRate
            ? null
            : (input.pricingTier as number),
          wasDefaulted: false,
          effectiveFrom: effectiveFrom as unknown as Date,
          reason: input.keepsPreviousRate
            ? `Moved to the previous rate${
                previousRateOption.requiresConfirmation
                  ? ` at $${previousRate.toFixed(2)}/hour (confirmed)`
                  : ''
              }: ${input.reason.trim()}`
            : `Moved to tier ${input.pricingTier}: ${input.reason.trim()}`,
          changedByUserId: input.changedByUserId,
          changedOn: getCurrentESTDate(),
        }),
      );

      // Prepaid follows the basis. The lessons have just been re-rated, so any
      // prepaid row on them was computed against the OLD gross and is now the
      // wrong reduction - and moving to the previous rate removes the
      // entitlement altogether. Re-running this both re-prices the cycles at the
      // new tier and clears the rows when the enrolment no longer qualifies.
      //
      // After `repriceLessons`, never before: the reduction is `gross - payable`
      // and computing it against a stale gross is exactly the overcharge the
      // apply guard exists to refuse.
      const prepaid = await this.enrolmentPrepaidPricing.applyForEnrolment(
        { enrolmentId: enrolment.id },
        manager,
      );

      this.logger.log(
        `Enrolment ${enrolment.id} moved to ${
          input.keepsPreviousRate
            ? 'the previous rate'
            : `tier ${input.pricingTier}`
        }; ${repriced.repriced} lessons re-priced, ${repriced.skipped} left alone` +
          `, ${prepaid.cyclesPriced} prepaid cycles re-priced`,
      );

      return {
        enrolmentId: enrolment.id,
        basis: input.keepsPreviousRate
          ? 'Previous rate'
          : `Tier ${input.pricingTier}`,
        rates: planned,
        lessonsRepriced: repriced.repriced,
        lessonsSkipped: repriced.skipped,
        skippedReasons: repriced.reasons,
      };
    });
  }

  /**
   * Re-price the lessons it is safe to re-price.
   *
   * `total` is scaled by the same proportion as the rate rather than
   * recomputed, so any discount already applied to the lesson survives at its
   * original proportion - the same rule enrolment creation uses.
   */
  private async repriceLessons(
    manager: EntityManager,
    courseId: number,
    planned: Array<{ startDate: string; endDate: string; programRate: number }>,
    changedByUserId: number,
    effectiveFrom: string,
  ): Promise<{
    repriced: number;
    skipped: number;
    reasons: {
      inThePast: number;
      invoicedOrPaid: number;
      notScheduled: number;
    };
  }> {
    // With their discounts: the billed figure is recomputed from them below,
    // and a missing relation would silently read as "no discounts" and bill
    // every discounted lesson at gross.
    const lessons = await manager.getRepository(Lesson).find({
      where: { courseId, isDeleted: false },
      relations: ['discounts'],
    });

    // `inThePast` is always zero now and stays in the shape only because the
    // Change Pricing modal reads it. It can go when that is updated.
    const reasons = { inThePast: 0, invoicedOrPaid: 0, notScheduled: 0 };
    const repricePlans: LessonRepricePlan[] = [];

    const candidateIds = lessons.map((lesson) => lesson.id);
    const settled = await this.settledLessonIds(manager, candidateIds);

    for (const lesson of lessons) {
      // An UNSCHEDULED lesson carries no date at all - `lesson.date` is NULL
      // until it is put back on the calendar. Verified on production
      // 2026-09-03: Cathy Li's lesson 4751230 is billed $35.00 with no date.
      //
      // The effective date is the right stand-in. The credit will be used on
      // or after it, so it is worth what the enrolment charges from then on.
      //
      // This is deliberate rather than corrective. `this.day(null)` yields the
      // string "null", which sorts after every digit, so the resolver treated
      // every period as already ended and carried the last one forward - the
      // new rate, by luck of string collation rather than by intent. Naming
      // the date the credit is priced from removes the coincidence.
      const lessonDay = lesson.date ? this.day(lesson.date) : effectiveFrom;

      // A lesson that has already happened is re-priced like any other.
      //
      // It used to be skipped: `if (lessonDay < today) continue`. That made the
      // result depend on the day the change was made rather than the date it
      // was effective from, and the boundary moved forward daily - a change
      // made on 2 September would move a lesson on the 3rd but not the 1st.
      //
      // Arcadia set the rule out on 2026-09-02, with worked examples: *"the
      // effective date of the pricing change should determine the lesson price,
      // not the date the payment is processed. Once we manually change an
      // existing student to the new tier pricing effective September 1, all
      // lessons falling on or after September 1 should use that new pricing,
      // regardless of when the payment is actually taken."*
      //
      // Nothing is needed to protect earlier lessons: the rate periods already
      // split at the cutover, so a lesson before it resolves to the rate it was
      // always on and falls out at the `newRate === oldRate` check below. The
      // two guards that remain are the ones that matter - money already taken,
      // and a lesson that is no longer scheduled.
      if (settled.has(lesson.id)) {
        reasons.invoicedOrPaid += 1;
        continue;
      }
      // An UNSCHEDULED lesson re-prices too. It is a credit the family still
      // holds and will use later, so it has to be worth what the enrolment now
      // charges - a lesson taken in October should not bill September's rate
      // because it happened to be sitting unscheduled when the price moved.
      //
      // Woodbridge reported this on 2026-09-03 for Cathy and Carly Li: *"the
      // mom has agreed to the new pricing, but two lessons are still showing
      // the old rate. These classes are unscheduled, so I think that might be
      // the reason."* They were right. Both were Vocal Contemporary credits
      // left on $72.50/hr while every scheduled lesson moved to $80.00.
      //
      // CANCELED stays excluded, which is the guard that matters: a cancelled
      // lesson keeps its price, exactly as Arcadia was told on 2026-09-02.
      if (
        lesson.status !== LessonStatusEnum.SCHEDULED &&
        lesson.status !== LessonStatusEnum.RESCHEDULED &&
        lesson.status !== LessonStatusEnum.UNSCHEDULED
      ) {
        reasons.notScheduled += 1;
        continue;
      }

      const resolved = this.courseRateResolver.selectRateForDate(
        planned.map(
          (row, index) =>
            ({
              id: index + 1,
              courseId,
              startDate: row.startDate,
              endDate: row.endDate,
              programRate: row.programRate,
            }) as unknown as CourseProgramRate,
        ),
        lessonDay,
      );

      const newRate = resolved ? resolved.programRate : null;
      const oldRate = Number(lesson.programRate);
      if (newRate === null || newRate === oldRate) {
        continue;
      }

      // Keep the discount proportion. A lesson at $65 gross discounted to $60
      // moving to $87.50 becomes $80.77, not $87.50 - the customer keeps the
      // reduction they were given.
      const oldTotal = Number(lesson.total ?? 0);
      const newTotal = oldRate > 0 ? (oldTotal * newRate) / oldRate : oldTotal;

      const roundedTotal = RoundingUtils.roundDecimal(newTotal, 2);

      // `private_lesson` keeps its own copy of the money, and it - not
      // `lesson.total` - is what the Receive Payment screen and the invoicing
      // path read. Updating only `lesson` leaves the customer billed the old
      // amount while every pricing screen reports the new one.
      //
      // Found on dev 2026-08-19: after moving enrolment 33560 back to its
      // previous rate, `lesson.total` correctly read $32.50 while
      // `private_lesson.total` still read $43.75, so the payment screen would
      // have collected the tier price from a grandfathered customer - the exact
      // outcome grandfathering exists to prevent.
      //
      // `lesson.total` is the **gross**; `private_lesson.total` is what the
      // customer is actually billed, i.e. net of discounts. On a Tier 3 lesson
      // with a 10% payment-frequency discount they read $51.25 and $46.13.
      //
      // So this cannot simply copy the lesson total across - that would wipe
      // the discount off every discounted enrolment. It recomputes the billed
      // figure from the new rate and the discount rows the lesson actually
      // carries, using `Lesson.getNetPrice()` - the same calculator that
      // confirmation, rescheduling and the recurring-payment cron all use.
      //
      // It used to reconstruct the discount instead, as the ratio of two
      // already-rounded dollar figures (`billedBefore / oldTotal`), and that
      // was wrong by a cent whenever either had been rounded. Arcadia found it
      // on 2026-08-26: a 3% payment-frequency discount on a $32.50 lesson
      // stores $31.53, and 31.53/32.50 is 0.9701538 rather than 0.97, so
      // re-pricing to the Tier 1 rate gave $35.17 a lesson instead of $35.16
      // and a quarterly cycle billed $422.04 against a published $422.00.
      //
      // Recomputing also means a prepaid cycle lands on the published total
      // exactly, because `getNetPrice()` applies the prepaid dollar amount and
      // suppresses the payment-frequency percentage rather than compounding a
      // ratio that already had the percentage baked into it.
      //
      // `balance` follows `total` because a lesson reaching this point carries
      // no payment and sits on no invoice: `settledLessonIds()` excluded those.
      lesson.programRate = newRate;
      lesson.total = roundedTotal;
      const billedNow = lesson.getNetPrice();

      repricePlans.push({
        lesson,
        baseRate: newRate,
        programRate: newRate,
        lessonTotal: roundedTotal,
        billedTotal: billedNow,
      });
    }

    await this.preserveExplodedGroupTotals(manager, lessons, repricePlans);

    for (const plan of repricePlans) {
      await manager.getRepository(Lesson).update(
        { id: plan.lesson.id },
        {
          programRate: plan.programRate,
          total: plan.lessonTotal,
          updatedByUserId: changedByUserId,
        },
      );

      await manager.query(
        `UPDATE private_lesson SET total = ?, balance = ? WHERE lessonId = ?`,
        [plan.billedTotal, plan.billedTotal, plan.lesson.id],
      );
    }

    return {
      repriced: repricePlans.length,
      skipped:
        reasons.inThePast + reasons.invoicedOrPaid + reasons.notScheduled,
      reasons,
    };
  }

  /**
   * Preserve the value of a logical lesson when all of its exploded branches
   * are re-priced together. Each 15-minute child rounds correctly on its own,
   * but two $18.125 children must still represent one $36.25 lesson rather than
   * becoming $18.13 + $18.13.
   *
   * The adjustment is deliberately limited to complete, compatible families.
   * A paid/missing branch, a duration edit, or a branch-specific discount keeps
   * the existing per-lesson behavior so this operation never moves settled or
   * intentionally customized money.
   */
  private async preserveExplodedGroupTotals(
    manager: EntityManager,
    lessons: Lesson[],
    plans: LessonRepricePlan[],
  ): Promise<void> {
    if (plans.length < 2 || lessons.length < 3) {
      return;
    }

    const lineage = await this.explodedLineage(
      manager,
      plans.map((plan) => plan.lesson.id),
    );
    if (lineage.length === 0) {
      return;
    }

    const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
    const planByLessonId = new Map(plans.map((plan) => [plan.lesson.id, plan]));
    const nearestLineageByLessonId = new Map<number, ExplodedLineageRow>();

    for (const row of lineage) {
      // A reschedule also adds a depth-1 hierarchy edge to an exploded child.
      // That edge has one direct child and is not the original explode event.
      // Ignore it so descendants resolve to the nearest genuine split parent.
      if (Number(row.splitCount) < 2) {
        continue;
      }

      const lessonId = Number(row.lessonId);
      const existing = nearestLineageByLessonId.get(lessonId);
      if (
        !existing ||
        Number(row.descendantDepth) < Number(existing.descendantDepth)
      ) {
        nearestLineageByLessonId.set(lessonId, row);
      }
    }

    const groups = new Map<number, ExplodedLineageRow[]>();
    for (const row of nearestLineageByLessonId.values()) {
      const lesson = lessonById.get(Number(row.lessonId));
      if (!lesson || !this.isRepriceableLessonStatus(lesson.status)) {
        continue;
      }

      const parentId = Number(row.explodedParentId);
      const rows = groups.get(parentId) ?? [];
      rows.push(row);
      groups.set(parentId, rows);
    }

    for (const [parentId, rows] of groups) {
      const parent = lessonById.get(parentId);
      const splitCount = Number(rows[0]?.splitCount ?? 0);
      if (!parent || splitCount < 2) {
        continue;
      }

      const rowsByBranch = new Map<number, ExplodedLineageRow[]>();
      for (const row of rows) {
        const branchId = Number(row.explodedBranchId);
        const branchRows = rowsByBranch.get(branchId) ?? [];
        branchRows.push(row);
        rowsByBranch.set(branchId, branchRows);
      }

      // Every original branch must have exactly one active, unsettled lesson.
      if (
        rowsByBranch.size !== splitCount ||
        [...rowsByBranch.values()].some(
          (branchRows) =>
            branchRows.length !== 1 ||
            !planByLessonId.has(Number(branchRows[0].lessonId)),
        )
      ) {
        continue;
      }

      const orderedRows = [...rowsByBranch.values()]
        .map(([row]) => row)
        .sort((left, right) => {
          const dateOrder =
            new Date(left.explodedBranchDate).getTime() -
            new Date(right.explodedBranchDate).getTime();
          return (
            dateOrder ||
            Number(left.explodedBranchId) - Number(right.explodedBranchId)
          );
        });
      const groupPlans = orderedRows.map(
        (row) => planByLessonId.get(Number(row.lessonId))!,
      );
      const baseRate = groupPlans[0].baseRate;

      if (
        groupPlans.some((plan) => plan.baseRate !== baseRate) ||
        !this.isCompatibleExplodedFamily(
          parent,
          groupPlans.map((plan) => plan.lesson),
        )
      ) {
        continue;
      }

      const parentHours = RoundingUtils.durationToHours(parent.duration);
      const childHours = RoundingUtils.durationToHours(
        groupPlans[0].lesson.duration,
      );
      const childrenCoverParent = childHours
        .times(groupPlans.length)
        .isEqualTo(parentHours);
      if (
        childHours.isLessThanOrEqualTo(0) ||
        !childrenCoverParent ||
        groupPlans.some(
          (plan) =>
            !RoundingUtils.durationToHours(plan.lesson.duration).isEqualTo(
              childHours,
            ),
        )
      ) {
        continue;
      }

      const aggregateLesson = Object.assign(new Lesson(), parent, {
        programRate: baseRate,
      });
      const grossShares = RoundingUtils.splitAmountPreservingTotal(
        aggregateLesson.getGrossPrice(),
        groupPlans.length,
      );
      const billedShares = RoundingUtils.splitAmountPreservingTotal(
        aggregateLesson.getNetPrice(),
        groupPlans.length,
      );

      groupPlans.forEach((plan, index) => {
        plan.programRate = RoundingUtils.roundDecimal(
          RoundingUtils.decimal(grossShares[index]).dividedBy(childHours),
          RoundingUtils.MONEY_SCALE,
        );
        plan.lessonTotal = billedShares[index];
        plan.billedTotal = billedShares[index];
      });
    }
  }

  private isRepriceableLessonStatus(status: number): boolean {
    const repriceableStatuses = [
      Number(LessonStatusEnum.SCHEDULED),
      Number(LessonStatusEnum.RESCHEDULED),
      Number(LessonStatusEnum.UNSCHEDULED),
    ];
    return repriceableStatuses.includes(Number(status));
  }

  /** The split source and original branch for each current descendant. */
  private async explodedLineage(
    manager: EntityManager,
    lessonIds: number[],
  ): Promise<ExplodedLineageRow[]> {
    if (lessonIds.length === 0) {
      return [];
    }

    const placeholders = lessonIds.map(() => '?').join(',');
    return manager.query(
      `SELECT descendants.childLessonId AS lessonId,
              direct.lessonId AS explodedParentId,
              direct.childLessonId AS explodedBranchId,
              splitChild.date AS explodedBranchDate,
              descendants.depth AS descendantDepth,
              (SELECT COUNT(*)
                 FROM lesson_hierarchy sibling
                 INNER JOIN lesson siblingLesson
                         ON siblingLesson.id = sibling.childLessonId
                        AND siblingLesson.isExploded = 1
                WHERE sibling.lessonId = direct.lessonId
                  AND sibling.depth = 1) AS splitCount
         FROM lesson_hierarchy direct
         INNER JOIN lesson splitChild
                 ON splitChild.id = direct.childLessonId
                AND splitChild.isExploded = 1
         INNER JOIN lesson_hierarchy descendants
                 ON descendants.lessonId = direct.childLessonId
        WHERE direct.depth = 1
          AND descendants.childLessonId IN (${placeholders})
        ORDER BY descendants.childLessonId, descendants.depth`,
      lessonIds,
    );
  }

  /**
   * Confirm the descendants still represent the source lesson's original tax
   * and discount allocation. Edited branches are intentionally not reconciled.
   */
  private isCompatibleExplodedFamily(
    parent: Lesson,
    children: Lesson[],
  ): boolean {
    const parentTax = RoundingUtils.decimal(parent.tax ?? 0);
    if (
      children.some(
        (child) => !RoundingUtils.decimal(child.tax ?? 0).isEqualTo(parentTax),
      )
    ) {
      return false;
    }

    const effective = (lesson: Lesson) =>
      (lesson.discounts ?? []).filter(
        (discount) => !RoundingUtils.decimal(discount.value ?? 0).isZero(),
      );
    const parentDiscounts = effective(parent);
    const parentTypes = new Set(
      parentDiscounts.map((discount) => discount.type),
    );

    if (
      children.some((child) =>
        effective(child).some((discount) => !parentTypes.has(discount.type)),
      )
    ) {
      return false;
    }

    return parentDiscounts.every((parentDiscount) => {
      const childDiscounts = children.map((child) =>
        effective(child).find(
          (discount) => discount.type === parentDiscount.type,
        ),
      );
      if (childDiscounts.some((discount) => !discount)) {
        return false;
      }

      const isFixed =
        parentDiscount.type === LessonDiscount.TYPE_MULTIPLE_ENROLMENT ||
        parentDiscount.type === LessonDiscount.TYPE_PREPAID_CYCLE ||
        (parentDiscount.type === LessonDiscount.TYPE_LINE_ITEM &&
          Number(parentDiscount.valueType) === 0);

      if (isFixed) {
        const allocated = childDiscounts.reduce(
          (sum, discount) => sum.plus(discount?.value ?? 0),
          RoundingUtils.decimal(0),
        );
        return allocated.isEqualTo(parentDiscount.value ?? 0);
      }

      return childDiscounts.every(
        (discount) =>
          Number(discount?.valueType) === Number(parentDiscount.valueType) &&
          RoundingUtils.decimal(discount?.value ?? 0).isEqualTo(
            parentDiscount.value ?? 0,
          ),
      );
    });
  }

  /**
   * Lessons that already carry a live invoice or a live payment.
   *
   * "Live" is the whole point: a deleted allocation, a deleted line item, or a
   * deleted, canceled or void invoice must NOT settle a lesson, or the lesson
   * is frozen at its old rate and no later Change Price can move it.
   *
   * `repriceLessons` relies on this to set `private_lesson.balance = total`,
   * which is only sound for a lesson nothing is actually paying for.
   */
  private async settledLessonIds(
    manager: EntityManager,
    lessonIds: number[],
  ): Promise<Set<number>> {
    if (lessonIds.length === 0) {
      return new Set();
    }

    const placeholders = lessonIds.map(() => '?').join(',');

    // Only a LIVE invoice line on a LIVE invoice settles a lesson.
    //
    // `invoice_item_lesson` has no `isDeleted` of its own - the deletion lives
    // on the line item and on the invoice - so the link has to be walked. This
    // is the same definition the recurring-payment cron uses for an invoiced
    // lesson, in `recurring-payment-create-cron.repository.ts`.
    const invoiced = await manager.query(
      `SELECT DISTINCT iil.lessonId
         FROM invoice_item_lesson iil
         INNER JOIN invoice_line_item ili
                 ON ili.id = iil.invoiceLineItemId AND ili.isDeleted = 0
         INNER JOIN invoice inv
                 ON inv.id = ili.invoice_id
                AND inv.isDeleted = 0
                AND inv.isCanceled = 0
                AND inv.isVoid = 0
        WHERE iil.lessonId IN (${placeholders})`,
      lessonIds,
    );

    // Only a LIVE allocation of a LIVE payment settles a lesson.
    //
    // Without these two filters a deleted allocation kept a lesson out of
    // re-pricing for good. Arcadia hit it on 2026-09-01, the first working day
    // on the September structure: Change Price moved October onward to the new
    // rate and left September on the old one at Richmond Hill, Woodbridge and
    // Burlington. Every September lesson carried an allocation that had been
    // deleted; every October lesson carried none. It is also why re-scheduling
    // a September lesson "fixed" it - the replacement is a new row that no
    // stale allocation points at.
    const paid = await manager.query(
      `SELECT DISTINCT lp.lessonId
         FROM lesson_payment lp
         LEFT JOIN payment p ON p.id = lp.paymentId
        WHERE lp.isDeleted = 0
          AND (p.id IS NULL OR p.isDeleted = 0)
          AND lp.lessonId IN (${placeholders})`,
      lessonIds,
    );

    return new Set<number>([
      ...(invoiced as Array<{ lessonId: number }>).map((r) =>
        Number(r.lessonId),
      ),
      ...(paid as Array<{ lessonId: number }>).map((r) => Number(r.lessonId)),
    ]);
  }

  /** A tier and the previous rate are opposite answers to the same question. */
  /**
   * The day a basis change starts applying.
   *
   * Omitted keeps the September cutover, so a caller that does not send one -
   * including the Change Pricing modal before it gained a date picker -
   * behaves exactly as it did.
   *
   * The floor is that same cutover. Before it the tier structure did not
   * exist, so there is no tier price to apply, and reaching further back would
   * only touch periods already settled. Arcadia asked for the picker on
   * 2026-09-02 - "new pricing effective December 1 or August 1, 2027" - and
   * the floor was agreed with Rachit the same day.
   */
  private resolveEffectiveFrom(requested?: string): string {
    if (!requested) {
      return SEPTEMBER_2026_EFFECTIVE_FROM;
    }
    if (validCourseDay(requested) !== requested) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.INVALID_INPUT,
        'The pricing effective date must be a valid calendar date (YYYY-MM-DD)',
        { effectiveFrom: requested },
      );
    }
    if (requested < SEPTEMBER_2026_EFFECTIVE_FROM) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.INVALID_INPUT,
        `A pricing change cannot take effect before ${SEPTEMBER_2026_EFFECTIVE_FROM}, when the tier structure begins`,
        { effectiveFrom: requested },
      );
    }
    return requested;
  }

  /**
   * A chosen date has to land inside the course, or it changes nothing.
   *
   * Without this, picking a day after the last lesson recorded a tier that
   * never applied: the enrolment reported Tier 1 while every lesson stayed
   * priced at Tier 3, because there was no period left for the new rate to
   * cover. The result screen said "0 lessons re-priced", which was honest, but
   * `enrolment.pricingTier` had already moved and every tier report reads that
   * column.
   *
   * Found on dev 2026-09-02 while checking the feature by hand, not by
   * Arcadia. It is easy to hit by accident - the date Ashif gave as his own
   * example, 1 August 2027, is past the end of plenty of current enrolments.
   *
   * Only the end is checked here. The floor is `resolveEffectiveFrom`'s, and
   * a date before the course starts is harmless: the first period simply
   * begins at the course start, which is what a location asking for "from the
   * beginning" means.
   */
  private assertEffectiveFromIsWithinCourse(
    effectiveFrom: string,
    course: Course,
    input: ChangePricingBasisInput,
  ): void {
    if (!input.effectiveFrom) {
      return;
    }

    const courseEnd = this.day(course.endDate);
    if (effectiveFrom > courseEnd) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.INVALID_INPUT,
        `This enrolment ends on ${courseEnd}, so a price starting ${effectiveFrom} would never apply to any of its lessons`,
        { effectiveFrom, courseEnd, enrolmentId: input.enrolmentId },
      );
    }
  }

  private assertOneBasis(input: ChangePricingBasisInput): void {
    if (input.pricingTier && input.keepsPreviousRate) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.INVALID_INPUT,
        'Choose either a pricing tier or the previous rate, not both',
        { enrolmentId: input.enrolmentId },
      );
    }

    if (!input.pricingTier && !input.keepsPreviousRate) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.INVALID_INPUT,
        'Choose a pricing tier, or the previous rate',
        { enrolmentId: input.enrolmentId },
      );
    }

    if (!input.reason?.trim()) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.INVALID_INPUT,
        'Give a reason for changing what this enrolment is priced from',
        { enrolmentId: input.enrolmentId },
      );
    }
  }

  /** The catalogue rate for a tier, or a refusal the caller can show. */
  private async catalogueRate(
    locationId: number,
    program: Program,
    course: Course,
    pricingTier: number,
    /**
     * The catalogue is effective-dated, so it is asked for the day the change
     * applies from. A date later than September still resolves the September
     * book while that book is the one in force, and a future book would be
     * picked up automatically once one exists.
     */
    effectiveDate: string = SEPTEMBER_2026_EFFECTIVE_FROM,
  ): Promise<number> {
    const durationMinutes = await this.durationMinutesFor(course.id);

    try {
      const resolved = await this.pricingResolver.resolve({
        locationId,
        pricingCategory: this.programPresentation.pricingCategoryFor(program),
        pricingTier,
        durationMinutes,
        termMonths: 1,
        effectiveDate,
        programType: program.type,
      });
      return Number(resolved.hourlyRate);
    } catch {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.INVALID_INPUT,
        `The catalogue has no tier ${pricingTier} price for this program at ${durationMinutes} minutes`,
        { programId: program.id, pricingTier, durationMinutes },
      );
    }
  }

  private async durationMinutesFor(courseId: number): Promise<number> {
    const rows = (await this.courseRepository.query(
      `SELECT duration FROM course_schedule
        WHERE courseId = ? ORDER BY isRecent DESC, startDate DESC LIMIT 1`,
      [courseId],
    )) as Array<{ duration: string | null }>;

    const [hoursRaw = '0', minutesRaw = '0'] = (rows[0]?.duration ?? '').split(
      ':',
    );
    return (Number(hoursRaw) || 0) * 60 + (Number(minutesRaw) || 0);
  }

  /** Rate in force before a chosen tier-effective date. */
  private rateBeforeDate(
    rates: CourseProgramRate[],
    program: Program,
    date: string,
  ): number {
    const beforeDate = rates
      .filter((rate) => this.day(rate.startDate) < date)
      .sort((a, b) =>
        this.day(b.startDate).localeCompare(this.day(a.startDate)),
      );

    if (beforeDate.length > 0) {
      return Number(beforeDate[0].programRate);
    }

    const earliest = [...rates].sort((a, b) =>
      this.day(a.startDate).localeCompare(this.day(b.startDate)),
    )[0];

    return earliest ? Number(earliest.programRate) : Number(program.rate ?? 0);
  }

  private resolvePreviousRateOption(
    rates: CourseProgramRate[],
    program: Program,
    enrolment: Enrolment,
  ): PreviousRateOption {
    const historical = rates
      .filter(
        (rate) => this.day(rate.startDate) < SEPTEMBER_2026_EFFECTIVE_FROM,
      )
      .sort((a, b) =>
        this.day(b.startDate).localeCompare(this.day(a.startDate)),
      )[0];

    if (historical) {
      return {
        hourlyRate: this.assertValidPreviousRate(
          Number(historical.programRate),
          'historical course',
        ),
        source: 'course_history',
        requiresConfirmation: false,
      };
    }

    if (
      enrolment.confirmedPreviousRate !== null &&
      enrolment.confirmedPreviousRate !== undefined
    ) {
      return {
        hourlyRate: this.assertValidPreviousRate(
          Number(enrolment.confirmedPreviousRate),
          'last confirmed',
        ),
        source: 'confirmed_previous_rate',
        requiresConfirmation: true,
      };
    }

    return {
      hourlyRate: this.assertValidPreviousRate(
        Number(program.rate),
        'program default',
      ),
      source: 'program_default',
      requiresConfirmation: true,
    };
  }

  private confirmPreviousRate(
    input: ChangePricingBasisInput,
    option: PreviousRateOption,
  ): number {
    if (!option.requiresConfirmation) {
      if (input.confirmedPreviousRate !== undefined) {
        throw new PricingResolutionError(
          PricingResolutionErrorCode.INVALID_INPUT,
          'This enrolment already has a historical previous rate, so it cannot be overridden here',
          { enrolmentId: input.enrolmentId },
        );
      }
      return option.hourlyRate;
    }

    if (input.confirmedPreviousRate === undefined) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.INVALID_INPUT,
        'Confirm the previous hourly rate before applying this change',
        { enrolmentId: input.enrolmentId, suggestedRate: option.hourlyRate },
      );
    }

    return this.assertValidPreviousRate(
      Number(input.confirmedPreviousRate),
      'confirmed',
    );
  }

  private assertValidPreviousRate(rate: number, source: string): number {
    if (!Number.isFinite(rate) || rate < 0) {
      throw new PricingResolutionError(
        PricingResolutionErrorCode.INVALID_INPUT,
        `The ${source} previous rate is not valid. No pricing changes were made`,
        { rate, source },
      );
    }
    return rate;
  }

  /** `YYYY-MM-DD` from local parts, never through a UTC conversion. */
  private day(value: string | Date): string {
    if (value instanceof Date) {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return String(value).slice(0, 10);
  }
}
