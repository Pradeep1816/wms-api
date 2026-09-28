import { Injectable } from '@nestjs/common';
import { LessonRepository } from '../repositories/lesson.repository';
import { EnrolmentCatalogueRateService } from '../../pricing/services/enrolment-catalogue-rate.service';
import { LessonDiscount } from '../entities/lesson-discount.entity';
import { RoundingUtils } from '../../utils/rounding.utils';

export interface ExtraLessonRateInput {
  /** The EXTRA course the lesson will sit on. */
  courseId: number;
  studentId: number;
  programId: number;
  locationId: number;
  /** `HH:mm:ss`. */
  duration: string;
  lessonDate: Date;
}

export interface ExtraLessonDiscountInput {
  lessonId: number;
  studentId: number;
  programId: number;
  locationId: number;
  duration: string;
  lessonDate: Date;
  /** Hourly tier rate already selected for the extra lesson. */
  programRate: number;
}

/**
 * What rate a lesson on an EXTRA course is priced at.
 *
 * An extra lesson - one added on its own, or one converted from a group lesson -
 * does not join the student's regular course. It gets a course of its own,
 * `CourseType.EXTRA`, found or created per student and program. A brand-new
 * extra course has no rate row, and the price then used to fall straight through
 * to `program.rate`: the program's list price, from before tiers existed. It was
 * written onto the extra course, freezing every later extra lesson for that
 * student at it.
 *
 * Arcadia reported it on 2026-09-01 from Training Centre - a trial customer
 * quoted $32.50 where the September 30-minute price is $36.25.
 *
 * ## Why this is a service rather than a method on each caller
 *
 * There are two doors into an extra course - adding a private lesson, and
 * converting a group lesson to a private one - and the fix of 2026-09-02 only
 * went through the first. The second kept the old fallback and was found the
 * same day while checking something else. Both now call this, so a third door
 * cannot quietly acquire a fourth copy of the rule.
 */
@Injectable()
export class ExtraLessonRateService {
  constructor(
    private readonly lessonRepository: LessonRepository,
    private readonly enrolmentCatalogueRate: EnrolmentCatalogueRateService,
  ) {}

  /**
   * The rate, following the student's own pricing:
   *
   *   1. their regular enrolment's tier, when one was chosen
   *   2. whatever the extra course already charges, for a student without a tier
   *   3. otherwise the rate that regular course charges on the day - which keeps
   *      a held or unclassified student where they are
   *   4. no regular enrolment at all, so a genuinely new customer: the
   *      catalogue, which defaults to tier 1 as enrolment creation does
   *   5. the program list price only when nothing else has an opinion
   *
   * Records the answer on the extra course so the rest of the flow, and every
   * later extra lesson, reads the same figure.
   */
  async resolveAndRecord(input: ExtraLessonRateInput): Promise<number> {
    const effectiveDate = input.lessonDate.toISOString().slice(0, 10);
    const regular = await this.lessonRepository.findRegularEnrolmentForPricing(
      input.studentId,
      input.programId,
      input.locationId,
    );

    let rate = 0;

    if (regular?.pricingTier != null) {
      rate =
        (await this.enrolmentCatalogueRate.hourlyRateFor({
          locationId: input.locationId,
          programId: input.programId,
          duration: input.duration,
          effectiveDate,
          pricingTier: regular.pricingTier,
          keepsPreviousRate: regular.keepsPreviousRate,
        })) ?? 0;
    }

    // An EXTRA course can be years older than the student's regular
    // enrolment. Change Pricing updates the regular course, not this separate
    // course, so its last rate may still be the pre-tier list price. A chosen
    // tier is authoritative; reuse the extra-course rate only when no tier
    // price applies.
    if (rate === 0) {
      const existing = await this.lessonRepository.getProgramRateForDate(
        input.courseId,
        input.lessonDate,
      );
      if (existing > 0) {
        return existing;
      }
    }

    if (rate === 0 && regular) {
      rate = await this.lessonRepository.getProgramRateForDate(
        regular.courseId,
        input.lessonDate,
      );
    }

    if (rate === 0) {
      // No regular enrolment to follow - a new customer, or a program they have
      // never taken. This is a new sale, so it takes today's price.
      rate =
        (await this.enrolmentCatalogueRate.hourlyRateFor({
          locationId: input.locationId,
          programId: input.programId,
          duration: input.duration,
          effectiveDate,
          pricingTier: null,
          keepsPreviousRate: false,
        })) ?? 0;
    }

    if (rate === 0) {
      rate = await this.lessonRepository.getProgramRateFromProgram(
        input.programId,
      );
    }

    if (rate > 0) {
      const alreadyPriced = await this.lessonRepository.getProgramRate(
        input.courseId,
      );
      if (!alreadyPriced || alreadyPriced === 0) {
        await this.lessonRepository.createCourseProgramRate(
          input.courseId,
          input.lessonDate,
          rate,
        );
      }
    }

    return rate;
  }

  /**
   * Give a tier-priced extra lesson the regular enrolment's reductions.
   *
   * Multiple-enrolment and September prepaid prices are stored as fixed-dollar
   * reductions on each regular lesson. Copying those dollar values is correct
   * only when the extra lesson has the same duration. Staff may choose another
   * duration, so each fixed reduction is scaled by the target/source duration
   * ratio. The tier lookup separately supplies the target duration's own
   * hourly rate.
   *
   * Returns the dollar reduction so the caller can store the correct
   * private_lesson total immediately.
   */
  async applyEnrolmentDiscounts(
    input: ExtraLessonDiscountInput,
  ): Promise<number> {
    const regular = await this.lessonRepository.findRegularEnrolmentForPricing(
      input.studentId,
      input.programId,
      input.locationId,
    );
    const frequencyLength = Number(
      regular?.paymentFrequency?.frequencyLength ?? 0,
    );

    if (regular?.pricingTier == null || regular.keepsPreviousRate) {
      return 0;
    }

    const source =
      await this.lessonRepository.findRegularLessonWithEnrolmentDiscounts(
        regular.id,
        regular.courseId,
        input.lessonDate,
        input.duration,
        regular.pricingTier,
      );
    if (!source) {
      return 0;
    }

    const multipleEnrolment = source.discounts?.find(
      (discount) =>
        discount.type === LessonDiscount.TYPE_MULTIPLE_ENROLMENT &&
        Number(discount.value) > 0,
    );
    const prepaid = source.discounts?.find(
      (discount) =>
        discount.type === LessonDiscount.TYPE_PREPAID_CYCLE &&
        Number(discount.value) > 0,
    );
    const percentage = source.discounts?.find(
      (discount) =>
        discount.type === LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY &&
        Number(discount.value) > 0,
    );

    const sourceUnit = RoundingUtils.durationToHours(source.duration);
    const targetUnit = RoundingUtils.durationToHours(input.duration);
    const targetGross = this.grossPrice(input.programRate, input.duration);
    if (sourceUnit.lte(0) || targetUnit.lte(0) || targetGross <= 0) {
      return 0;
    }

    let totalReduction = RoundingUtils.decimal(0);

    if (multipleEnrolment) {
      const value = this.scaledFixedReduction(
        Number(multipleEnrolment.value),
        sourceUnit,
        targetUnit,
        targetGross,
      );
      if (value > 0) {
        await this.lessonRepository.createExtraLessonDiscount({
          lessonId: input.lessonId,
          enrolmentId: regular.id,
          type: LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
          // Multiple-enrolment is a fixed-dollar lesson reduction in every
          // calculator, even though historic rows may carry valueType = 1.
          // Preserve that stored shape when copying it.
          valueType: Number(multipleEnrolment.valueType ?? 0),
          value,
        });
        totalReduction = totalReduction.plus(value);
      }
    }

    // Monthly enrolments can still have the multiple-enrolment reduction.
    // Only prepaid frequencies also receive one of the following reductions.
    if (![3, 6, 12].includes(frequencyLength)) {
      return Number(totalReduction.toFixed(RoundingUtils.MONEY_SCALE));
    }

    const remainingPrice = Math.max(
      0,
      RoundingUtils.roundDecimal(
        RoundingUtils.decimal(targetGross).minus(totalReduction),
        RoundingUtils.MONEY_SCALE,
      ),
    );

    let type: number | undefined;
    let valueType = 0;
    let value = 0;
    let reduction = 0;

    if (prepaid) {
      type = LessonDiscount.TYPE_PREPAID_CYCLE;
      valueType = 0;
      value = this.scaledFixedReduction(
        Number(prepaid.value),
        sourceUnit,
        targetUnit,
        remainingPrice,
      );
      reduction = value;
    } else if (percentage) {
      type = LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY;
      valueType = 1;
      value = Number(percentage.value);
      reduction = RoundingUtils.roundDecimal(
        RoundingUtils.decimal(remainingPrice).times(value).dividedBy(100),
        RoundingUtils.MONEY_SCALE,
      );
    }

    if (type && reduction > 0) {
      await this.lessonRepository.createExtraLessonDiscount({
        lessonId: input.lessonId,
        enrolmentId: regular.id,
        type,
        valueType,
        value,
      });
      totalReduction = totalReduction.plus(reduction);
    }

    return Number(totalReduction.toFixed(RoundingUtils.MONEY_SCALE));
  }

  private scaledFixedReduction(
    sourceValue: number,
    sourceUnit: ReturnType<typeof RoundingUtils.durationToHours>,
    targetUnit: ReturnType<typeof RoundingUtils.durationToHours>,
    maximum: number,
  ): number {
    const scaled = RoundingUtils.roundDecimal(
      RoundingUtils.decimal(sourceValue)
        .times(targetUnit)
        .dividedBy(sourceUnit),
      RoundingUtils.MONEY_SCALE,
    );
    return Math.min(scaled, maximum);
  }

  private grossPrice(programRate: number, duration: string): number {
    return RoundingUtils.roundDecimal(
      RoundingUtils.decimal(programRate).times(
        RoundingUtils.durationToHours(duration),
      ),
      2,
    );
  }
}
