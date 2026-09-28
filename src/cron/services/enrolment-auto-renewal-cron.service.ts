import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource, EntityManager } from 'typeorm';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { PaymentFrequency } from '../../payment/entities/payment-frequency.entity';
import { PaymentCycle } from '../../payment/entities/payment-cycle.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { BOT_USER_ID } from '../../shared/helpers/system-user.helper';
import { getCurrentESTDate } from '../../utils/date-utils';
import { EnrolmentAutoRenewalCronRepository } from '../repositories/enrolment-auto-renewal-cron.repository';
import { isProfessionalDevelopmentDay } from '../../utils/date-utils';
import { CronLockService } from './cron-lock.service';
import { CourseRateResolverService } from '../../pricing/services/course-rate-resolver.service';
import { EnrolmentPrepaidPricingService } from '../../pricing/services/enrolment-prepaid-pricing.service';
import { calculatePaymentCycleDueDate } from '../../payment/utils/payment-cycle-due-date.util';

export interface EnrolmentAutoRenewalCronResult {
  jobName: string;
  triggeredBy: 'scheduler' | 'manual';
  triggeredByUserId: number | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  enrolmentsMatched: number;
  enrolmentsProcessed: number;
  enrolmentsFailed: number;
}

@Injectable()
export class EnrolmentAutoRenewalCronService {
  private readonly logger = new Logger(EnrolmentAutoRenewalCronService.name);
  private readonly jobName = 'enrolment-auto-renewal';
  private readonly cronExpression = '0 0 3 * * *';
  private readonly timeZone = 'America/New_York';

  constructor(
    private readonly repository: EnrolmentAutoRenewalCronRepository,
    private readonly dataSource: DataSource,
    private readonly cronLockService: CronLockService,
    private readonly courseRateResolver: CourseRateResolverService,
    private readonly enrolmentPrepaidPricing: EnrolmentPrepaidPricingService,
  ) {}

  @Cron('0 0 3 * * *', {
    name: 'enrolment-auto-renewal',
    timeZone: 'America/New_York',
  })
  async runScheduled(): Promise<EnrolmentAutoRenewalCronResult | null> {
    return this.run('scheduler', null);
  }

  async runManually(
    triggeredByUserId: number,
  ): Promise<EnrolmentAutoRenewalCronResult | null> {
    return this.run('manual', triggeredByUserId);
  }

  getJobMetadata() {
    return {
      name: this.jobName,
      enabled: true,
      expression: this.cronExpression,
      timeZone: this.timeZone,
      manualTriggerAllowed: true,
      allowedRoles: ['administrator'],
    };
  }

  private async run(
    triggeredBy: 'scheduler' | 'manual',
    triggeredByUserId: number | null,
  ): Promise<EnrolmentAutoRenewalCronResult | null> {
    return this.cronLockService.runWithLock(
      `cron:${this.jobName}`,
      this.jobName,
      this.logger,
      () => this.executeRun(triggeredBy, triggeredByUserId),
    );
  }

  private async executeRun(
    triggeredBy: 'scheduler' | 'manual',
    triggeredByUserId: number | null,
  ): Promise<EnrolmentAutoRenewalCronResult | null> {
    const startedAtDate = new Date();

    this.logger.log(
      `[${this.jobName}] started via ${triggeredBy}${triggeredByUserId ? ` by user ${triggeredByUserId}` : ''}`,
    );

    try {
      const currentDate = this.getCurrentDateKey();
      const renewalThroughDate = this.addDays(currentDate, 90);
      const candidates = await this.repository.getTargetEnrolments(
        currentDate,
        renewalThroughDate,
      );

      let enrolmentsProcessed = 0;
      let enrolmentsFailed = 0;
      for (const candidate of candidates) {
        this.logger.log(
          `[${this.jobName}] processing course ${candidate.courseId}, enrolment ${candidate.enrolmentId}`,
        );
        try {
          await this.runLegacyAutoRenewal(candidate.courseId, BOT_USER_ID);
          enrolmentsProcessed += 1;
        } catch (error) {
          enrolmentsFailed += 1;
          this.logger.error(
            `[${this.jobName}] failed to process course ${candidate.courseId}, enrolment ${candidate.enrolmentId}`,
            error instanceof Error ? error.stack : undefined,
          );
          continue;
        }
      }

      const completedAtDate = new Date();
      const result: EnrolmentAutoRenewalCronResult = {
        jobName: this.jobName,
        triggeredBy,
        triggeredByUserId,
        startedAt: startedAtDate.toISOString(),
        completedAt: completedAtDate.toISOString(),
        durationMs: completedAtDate.getTime() - startedAtDate.getTime(),
        enrolmentsMatched: candidates.length,
        enrolmentsProcessed,
        enrolmentsFailed,
      };

      this.logger.log(
        `[${this.jobName}] completed in ${result.durationMs}ms. Matched=${result.enrolmentsMatched}, Processed=${result.enrolmentsProcessed}, Failed=${result.enrolmentsFailed}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `[${this.jobName}] failed`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private getCurrentDateKey(): string {
    return (
      process.env.SMW_TEST_CURRENT_DATE ||
      this.formatDateKey(getCurrentESTDate())
    ).slice(0, 10);
  }

  private formatDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private addDays(dateKey: string, daysToAdd: number): string {
    const date = new Date(`${dateKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + daysToAdd);
    return date.toISOString().slice(0, 10);
  }

  private async runLegacyAutoRenewal(
    courseId: number,
    userId: number,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const enrolment =
        await this.repository.getLegacyExecutionEnrolmentForCourse(
          courseId,
          manager,
        );

      if (!enrolment) {
        throw new NotFoundException(
          `Enrolment not found for course: ${courseId}`,
        );
      }

      const paymentFrequency = await this.repository.findPaymentFrequencyById(
        enrolment.paymentFrequencyId,
        manager,
      );

      if (!paymentFrequency) {
        throw new BadRequestException(
          `Payment frequency not found for course ${courseId}, enrolment ${enrolment.id}: ${enrolment.paymentFrequencyId}`,
        );
      }

      await this.renewEnrolment(enrolment, paymentFrequency, userId, manager);
    });
  }

  private async renewEnrolment(
    enrolment: Enrolment,
    paymentFrequency: PaymentFrequency,
    userId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const course =
      await this.repository.getCourseWithProgramForLegacyAutoRenewal(
        enrolment.courseId,
        manager,
      );

    if (!course) {
      throw new NotFoundException(`Course not found: ${enrolment.courseId}`);
    }

    const lastPaymentCycle =
      await this.repository.getLastPaymentCycleForLegacyAutoRenewal(
        enrolment.id,
        manager,
      );
    const firstLesson =
      await this.repository.getFirstLessonForLegacyAutoRenewal(
        course.id,
        manager,
      );

    if (!lastPaymentCycle || !firstLesson) {
      return;
    }

    const recentSchedule =
      await this.repository.getRecentCourseScheduleForLegacyAutoRenewal(
        course.id,
        manager,
      );

    if (!recentSchedule) {
      throw new BadRequestException(
        `No recent course schedule found for course ${course.id}`,
      );
    }

    const lastPaymentCycleStartDate = new Date(lastPaymentCycle.startDate);
    const lastPaymentCycleEndDate = new Date(lastPaymentCycle.endDate);
    const lastPaymentCycleMonthCount = this.diffInMonths(
      lastPaymentCycleStartDate,
      lastPaymentCycleEndDate,
    );

    const courseEndDate = new Date(course.endDate);
    const renewalStartDate = new Date(courseEndDate);
    renewalStartDate.setUTCDate(renewalStartDate.getUTCDate() + 1);

    const renewalEndDate = new Date(courseEndDate);
    renewalEndDate.setUTCMonth(renewalEndDate.getUTCMonth() + 25, 0);
    renewalEndDate.setUTCHours(23, 59, 59, 0);

    const teacherRate =
      await this.repository.getTeacherQualificationRateForLegacyAutoRenewal(
        recentSchedule.teacherId,
        course.program.id,
        manager,
      );

    // Previously this wrote ONE rate row spanning the whole 25-month renewal
    // window at the flat program.rate. A single row cannot express a price
    // change part-way through its own span, so it could not represent
    // 1 September 2026 and every run minted old-priced lessons years ahead.
    //
    // Instead, fill only the gaps around any rate period that already exists -
    // which is how the September catalogue reaches a course - carrying the
    // preceding rate forward into each gap.
    const existingCourseRates =
      await this.repository.findCourseProgramRatesForLegacyAutoRenewal(
        course.id,
        manager,
      );

    const plannedRateRows = this.courseRateResolver.planRenewalRateRows(
      existingCourseRates,
      this.formatDateForRate(renewalStartDate),
      this.formatDateForRate(renewalEndDate),
      course.program.rate || 0,
    );

    for (const plannedRow of plannedRateRows) {
      await this.repository.createCourseProgramRateForLegacyAutoRenewal(
        course.id,
        new Date(`${plannedRow.startDate}T00:00:00.000Z`),
        new Date(`${plannedRow.endDate}T00:00:00.000Z`),
        plannedRow.programRate,
        manager,
      );
    }

    const courseRatesForLessons =
      await this.repository.findCourseProgramRatesForLegacyAutoRenewal(
        course.id,
        manager,
      );

    const autoRenewal =
      await this.repository.createAutoRenewalForLegacyAutoRenewal(
        enrolment.id,
        paymentFrequency.id,
        enrolment.endDateTime,
        renewalEndDate,
        lastPaymentCycleStartDate,
        lastPaymentCycleEndDate,
        userId,
        manager,
      );

    const createdLessons: Lesson[] = [];
    const currentDate = new Date(renewalStartDate);
    const endDate = new Date(renewalEndDate);

    while (currentDate < endDate) {
      const dayOfWeek =
        currentDate.getUTCDay() === 0 ? 7 : currentDate.getUTCDay();

      if (dayOfWeek === recentSchedule.day) {
        if (isProfessionalDevelopmentDay(currentDate)) {
          currentDate.setUTCDate(currentDate.getUTCDate() + 1);
          continue;
        }

        const lessonDate = this.applyCourseScheduleTime(
          currentDate,
          recentSchedule.fromTime,
        );

        const lesson = await this.repository.createLessonForLegacyAutoRenewal(
          course.id,
          enrolment.id,
          enrolment.studentId,
          recentSchedule.teacherId,
          lessonDate,
          recentSchedule.duration,
          // Resolved for THIS lesson's date, so a renewal window spanning
          // 1 September prices August lessons at the old rate and September
          // lessons at the new one.
          this.courseRateResolver.selectRateForDate(
            courseRatesForLessons,
            this.formatDateForRate(lessonDate),
          )?.programRate ??
            course.program.rate ??
            0,
          teacherRate,
          enrolment.isOnline || 0,
          userId,
          manager,
        );

        await this.repository.createAutoRenewalLessonForLegacyAutoRenewal(
          autoRenewal.id,
          lesson.id,
          userId,
          manager,
        );

        createdLessons.push(lesson);
      }

      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    await this.repository.createPrivateLessonsForLegacyAutoRenewal(
      createdLessons,
      manager,
    );

    const recentScheduleEndDate = new Date(renewalStartDate);
    recentScheduleEndDate.setUTCDate(recentScheduleEndDate.getUTCDate() - 1);

    await this.repository.updateCourseScheduleEndDateForLegacyAutoRenewal(
      recentSchedule.id,
      recentScheduleEndDate,
      manager,
    );
    await this.repository.updateCourseScheduleIsRecentForLegacyAutoRenewal(
      recentSchedule.id,
      false,
      manager,
    );

    if (createdLessons.length > 0) {
      const lastLessonGenerated = createdLessons[createdLessons.length - 1];
      await this.repository.createCourseScheduleForLegacyAutoRenewal(
        course.id,
        lastLessonGenerated,
        renewalStartDate,
        renewalEndDate,
        manager,
      );
    }

    let paymentCycles: PaymentCycle[] = [];
    if (lastPaymentCycleMonthCount !== paymentFrequency.frequencyLength) {
      const adjustedEndDate = new Date(lastPaymentCycleStartDate);
      adjustedEndDate.setUTCMonth(
        adjustedEndDate.getUTCMonth() + paymentFrequency.frequencyLength,
      );
      adjustedEndDate.setUTCDate(adjustedEndDate.getUTCDate() - 1);

      await this.repository.updatePaymentCycleEndDateForLegacyAutoRenewal(
        lastPaymentCycle.id,
        adjustedEndDate,
        manager,
      );

      const nextPaymentCycleStartDate = new Date(adjustedEndDate);
      nextPaymentCycleStartDate.setUTCDate(
        nextPaymentCycleStartDate.getUTCDate() + 1,
      );

      paymentCycles = await this.setAutoRenewalPaymentCycle(
        enrolment.id,
        course.id,
        nextPaymentCycleStartDate,
        renewalEndDate,
        paymentFrequency,
        autoRenewal.id,
        userId,
        manager,
      );
    } else {
      paymentCycles = await this.setAutoRenewalPaymentCycle(
        enrolment.id,
        course.id,
        renewalStartDate,
        renewalEndDate,
        paymentFrequency,
        autoRenewal.id,
        userId,
        manager,
      );
    }

    await this.setDueDate(enrolment.id, manager);

    await this.repository.updateCourseAndEnrolmentDatesFromLessonsForLegacyAutoRenewal(
      course.id,
      enrolment.id,
      manager,
    );

    // Price the cycles this renewal has just created.
    //
    // Renewal is the second place payment cycles come into existence - the
    // first is enrolment confirmation - and without this a prepaid enrolment
    // would be billed the published total for its original term and then
    // silently revert to the monthly rate the moment it renewed. Nobody would
    // connect the two: the change arrives on a schedule, months later, on an
    // enrolment nobody touched.
    //
    // Last, after the lesson dates and the course dates are final, because the
    // reduction is `gross - payable` read off each lesson.
    //
    // Failure is logged inside the service and never propagates. A cron that
    // renews a hundred enrolments must not abandon the rest because one of them
    // has a duration the catalogue never priced.
    await this.enrolmentPrepaidPricing.applyForEnrolment(
      {
        enrolmentId: enrolment.id,
        frequencyLength: paymentFrequency.frequencyLength,
      },
      manager,
    );
  }

  private async setAutoRenewalPaymentCycle(
    enrolmentId: number,
    courseId: number,
    startDate: Date,
    endDate: Date,
    paymentFrequency: PaymentFrequency,
    autoRenewalId: number,
    userId: number,
    manager?: EntityManager,
  ): Promise<PaymentCycle[]> {
    const normalizedStartDate = new Date(startDate);
    normalizedStartDate.setUTCDate(1);
    normalizedStartDate.setUTCHours(0, 0, 0, 0);

    let currentStartDate = new Date(normalizedStartDate);
    const paymentCycles: PaymentCycle[] = [];
    const paymentCycleCount = Math.floor(23 / paymentFrequency.frequencyLength);

    for (let i = 0; i <= paymentCycleCount; i += 1) {
      const cycleEndDate = new Date(currentStartDate);
      cycleEndDate.setUTCMonth(
        cycleEndDate.getUTCMonth() + paymentFrequency.frequencyLength,
        0,
      );

      const paymentCycle =
        await this.repository.createPaymentCycleForLegacyAutoRenewal(
          enrolmentId,
          courseId,
          currentStartDate,
          cycleEndDate,
          manager,
        );

      paymentCycles.push(paymentCycle);

      await this.repository.createAutoRenewalPaymentCycleForLegacyAutoRenewal(
        autoRenewalId,
        paymentCycle.id,
        userId,
        manager,
      );

      if (i !== paymentCycleCount) {
        currentStartDate = new Date(cycleEndDate);
        currentStartDate.setUTCMonth(currentStartDate.getUTCMonth(), 1);
        currentStartDate.setUTCHours(0, 0, 0, 0);
        currentStartDate.setUTCMonth(currentStartDate.getUTCMonth() + 1);
      }
    }

    return paymentCycles;
  }

  private applyCourseScheduleTime(date: Date, fromTime: string): Date {
    const lessonDate = new Date(date);
    const [hours, minutes, seconds = '0'] = fromTime.split(':');

    lessonDate.setUTCHours(Number(hours), Number(minutes), Number(seconds), 0);

    return lessonDate;
  }

  /** Rate periods are date columns; format as a plain calendar day in UTC. */
  private formatDateForRate(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private diffInMonths(date1: Date, date2: Date): number {
    const start = new Date(
      Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate()),
    );
    const end = new Date(
      Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate()),
    );

    if (end.getTime() <= start.getTime()) {
      return 0;
    }

    let months =
      (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (end.getUTCMonth() - start.getUTCMonth());

    let anchor = new Date(start.getTime());
    anchor.setUTCMonth(anchor.getUTCMonth() + months);

    if (anchor.getTime() > end.getTime()) {
      months -= 1;
    }

    return Math.max(months, 0);
  }

  private async setDueDate(
    enrolmentId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const lessonsWithCycles =
      await this.repository.getConfirmedLessonsForLegacyAutoRenewalEnrolment(
        enrolmentId,
        manager,
      );

    const lessonsByCycle = new Map<
      number,
      { startDate: Date | string; lessons: Lesson[] }
    >();
    for (const {
      lesson,
      paymentCycleId,
      paymentCycleStartDate,
    } of lessonsWithCycles) {
      if (!paymentCycleId || !paymentCycleStartDate) {
        continue;
      }
      if (!lessonsByCycle.has(paymentCycleId)) {
        lessonsByCycle.set(paymentCycleId, {
          startDate: paymentCycleStartDate,
          lessons: [],
        });
      }
      lessonsByCycle.get(paymentCycleId)!.lessons.push(lesson);
    }

    for (const { startDate, lessons } of lessonsByCycle.values()) {
      const dueDate = calculatePaymentCycleDueDate(
        startDate,
        lessons.map((lesson) => lesson.originalDate ?? lesson.date),
      );

      for (const lesson of lessons) {
        await this.repository.updateLessonDueDateForLegacyAutoRenewal(
          lesson.id,
          dueDate,
          manager,
        );
      }
    }
  }
}
