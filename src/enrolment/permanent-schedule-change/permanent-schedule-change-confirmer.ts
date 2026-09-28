/**
 * Business workflow for confirming a permanent schedule change draft. It
 * transfers financial and lesson relationships while delegating all database
 * operations to the confirmation repository.
 */
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { Course } from '../../course/entities/course.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonDiscount } from '../../lesson/entities/lesson-discount.entity';
import { PrivateLesson } from '../../lesson/entities/private-lesson.entity';
import { Program } from '../../program/entities/program.entity';
import { RoundingUtils } from '../../utils/rounding.utils';
import {
  getPermanentScheduleMonthBoundary,
  isPermanentScheduleLessonRestored,
} from './domain/permanent-schedule-eligibility.policy';
import { sortPermanentScheduleLessonsByOccurrence } from './domain/permanent-schedule-planner';
import type { PermanentScheduleChangeConfirmationPersistence } from '../repositories/permanent-schedule-change/permanent-schedule-change-confirmation.repository';
import { PermanentScheduleChangeConfirmationValidator } from '../validators/permanent-schedule-change/permanent-schedule-change-confirmation.validator';

dayjs.extend(utc);

/**
 * Applies the PSC business rules. Persistence is delegated to the repository,
 * keeping this class independent of TypeORM and database query construction.
 */
export class PermanentScheduleChangeConfirmer {
  /** Bind confirmation to its persistence adapter and canonical PSC validator. */
  constructor(
    private readonly repository: PermanentScheduleChangeConfirmationPersistence,
    private readonly validator = new PermanentScheduleChangeConfirmationValidator(),
  ) {}

  /**
   * Confirm replacement lessons and migrate all related schedule, payment,
   * discount, hierarchy, and private-lesson state from their old lessons.
   */
  async confirm(
    course: Course,
    newLessons: Lesson[],
    rescheduleBeginDateStr: string,
    rescheduleEndDateStr: string,
    userId: number,
  ): Promise<void> {
    const newLessonIds = newLessons.map(({ id }) => id);
    const fetchedNewLessons =
      await this.repository.findNewLessons(newLessonIds);
    const newLessonOrder = new Map(
      newLessonIds.map((id, index) => [id, index]),
    );
    const replacements = fetchedNewLessons.sort(
      (a, b) =>
        (newLessonOrder.get(a.id) ?? 0) - (newLessonOrder.get(b.id) ?? 0),
    );

    const startDate = this.validator.parseRescheduleDate(
      rescheduleBeginDateStr,
    );
    const endDate = this.validator.parseRescheduleDate(rescheduleEndDateStr);
    startDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCHours(0, 0, 0, 0);
    const boundary = getPermanentScheduleMonthBoundary(startDate);

    const oldRescheduledLessons =
      await this.repository.findOldRescheduledLessons(course.id, boundary);
    const lessonIdsToRestore = oldRescheduledLessons
      .filter((lesson) => isPermanentScheduleLessonRestored(lesson, boundary))
      .map(({ id }) => id);
    const oldLessons = sortPermanentScheduleLessonsByOccurrence(
      await this.repository.findOldLessons(
        course.id,
        boundary,
        lessonIdsToRestore,
      ),
    );

    this.validator.validateReplacementLessonCount(
      course.id,
      oldLessons.length,
      replacements.length,
    );

    const courseEndDate = course.endDate ? new Date(course.endDate) : null;
    const lastReplacement = replacements[replacements.length - 1];
    if (
      courseEndDate &&
      endDate.toISOString().split('T')[0] ===
        courseEndDate.toISOString().split('T')[0] &&
      lastReplacement
    ) {
      await this.repository.updateCourseTeacher(
        course.id,
        lastReplacement.teacherId,
      );
    }

    const replacementIds = replacements.map(({ id }) => id);
    const oldLessonIds = oldLessons.map(({ id }) => id);
    const [
      paidAmountByOldLessonId,
      existingDiscounts,
      existingPrivateLessons,
      existingBulkRescheduleLessonIds,
    ] = await Promise.all([
      this.repository.findPaidAmounts(oldLessonIds),
      this.repository.findDiscounts(replacementIds),
      this.repository.findPrivateLessons(replacementIds),
      this.repository.findBulkRescheduleLessonIds(replacementIds),
    ]);

    const existingDiscountKeysByLessonId = new Map<number, Set<string>>();
    const discountsByLessonId = new Map<number, LessonDiscount[]>();
    for (const discount of existingDiscounts) {
      const keySet =
        existingDiscountKeysByLessonId.get(discount.lessonId) ??
        new Set<string>();
      keySet.add(this.discountKey(discount));
      existingDiscountKeysByLessonId.set(discount.lessonId, keySet);
      const discounts = discountsByLessonId.get(discount.lessonId) ?? [];
      discounts.push(discount);
      discountsByLessonId.set(discount.lessonId, discounts);
    }

    const privateLessonByLessonId = new Map<number, PrivateLesson>(
      existingPrivateLessons.map((privateLesson) => [
        privateLesson.lessonId,
        privateLesson,
      ]),
    );

    for (const [index, newLesson] of replacements.entries()) {
      const oldLesson = oldLessons[index];
      await this.repository.cancelLesson(oldLesson.id);
      await this.repository.createRescheduleHierarchy(
        oldLesson.id,
        newLesson.id,
      );

      const preservedDueKey = this.toUtcDateKey(
        oldLesson.dueDate ?? oldLesson.date,
      );
      newLesson.dueDate = this.toUtcDateOnly(
        oldLesson.dueDate ?? oldLesson.date,
      );
      await this.repository.updateLessonDueDate(newLesson.id, preservedDueKey);
      await this.repository.moveSplitUsage(oldLesson.id, newLesson.id);

      if (Number(oldLesson.teacherId) !== Number(newLesson.teacherId)) {
        const programId = newLesson.course?.programId;
        const teacherRate = programId
          ? await this.repository.findTeacherRate(
              newLesson.teacherId,
              programId,
            )
          : 0;
        await this.repository.updateTeacherRate(newLesson.id, teacherRate);
        newLesson.teacherRate = teacherRate;
      }

      const paidAmount = paidAmountByOldLessonId.get(oldLesson.id) ?? 0;
      const paymentIds = await this.repository.moveLessonPayments(
        oldLesson.id,
        newLesson.id,
      );
      await this.repository.updateDebitPaymentReferences(
        paymentIds,
        newLesson.id,
      );

      const existingKeys =
        existingDiscountKeysByLessonId.get(newLesson.id) ?? new Set<string>();
      const missingDiscounts = (oldLesson.discounts ?? []).filter(
        (discount) => !existingKeys.has(this.discountKey(discount)),
      );
      const savedDiscounts = await this.repository.saveDiscountCopies(
        newLesson.id,
        missingDiscounts,
      );
      const finalDiscounts = discountsByLessonId.get(newLesson.id) ?? [];
      finalDiscounts.push(...savedDiscounts);
      discountsByLessonId.set(newLesson.id, finalDiscounts);
      for (const discount of savedDiscounts) {
        existingKeys.add(this.discountKey(discount));
      }
      existingDiscountKeysByLessonId.set(newLesson.id, existingKeys);

      if (newLesson.course?.program?.type === Program.TYPE_PRIVATE_PROGRAM) {
        const financials = this.calculatePrivateLessonFinancials(
          newLesson,
          finalDiscounts,
          paidAmount,
        );
        const { expiryDate, rootLessonId } =
          await this.resolveLegacyPrivateLessonExpiry(newLesson);
        const existingPrivateLesson = privateLessonByLessonId.get(newLesson.id);
        if (existingPrivateLesson) {
          await this.repository.updatePrivateLesson(
            { id: existingPrivateLesson.id },
            {
              expiryDate,
              dueDate: preservedDueKey as unknown as Date,
              total: financials.total,
              balance: financials.balance,
            },
          );
        } else {
          const saved = await this.repository.savePrivateLesson({
            lessonId: newLesson.id,
            expiryDate,
            dueDate: preservedDueKey as unknown as Date,
            total: financials.total,
            balance: financials.balance,
          });
          privateLessonByLessonId.set(newLesson.id, saved);
        }
        if (rootLessonId !== newLesson.id) {
          await this.repository.updatePrivateLesson(
            { lessonId: rootLessonId },
            { expiryDate },
          );
        }
      }

      await this.repository.movePaymentCycle(oldLesson.id, newLesson.id);
      if (!existingBulkRescheduleLessonIds.has(newLesson.id)) {
        await this.repository.saveBulkRescheduleLesson(newLesson.id, userId);
        existingBulkRescheduleLessonIds.add(newLesson.id);
      }
    }

    const lastLesson = replacements[replacements.length - 1];
    if (lastLesson) {
      await this.repository.updateCourseSchedule(
        lastLesson,
        startDate,
        endDate,
      );
    }
  }

  /** Build the legacy uniqueness key used when copying lesson discounts. */
  private discountKey(discount: LessonDiscount): string {
    return `${discount.type}-${discount.enrolmentId ?? ''}`;
  }

  /** Convert a date-like value to the UTC date key stored by PSC relations. */
  private toUtcDateKey(value: Date | string): string {
    return dayjs.utc(value).format('YYYY-MM-DD');
  }

  /** Normalize a date-like value to a date-only UTC object. */
  private toUtcDateOnly(value: Date | string): Date {
    return dayjs.utc(this.toUtcDateKey(value)).startOf('day').toDate();
  }

  /** Recalculate private-lesson totals and remaining balance after migration. */
  private calculatePrivateLessonFinancials(
    lesson: Lesson,
    discounts: LessonDiscount[],
    paidAmount: number,
  ): { total: number; balance: number } {
    const lessonWithDiscounts = Object.assign(new Lesson(), lesson, {
      discounts,
    });
    const total = lessonWithDiscounts.getNetPrice();
    const balance = Math.max(
      0,
      RoundingUtils.applyBalanceToleranceForLesson(total - paidAmount),
    );
    return { total, balance };
  }

  /**
   * Resolve the private-lesson root and reproduce its legacy expiry extension
   * rules for the replacement lesson.
   */
  private async resolveLegacyPrivateLessonExpiry(
    lesson: Lesson,
  ): Promise<{ expiryDate: Date; rootLessonId: number }> {
    const { rootLessonId, rootExpiryDate } =
      await this.repository.resolvePrivateLessonRoot(lesson.id);
    const lessonDate = new Date(lesson.date);
    if (!rootExpiryDate) {
      const expiryDate = new Date(lessonDate);
      expiryDate.setUTCDate(expiryDate.getUTCDate() + 90);
      return { expiryDate, rootLessonId };
    }
    if (lessonDate >= rootExpiryDate) {
      const expiryDate = new Date(lessonDate);
      expiryDate.setUTCDate(expiryDate.getUTCDate() + 1);
      return { expiryDate, rootLessonId };
    }
    return { expiryDate: rootExpiryDate, rootLessonId };
  }
}
