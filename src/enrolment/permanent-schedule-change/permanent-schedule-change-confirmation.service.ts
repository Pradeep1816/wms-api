/**
 * Independent confirmation workflow for permanent schedule changes (PSC).
 * Business ordering lives here; every TypeORM operation is delegated to the
 * PSC confirmation repository and executed in one transaction.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { Course } from '../../course/entities/course.entity';
import type { Lesson } from '../../lesson/entities/lesson.entity';
import type { Enrolment } from '../entities/enrolment.entity';
import { EnrolmentPrepaidPricingService } from '../../pricing/services/enrolment-prepaid-pricing.service';
import { CustomerBalanceRecalculatorService } from '../../shared/services/customer-balance-recalculator.service';
import { PermanentScheduleChangeConfirmationRepository } from '../repositories/permanent-schedule-change/permanent-schedule-change-confirmation.repository';
import type { PermanentScheduleChangeConfirmationPersistence } from '../repositories/permanent-schedule-change/permanent-schedule-change-confirmation.repository';
import { PermanentScheduleChangeConfirmer } from './permanent-schedule-change-confirmer';

/** Complete server-owned input for confirming one PSC draft. */
export interface ConfirmPermanentScheduleChangeInput {
  courseId: number;
  enrolmentId: number;
  locationId: number;
  locationSlug: string;
  loggedUserId: number;
  rescheduleBeginDate: string;
  rescheduleEndDate: string;
}

/** Owns PSC confirmation without depending on the lesson confirmation API. */
@Injectable()
export class PermanentScheduleChangeConfirmationService {
  /** Inject PSC persistence and shared billing collaborators only. */
  constructor(
    private readonly repository: PermanentScheduleChangeConfirmationRepository,
    private readonly customerBalanceRecalculator: CustomerBalanceRecalculatorService,
    private readonly enrolmentPrepaidPricing: EnrolmentPrepaidPricingService,
  ) {}

  /** Confirm the PSC draft atomically and return its route enrolment ID. */
  async confirm(
    input: ConfirmPermanentScheduleChangeInput,
  ): Promise<number | null> {
    try {
      return await this.repository.transaction((persistence, manager) =>
        this.confirmInTransaction(input, persistence, manager),
      );
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to confirm permanent schedule change: ${this.errorMessage(error)}`,
      );
    }
  }

  /** Apply the PSC migration and post-confirmation billing updates in order. */
  private async confirmInTransaction(
    input: ConfirmPermanentScheduleChangeInput,
    persistence: PermanentScheduleChangeConfirmationPersistence,
    manager: EntityManager,
  ): Promise<number | null> {
    const course = await persistence.findCourse(
      input.courseId,
      input.locationId,
    );
    if (!course) {
      throw new NotFoundException(`Course with ID ${input.courseId} not found`);
    }

    const replacementLessons = await persistence.findUnconfirmedLessons(
      course.id,
    );
    await persistence.markCourseConfirmed(course.id);

    if (replacementLessons.length === 0) {
      return persistence.findEnrolmentId(input.enrolmentId, course.id);
    }

    const confirmer = new PermanentScheduleChangeConfirmer(persistence);
    await confirmer.confirm(
      course,
      replacementLessons,
      input.rescheduleBeginDate,
      input.rescheduleEndDate,
      input.loggedUserId,
    );

    const replacementLessonIds = replacementLessons.map(({ id }) => id);
    await persistence.markLessonsConfirmed(replacementLessonIds);
    await persistence.ensureLessonEmailStatuses(replacementLessonIds);

    const finalLesson = replacementLessons[replacementLessons.length - 1];
    const finalLessonDate = new Date(finalLesson.date);
    await persistence.updateCourseEndDate(course.id, finalLessonDate);

    const enrolment = await persistence.findEnrolment(
      input.enrolmentId,
      course.id,
    );
    if (!enrolment) {
      return null;
    }

    await persistence.confirmEnrolment(enrolment.id, finalLessonDate);
    await this.updateBilling(
      course,
      enrolment,
      finalLessonDate,
      persistence,
      manager,
    );

    const customerId = enrolment.student?.user?.id;
    if (customerId) {
      await this.customerBalanceRecalculator.recalculateAndPersist(customerId, {
        manager,
        updatedByUserId: input.loggedUserId,
        locationSlug: input.locationSlug,
      });
    }

    return enrolment.id;
  }

  /** Preserve payment-cycle, prepaid-price, and due-date behavior after PSC. */
  private async updateBilling(
    course: Course,
    enrolment: Enrolment,
    finalLessonDate: Date,
    persistence: PermanentScheduleChangeConfirmationPersistence,
    manager: EntityManager,
  ): Promise<void> {
    const paymentFrequency = await persistence.findEnrolmentPaymentFrequency(
      enrolment.id,
    );
    if (paymentFrequency && enrolment.paymentFrequency) {
      await this.ensurePaymentCycles(
        course,
        enrolment,
        paymentFrequency.paymentCycleStartDate,
        finalLessonDate,
        persistence,
      );
      await this.enrolmentPrepaidPricing.applyForEnrolment(
        {
          enrolmentId: enrolment.id,
          frequencyLength: enrolment.paymentFrequency.frequencyLength,
        },
        manager,
      );
    }

    await this.updateLessonDueDates(course.id, enrolment.id, persistence);
  }

  /** Create the legacy payment-cycle range only when an enrolment has none. */
  private async ensurePaymentCycles(
    course: Course,
    enrolment: Enrolment,
    paymentCycleStartDateValue: Date,
    finalLessonDate: Date,
    persistence: PermanentScheduleChangeConfirmationPersistence,
  ): Promise<void> {
    const existingCycles = await persistence.findPaymentCycles(enrolment.id);
    if (existingCycles.length > 0) return;

    const paymentCycleStartDate = new Date(paymentCycleStartDateValue);
    const courseStartDate = new Date(course.startDate);
    const courseEndDate = new Date(finalLessonDate);
    const frequencyLength = enrolment.paymentFrequency.frequencyLength;
    const paymentCycleStartMonth = new Date(
      paymentCycleStartDate.getFullYear(),
      paymentCycleStartDate.getMonth(),
      1,
    );
    const courseStartMonth = new Date(
      courseStartDate.getFullYear(),
      courseStartDate.getMonth(),
      1,
    );

    if (paymentCycleStartMonth > courseStartMonth) {
      const initialCycleEnd = new Date(paymentCycleStartMonth);
      initialCycleEnd.setDate(0);
      await this.createPaymentCycle(
        enrolment.id,
        course.id,
        courseStartMonth,
        initialCycleEnd,
        persistence,
      );
    }

    const maximumCycles = Math.floor(24 / frequencyLength);
    let cycleStart = new Date(paymentCycleStartMonth);
    let previousEnd: Date | null = null;
    const courseEndDateKey = this.dateKey(courseEndDate);

    for (let index = 0; index <= maximumCycles; index++) {
      if (index > 0 && previousEnd) {
        cycleStart = new Date(previousEnd);
        cycleStart.setMonth(cycleStart.getMonth() + 1, 1);
      }

      let cycleEnd = new Date(cycleStart);
      cycleEnd.setMonth(cycleEnd.getMonth() + frequencyLength);
      cycleEnd.setDate(0);
      if (this.dateKey(cycleEnd) > courseEndDateKey) {
        cycleEnd = new Date(
          courseEndDate.getFullYear(),
          courseEndDate.getMonth() + 1,
          0,
        );
      }
      previousEnd = cycleEnd;

      if (this.dateKey(cycleStart) < courseEndDateKey) {
        await this.createPaymentCycle(
          enrolment.id,
          course.id,
          cycleStart,
          cycleEnd,
          persistence,
        );
      }
    }
  }

  /** Persist one payment cycle and its lesson links as a single operation. */
  private async createPaymentCycle(
    enrolmentId: number,
    courseId: number,
    startDate: Date,
    endDate: Date,
    persistence: PermanentScheduleChangeConfirmationPersistence,
  ): Promise<void> {
    const cycle = await persistence.savePaymentCycle({
      enrolmentId,
      startDate,
      endDate,
      isDeleted: 0,
      isPreferredPaymentEnabled: false,
    });
    await persistence.createPaymentCycleLessonLinks(
      cycle.id,
      courseId,
      startDate,
      endDate,
    );
  }

  /** Recompute lesson due dates from the enrolment's current payment cycles. */
  private async updateLessonDueDates(
    courseId: number,
    enrolmentId: number,
    persistence: PermanentScheduleChangeConfirmationPersistence,
  ): Promise<void> {
    const [lessons, cycles] = await Promise.all([
      persistence.findConfirmedLessonsForDueDate(courseId),
      persistence.findPaymentCycles(enrolmentId),
    ]);
    const ranges = cycles.map((cycle) => ({
      start: this.dateKey(cycle.startDate),
      end: this.dateKey(cycle.endDate),
      firstLesson: null as Lesson | null,
    }));

    for (const range of ranges) {
      range.firstLesson =
        lessons.find((lesson) => {
          const date = this.dateKey(lesson.date);
          return date >= range.start && date <= range.end;
        }) ?? null;
    }

    const updates: Array<{ lessonId: number; dueDate: Date }> = [];
    for (const lesson of lessons) {
      const lessonDate = this.dateKey(lesson.date);
      const range = ranges.find(
        (candidate) =>
          lessonDate >= candidate.start && lessonDate <= candidate.end,
      );
      if (!range?.firstLesson) continue;

      const dueDate = new Date(
        range.firstLesson.originalDate ?? range.firstLesson.date,
      );
      dueDate.setMonth(dueDate.getMonth() - 1, 1);
      dueDate.setDate(dueDate.getDate() + 14);
      updates.push({ lessonId: lesson.id, dueDate });
    }

    await persistence.updateLessonDueDates(updates);
  }

  /** Convert a date-like value to the stable key used by cycle comparisons. */
  private dateKey(value: Date | string): string {
    return new Date(value).toISOString().split('T')[0];
  }

  /** Render unknown thrown values safely for the existing API error contract. */
  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
