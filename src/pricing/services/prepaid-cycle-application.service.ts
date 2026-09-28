import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonDiscount } from '../../lesson/entities/lesson-discount.entity';
import { PrepaidPricingService } from './prepaid-pricing.service';
import { PricingCategoryEnum } from '../enums/pricing-category.enum';
import { toCents, fromCents } from '../utils/decimal-money';
import { RoundingUtils } from '../../utils/rounding.utils';

/**
 * Lessons a month is priced for.
 *
 * Arcadia's structure, confirmed by Ashif on 2026-08-25: monthly 4, three
 * months 12, six months 24, twelve months 48. The published prepaid totals are
 * the price of exactly this many lessons, which is what makes them divisible
 * into a per-lesson rate.
 *
 * It is not a claim about how many lessons a month contains - plenty hold three
 * or five. It is what the price was set for.
 */
export const LESSONS_PER_MONTH = 4;

export interface PrepaidCyclePlanInput {
  enrolmentId: number;
  courseId: number;
  /** Lessons in the cycle, in date order. */
  lessonIds: number[];
  locationId: number | null;
  pricingCategory: PricingCategoryEnum;
  pricingTier: number;
  durationMinutes: number;
  /** Months in the cycle - `payment_frequency.frequencyLength`. */
  frequencyLength: number;
  /** `YYYY-MM-DD`, the cycle's start. */
  effectiveDate: string;
  programType?: number;
}

export interface PrepaidCycleLessonAmount {
  lessonId: number;
  /** Gross for this lesson, from its own rate and duration. */
  grossAmount: string;
  /** What the customer pays for it once the cycle price is spread. */
  payableAmount: string;
  /** The reduction stored as a `TYPE_PREPAID_CYCLE` lesson discount, in dollars. */
  discountAmount: string;
}

export interface PrepaidCyclePlan {
  enrolmentId: number;
  termMonths: number;
  /** The published figure for the whole cycle. */
  payableTermAmount: string;
  /** Sum of the per-lesson payable amounts. Must equal the above, exactly. */
  distributedTotal: string;
  isApprovedTerm: boolean;
  lessons: PrepaidCycleLessonAmount[];
  /**
   * Lessons still carrying a pre-migration rate.
   *
   * Non-empty means the rate migration has not re-rated this cycle yet and
   * **prepaid must not be applied**. See `apply`.
   */
  staleLessonIds: number[];
  /** What each lesson's gross should be once re-rated: `monthlyAmount / 4`. */
  expectedGrossAmount: string;
}

/**
 * Spreads a published prepaid cycle price across the lessons in that cycle.
 *
 * ## Why it has to reach the lessons at all
 *
 * Two more obvious homes were ruled out on 2026-08-12.
 * `customer_recurring_payment.amount` is **staff-entered** and nothing derives
 * it from a rate card - it describes how a customer pays, not what they owe. And
 * `private_lesson.total` cannot be written directly, because the
 * recurring-payment cron recomputes it from the lesson's rate and its discounts
 * and overwrites whatever is there.
 *
 * So the cycle price has to be expressed in what the calculators actually read,
 * which is `lesson.programRate` and `lesson_discount`.
 *
 * ## A per-lesson rate, not a fixed total
 *
 * D18 said the customer pays the published total **whatever the cycle holds**.
 * Ashif reversed that on 2026-08-25, and the reason is operational rather than
 * commercial - they pro-rate routinely:
 *
 * > if a student registers during the third week of the month, we may charge
 * > for the remaining 2 lessons; or charge for 6 lessons; or charge a full 4
 * > and leave the first 2 unscheduled ... a student may be away for two months
 * > and return during the third month of their prepaid cycle ... we would
 * > prefer to have some flexibility rather than being locked into a fixed
 * > number of lessons.
 *
 * So the published total is treated as the price of a **standard** cycle -
 * 4 lessons a month, so 12 for a quarter - and divided by that count to get a
 * per-lesson prepaid rate. The cycle then costs that rate times however many
 * lessons it actually holds.
 *
 * A standard cycle still costs exactly the published figure, which is the
 * property that matters: $510.00 over 12 lessons is $42.50 each, and twelve of
 * those is $510.00. A 6-lesson cycle costs $255.00 and an 11-lesson one
 * $467.50.
 *
 * ## This also removes a limit the old reading could not escape
 *
 * A lesson discount can only ever reduce a price. Under the fixed-total rule a
 * cycle holding fewer lessons than its term implies could not reach the
 * published figure at all - an 11-lesson quarter billed $962.50 against a
 * published $1,019.00, silently, on about one in five cycles. Pricing per
 * lesson has no such floor, because there is no total left to fall short of.
 *
 * ## The last lesson absorbs the rounding
 *
 * The per-lesson rate is computed in **integer cents** and any remainder is put
 * on the final lesson, so a standard cycle still sums to the published total
 * exactly rather than to a rounded approximation of it.
 */
@Injectable()
export class PrepaidCycleApplicationService {
  private readonly logger = new Logger(PrepaidCycleApplicationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly prepaidPricing: PrepaidPricingService,
  ) {}

  /**
   * What each lesson in the cycle should cost. Computes only; `apply` writes.
   *
   * @param manager **Pass this whenever the caller is in a transaction.** The
   *        lesson read below is what the whole plan is built from, and reading
   *        it on the default connection inside an open transaction returns
   *        nothing - the lessons are not committed yet. The plan then prices an
   *        empty cycle, `apply` writes no rows, and the enrolment is silently
   *        billed monthly. It reports success either way, which is what made
   *        this invisible until it was run against a real database.
   */
  async plan(
    input: PrepaidCyclePlanInput,
    manager?: EntityManager,
  ): Promise<PrepaidCyclePlan> {
    const pricing = await this.prepaidPricing.resolve({
      locationId: input.locationId,
      pricingCategory: input.pricingCategory,
      pricingTier: input.pricingTier,
      durationMinutes: input.durationMinutes,
      frequencyLength: input.frequencyLength,
      effectiveDate: input.effectiveDate,
      programType: input.programType,
    });

    const lessons = await (manager ?? this.dataSource.manager)
      .getRepository(Lesson)
      .createQueryBuilder('lesson')
      .where('lesson.id IN (:...ids)', { ids: input.lessonIds })
      .andWhere('lesson.isDeleted = 0')
      .orderBy('lesson.date', 'ASC')
      .getMany();

    // What the published total is the price of: four lessons a month.
    const standardLessonCount = pricing.termMonths * LESSONS_PER_MONTH;

    const distributed = this.distribute(
      lessons,
      pricing.payableTermAmount,
      standardLessonCount,
    );

    // Gross for one lesson is exactly a quarter of the monthly figure. That is
    // an identity, not an assumption about how many lessons a month holds:
    // monthly = rate x minutes / 15 and gross = rate x minutes / 60, so
    // monthly = 4 x gross for any duration. It therefore tells us whether the
    // lesson is on the migrated rate without needing the rate itself.
    const expectedGrossCents = RoundingUtils.roundDecimal(
      toCents(pricing.monthlyAmount) / 4,
      0,
    );

    return {
      enrolmentId: input.enrolmentId,
      termMonths: pricing.termMonths,
      payableTermAmount: pricing.payableTermAmount,
      isApprovedTerm: pricing.isApprovedTerm,
      ...distributed,
      expectedGrossAmount: fromCents(expectedGrossCents),
      // Only lessons priced BELOW the expectation. A lesson above it is
      // somebody's deliberate override and not this service's business; a
      // lesson below it has not been re-rated yet, and that is the direction
      // that costs the customer money - see `apply`.
      staleLessonIds: distributed.lessons
        .filter((lesson) => toCents(lesson.grossAmount) < expectedGrossCents)
        .map((lesson) => lesson.lessonId),
    };
  }

  /**
   * Price each lesson at the cycle's per-lesson prepaid rate.
   *
   * Exposed for testing because the invariant that matters - a standard cycle
   * costing exactly the published total - is a property of this function alone.
   *
   * @param standardLessonCount lessons a full cycle of this term is priced for:
   *        four a month, so 12 for a quarter. The published total is the price
   *        of THAT many lessons, and dividing by it is what turns a total into
   *        a rate. Falls back to the actual count, which reproduces the old
   *        fixed-total behaviour for a caller that does not supply one.
   */
  distribute(
    lessons: Array<Pick<Lesson, 'id'> & { getGrossPrice(): number }>,
    payableTermAmount: string,
    standardLessonCount?: number,
  ): { distributedTotal: string; lessons: PrepaidCycleLessonAmount[] } {
    if (lessons.length === 0) {
      return { distributedTotal: '0.00', lessons: [] };
    }

    const totalCents = toCents(payableTermAmount);
    // The count the published total is the price of - not the count this cycle
    // happens to hold. That distinction is the whole change: dividing by the
    // actual count would make every cycle cost the published total no matter
    // how few lessons it contains.
    const pricedFor =
      standardLessonCount && standardLessonCount > 0
        ? standardLessonCount
        : lessons.length;

    const perLesson = Math.floor(totalCents / pricedFor);
    // Whatever does not divide evenly, kept so a STANDARD cycle still sums to
    // the published total to the cent. On a cycle of any other size there is
    // nothing to reconcile to, so the remainder simply rides on the last lesson
    // as it always did.
    const remainder = totalCents - perLesson * pricedFor;

    const rows: PrepaidCycleLessonAmount[] = lessons.map((lesson, index) => {
      const payableCents =
        index === lessons.length - 1 ? perLesson + remainder : perLesson;
      const grossAmount = RoundingUtils.roundDecimal(lesson.getGrossPrice(), 2).toFixed(2);
      const grossCents = toCents(grossAmount);

      return {
        lessonId: lesson.id,
        grossAmount,
        payableAmount: fromCents(payableCents),
        // Never negative: a cycle priced above gross would otherwise store a
        // discount that increases the bill.
        discountAmount: fromCents(Math.max(0, grossCents - payableCents)),
      };
    });

    return {
      distributedTotal: fromCents(
        rows.reduce((sum, row) => sum + toCents(row.payableAmount), 0),
      ),
      lessons: rows,
    };
  }

  /**
   * Write the plan as `TYPE_PREPAID_CYCLE` lesson discounts.
   *
   * Replaces any prepaid row already on those lessons, so a re-run corrects
   * rather than doubles. The payment-frequency rows are **left alone** - D15 -
   * because `Lesson.getDiscount` suppresses them whenever a prepaid row is
   * present, which keeps the old behaviour one delete away.
   *
   * ## Refuses to run before the rate migration, and why that matters
   *
   * The stored reduction is `gross - payable`, and `gross` is read from the
   * lesson's own rate. Apply this to a lesson that has not been re-rated yet
   * and the reduction is computed against the **old, lower** gross, so it comes
   * out too small. The lesson is then re-rated upward and keeps that
   * undersized reduction, and the customer pays **more than the published
   * cycle total** - which is the one thing the published-figure rule exists to
   * prevent.
   *
   * The ordering rule was written down and nowhere else. This is it in code:
   * tier, then rate, then lessons, then prepaid.
   *
   * ## `lesson_discount` is MyISAM, so these writes are not transactional
   *
   * Confirmed on the 2026-08-21 snapshot: `lesson`, `enrolment`, `course` and
   * `payment_cycle` are InnoDB but **`lesson_discount` is MyISAM**. Passing an
   * `EntityManager` therefore scopes the *reads* but cannot roll the *writes*
   * back - a confirmation that fails after this point leaves the rows behind
   * while everything around them is undone.
   *
   * This is a property of the schema, not of prepaid: every existing lesson
   * discount - payment frequency, multiple enrolment - is written the same way
   * and has always had the same exposure.
   *
   * It is survivable here because this method **deletes before it inserts**, so
   * the next confirmation of the same enrolment corrects whatever was left, and
   * an unconfirmed enrolment is not billed in the meantime. Do not "improve"
   * that into an insert-only path without changing the engine first.
   *
   * @param force write anyway. For repairing a cycle whose lessons carry a
   *        deliberate non-catalogue rate; never as a way past a failed run.
   */
  async apply(
    plan: PrepaidCyclePlan,
    manager?: EntityManager,
    force = false,
  ): Promise<number> {
    if (plan.staleLessonIds.length > 0 && !force) {
      throw new Error(
        `Enrolment ${plan.enrolmentId}: ${plan.staleLessonIds.length} of ` +
          `${plan.lessons.length} lessons are still on a pre-migration rate ` +
          `(expected gross ${plan.expectedGrossAmount} each). Re-rate the ` +
          `course first - applying prepaid now would overcharge this ` +
          `customer. Lessons: ${plan.staleLessonIds.slice(0, 10).join(', ')}` +
          `${plan.staleLessonIds.length > 10 ? ', ...' : ''}`,
      );
    }

    const run = async (entityManager: EntityManager): Promise<number> => {
      const repository = entityManager.getRepository(LessonDiscount);
      const lessonIds = plan.lessons.map((lesson) => lesson.lessonId);

      if (lessonIds.length === 0) {
        return 0;
      }

      await repository.delete({
        lessonId: In(lessonIds),
        type: LessonDiscount.TYPE_PREPAID_CYCLE,
      });

      const rows = plan.lessons
        .filter((lesson) => Number(lesson.discountAmount) > 0)
        .map((lesson) =>
          repository.create({
            lessonId: lesson.lessonId,
            enrolmentId: plan.enrolmentId,
            type: LessonDiscount.TYPE_PREPAID_CYCLE,
            // Dollars. The two calculators that do not know this type fall
            // through to their dollar branch on valueType 0.
            valueType: 0,
            value: Number(lesson.discountAmount),
          }),
        );

      if (rows.length > 0) {
        await repository.save(rows);
      }

      this.logger.log(
        `Prepaid cycle for enrolment ${plan.enrolmentId}: ` +
          `${plan.payableTermAmount} across ${plan.lessons.length} lessons`,
      );

      return rows.length;
    };

    return manager
      ? run(manager)
      : this.dataSource.transaction((entityManager) => run(entityManager));
  }
}
