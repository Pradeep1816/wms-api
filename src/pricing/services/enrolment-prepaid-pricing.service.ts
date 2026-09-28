import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { PaymentCycle } from '../../payment/entities/payment-cycle.entity';
import { PaymentCycleLesson } from '../../lesson/entities/payment-cycle-lesson.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonDiscount } from '../../lesson/entities/lesson-discount.entity';
import { SEPTEMBER_2026_EFFECTIVE_FROM } from '../constants/september-2026-tuition';
import { PrepaidCycleApplicationService } from './prepaid-cycle-application.service';
import { ProgramPresentationService } from './program-presentation.service';

/** Why an enrolment was not priced, for the log and for tests. */
export type PrepaidSkipReason =
  | 'monthly-billing'
  | 'no-tier'
  | 'keeps-previous-rate'
  | 'enrolment-not-found'
  | 'program-not-tierable'
  | 'no-cycles';

export interface PrepaidPricingOutcome {
  /** Cycles that now carry the published price. */
  cyclesPriced: number;
  /** Cycles deliberately left alone, with the reason logged per cycle. */
  cyclesSkipped: number;
  skipped: PrepaidSkipReason | null;
}

/**
 * Puts an enrolment's prepaid cycles onto Arcadia's published prices.
 *
 * ## Why this exists separately from `PrepaidCycleApplicationService`
 *
 * That service prices **one cycle** whose lessons it is handed: it is the
 * arithmetic, and it is deliberately ignorant of whether it should be running.
 * This one answers the other question - which cycles, and whether this enrolment
 * qualifies at all - because those are policy decisions that change with the
 * rollout while the arithmetic does not.
 *
 * ## Never blocks the caller
 *
 * The one caller is enrolment confirmation. A pricing lookup that cannot answer
 * must not stop an enrolment being confirmed, so every failure here is caught
 * and logged and the enrolment keeps the behaviour it had before prepaid
 * existed: billed monthly, with whatever payment-frequency percentage was
 * entered. Wrong-but-old beats a staff member unable to finish an enrolment.
 *
 * That is also why a **partial** result is allowed. Cycles are priced
 * independently, so one cycle whose duration the catalogue never priced does not
 * stop the other seven.
 */
@Injectable()
export class EnrolmentPrepaidPricingService {
  private readonly logger = new Logger(EnrolmentPrepaidPricingService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly prepaidCycleApplication: PrepaidCycleApplicationService,
    private readonly programPresentation: ProgramPresentationService,
  ) {}

  /**
   * Price every prepaid cycle on this enrolment.
   *
   * @param frequencyLength months in a cycle - `payment_frequency.frequencyLength`.
   *        Optional: callers that have just read it can pass it, and everyone
   *        else lets this resolve it from the enrolment rather than each caller
   *        re-deriving the same number a slightly different way.
   */
  async applyForEnrolment(
    input: { enrolmentId: number; frequencyLength?: number },
    manager?: EntityManager,
  ): Promise<PrepaidPricingOutcome> {
    const entityManagerForClear = manager ?? this.dataSource.manager;

    /**
     * Bow out, having removed any prepaid row this enrolment no longer
     * qualifies for.
     *
     * The clearing is the whole reason this is a helper rather than a bare
     * return. An enrolment moved off a tier, onto the previous rate, or back to
     * monthly billing stops being entitled to a published cycle price - and if
     * its old prepaid rows survived, every calculator would keep honouring them
     * and the customer would keep the discount for a cycle price they are no
     * longer on. `apply` self-corrects on re-run, but it is never called on a
     * path that bows out, so this is the only place that can undo it.
     */
    const nothing = async (
      skipped: PrepaidSkipReason,
    ): Promise<PrepaidPricingOutcome> => {
      if (skipped !== 'enrolment-not-found' && skipped !== 'no-cycles') {
        await this.clearPrepaidRows(input.enrolmentId, entityManagerForClear);
      }
      return { cyclesPriced: 0, cyclesSkipped: 0, skipped };
    };

    const entityManager = entityManagerForClear;

    const enrolment = await entityManager.getRepository(Enrolment).findOne({
      where: { id: input.enrolmentId },
      relations: ['course', 'course.program', 'paymentFrequency'],
    });

    if (!enrolment) {
      return await nothing('enrolment-not-found');
    }

    const frequencyLength =
      input.frequencyLength ?? enrolment.paymentFrequency?.frequencyLength ?? 1;

    // Monthly billing has no prepaid total to apply. The resolver would answer
    // `monthlyAmount` for a one-month term and the reduction would come out at
    // zero, so this is an early exit rather than a different answer.
    if (frequencyLength <= 1) {
      return await nothing('monthly-billing');
    }

    // A tier and the held previous rate are opposite answers to what an
    // enrolment is priced from. A grandfathered enrolment keeps the old rate
    // *and* the old prepaid arrangement - the published September totals are
    // not its prices - so it is left exactly as it is.
    if (enrolment.keepsPreviousRate) {
      return await nothing('keeps-previous-rate');
    }

    if (!enrolment.pricingTier) {
      return await nothing('no-tier');
    }

    const program = enrolment.course?.program;
    if (!program || !this.programPresentation.isTierable(program)) {
      return await nothing('program-not-tierable');
    }

    const pricingCategory =
      this.programPresentation.pricingCategoryFor(program);

    const cycles = await entityManager
      .getRepository(PaymentCycle)
      .find({ where: { enrolmentId: enrolment.id, isDeleted: 0 } });

    if (cycles.length === 0) {
      return await nothing('no-cycles');
    }

    let cyclesPriced = 0;
    let cyclesSkipped = 0;

    for (const cycle of cycles) {
      // Prepaid prices exist only under the September structure. A cycle that
      // starts before the cutover is billed the way it always was, even on an
      // enrolment that has a tier - which is the same rule the rate itself
      // follows.
      if (this.day(cycle.startDate) < SEPTEMBER_2026_EFFECTIVE_FROM) {
        cyclesSkipped++;
        continue;
      }

      const lessons = await this.lessonsInCycle(cycle.id, entityManager);

      if (lessons.length === 0) {
        cyclesSkipped++;
        continue;
      }

      // Read from the lessons rather than the course schedule: the schedule
      // holds what the enrolment looks like *now*, and a cycle already on the
      // books was built from the durations its own lessons carry.
      const durationMinutes = this.durationToMinutes(lessons[0].duration);
      if (durationMinutes === null) {
        cyclesSkipped++;
        continue;
      }

      try {
        const plan = await this.prepaidCycleApplication.plan(
          {
            enrolmentId: enrolment.id,
            courseId: enrolment.courseId,
            lessonIds: lessons.map((lesson) => lesson.id),
            locationId: enrolment.course?.locationId ?? null,
            pricingCategory,
            pricingTier: enrolment.pricingTier,
            durationMinutes,
            frequencyLength,
            effectiveDate: this.day(cycle.startDate),
            programType: program.type,
          },
          entityManager,
        );

        await this.prepaidCycleApplication.apply(plan, entityManager);
        // The discount rows alone do not change what the customer is billed:
        // `private_lesson.total` holds that, and until it is recomputed the
        // enrolment page, the balance card and the payment screen all keep
        // quoting the pre-prepaid figure.
        await this.resyncBilledTotals(
          plan.lessons.map((lessonRow) => lessonRow.lessonId),
          entityManager,
        );
        cyclesPriced++;
      } catch (error) {
        // Logged at warn, not error: an unpriced duration or a cycle whose
        // lessons carry a deliberate override is an ordinary case here, and the
        // enrolment is still perfectly usable on monthly billing.
        cyclesSkipped++;
        this.logger.warn(
          `Enrolment ${enrolment.id}: payment cycle ${cycle.id} left on ` +
            `monthly billing - ${
              error instanceof Error ? error.message : String(error)
            }`,
        );
      }
    }

    this.logger.log(
      `Enrolment ${enrolment.id}: ${cyclesPriced} of ${cycles.length} ` +
        `payment cycles on published prepaid prices ` +
        `(${input.frequencyLength}-month billing)`,
    );

    return { cyclesPriced, cyclesSkipped, skipped: null };
  }

  /**
   * Recompute what the customer is billed for these lessons.
   *
   * `lesson_discount` is what the calculators read, but `private_lesson.total`
   * is what the enrolment page, the balance card and the Receive Payment screen
   * actually show - and nothing recomputes it when a discount row appears or
   * disappears. The recurring-payment cron would eventually, but only for
   * lessons near their due date and only on its own schedule, so between the
   * change and that run the customer is quoted the old figure.
   *
   * The arithmetic is deliberately not reimplemented here: `getNetPrice()` on
   * the entity is the same calculator confirmation, rescheduling and the cron
   * all use, including the rule that a prepaid dollar amount replaces the
   * payment-frequency percentage instead of stacking with it.
   *
   * ## Lessons that are already settled are left alone
   *
   * A lesson sitting on an invoice or carrying a payment has a balance that
   * reflects money actually collected. Rewriting `balance` from the price would
   * discard that, so those lessons keep what they have and only the price of
   * uninvoiced, unpaid future lessons moves - the same rule the pricing-basis
   * change applies.
   */
  private async resyncBilledTotals(
    lessonIds: number[],
    entityManager: EntityManager,
  ): Promise<number> {
    if (lessonIds.length === 0) {
      return 0;
    }

    const settled = await this.settledLessonIds(lessonIds, entityManager);
    const open = lessonIds.filter((lessonId) => !settled.has(lessonId));

    if (open.length === 0) {
      return 0;
    }

    const lessons = await entityManager.getRepository(Lesson).find({
      where: { id: In(open) },
      relations: ['discounts'],
    });

    let updated = 0;
    for (const lesson of lessons) {
      const billed = lesson.getNetPrice();
      await entityManager.query(
        'UPDATE private_lesson SET total = ?, balance = ? WHERE lessonId = ?',
        [billed, billed, lesson.id],
      );
      updated += 1;
    }

    return updated;
  }

  /**
   * Lessons already on an invoice or carrying a payment.
   *
   * Both tables hold real lesson ids, unlike `invoice_line_item.item_id`, so
   * this is a direct lookup rather than a join through the line items.
   */
  private async settledLessonIds(
    lessonIds: number[],
    entityManager: EntityManager,
  ): Promise<Set<number>> {
    const placeholders = lessonIds.map(() => '?').join(',');

    const invoiced: Array<{ lessonId: number }> = await entityManager.query(
      `SELECT DISTINCT lessonId FROM invoice_item_lesson WHERE lessonId IN (${placeholders})`,
      lessonIds,
    );
    const paid: Array<{ lessonId: number }> = await entityManager.query(
      `SELECT DISTINCT lessonId FROM lesson_payment WHERE lessonId IN (${placeholders})`,
      lessonIds,
    );

    return new Set(
      [...invoiced, ...paid].map((row) => Number(row.lessonId)),
    );
  }

  /**
   * Remove every prepaid row on this enrolment.
   *
   * By `enrolmentId` rather than by lesson: `apply` stamps the enrolment on each
   * row it writes, and going through the lessons would miss any row on a lesson
   * that has since been unlinked from its cycle - which is exactly the row that
   * would otherwise be left behind.
   */
  private async clearPrepaidRows(
    enrolmentId: number,
    entityManager: EntityManager,
  ): Promise<void> {
    // Which lessons the rows were on, before they stop existing. Removing the
    // discount does not by itself restore what the customer is billed, and
    // after the delete there is nothing left to point at the affected lessons.
    //
    // Arcadia found this on 2026-08-26: a quarterly enrolment moved to Monthly
    // kept billing the quarterly per-lesson figure - $35.16 with every twelfth
    // lesson at $35.24, which is the published $422.00 split twelve ways - long
    // after the prepaid rows themselves had gone.
    const affected = await entityManager
      .getRepository(LessonDiscount)
      .find({
        where: { enrolmentId, type: LessonDiscount.TYPE_PREPAID_CYCLE },
        select: ['lessonId'],
      });

    const removed = await entityManager.getRepository(LessonDiscount).delete({
      enrolmentId,
      type: LessonDiscount.TYPE_PREPAID_CYCLE,
    });

    await this.resyncBilledTotals(
      affected.map((row) => row.lessonId),
      entityManager,
    );

    if (removed.affected) {
      this.logger.log(
        `Enrolment ${enrolmentId}: removed ${removed.affected} prepaid ` +
          'cycle discount rows - it no longer qualifies for a published price',
      );
    }
  }

  /**
   * The lessons a cycle actually bills for, in date order.
   *
   * Joined through `payment_cycle_lesson` rather than re-derived from the
   * cycle's dates, because that table is what the invoice and payment-cycle
   * queries join on. Deriving the set again from dates would risk pricing a
   * different set of lessons from the one that gets billed.
   */
  private async lessonsInCycle(
    paymentCycleId: number,
    entityManager: EntityManager,
  ): Promise<Lesson[]> {
    return entityManager
      .getRepository(Lesson)
      .createQueryBuilder('lesson')
      .innerJoin(
        PaymentCycleLesson,
        'pcl',
        'pcl.lessonId = lesson.id AND pcl.isDeleted = 0',
      )
      .where('pcl.paymentCycleId = :paymentCycleId', { paymentCycleId })
      .andWhere('lesson.isDeleted = 0')
      .orderBy('lesson.date', 'ASC')
      .getMany();
  }

  /** `"00:45:00"` to 45. Null for anything the catalogue could not price. */
  private durationToMinutes(duration?: string | null): number | null {
    if (!duration) return null;
    const [hours = '0', minutes = '0'] = String(duration).split(':');
    const total = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
    return total > 0 ? total : null;
  }

  /** `YYYY-MM-DD` from local parts, never through a UTC conversion. */
  private day(value: string | Date): string {
    if (typeof value === 'string') return value.slice(0, 10);
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const date = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${date}`;
  }
}
