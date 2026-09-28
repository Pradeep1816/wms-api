import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EnrolmentPaymentFrequencyDataDto } from '../dto/enrolment-payment-frequency-response.dto';
import { EnrolmentPaymentFrequencyRepository } from '../repositories/enrolment-payment-frequency.repository';
import { ChangePaymentFrequencyRequestDto } from '../dto/change-payment-frequency-request.dto';
import { Enrolment } from '../entities/enrolment.entity';
import { PaymentFrequency } from '../../payment/entities/payment-frequency.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { PaymentCycle } from '../../payment/entities/payment-cycle.entity';
import { DataSource, EntityManager } from 'typeorm';
import { EnrolmentCatalogueRateService } from '../../pricing/services/enrolment-catalogue-rate.service';
import { EnrolmentPrepaidPricingService } from '../../pricing/services/enrolment-prepaid-pricing.service';
import { CustomerBalanceRecalculatorService } from '../../shared/services/customer-balance-recalculator.service';
import { isProfessionalDevelopmentDay } from '../../utils/date-utils';
import { calculatePaymentCycleDueDate } from '../../payment/utils/payment-cycle-due-date.util';

@Injectable()
export class EnrolmentPaymentFrequencyService {
  constructor(
    private readonly enrolmentPaymentFrequencyRepository: EnrolmentPaymentFrequencyRepository,
    private readonly dataSource: DataSource,
    private readonly enrolmentCatalogueRate: EnrolmentCatalogueRateService,
    private readonly enrolmentPrepaidPricing: EnrolmentPrepaidPricingService,
    private readonly customerBalanceRecalculatorService: CustomerBalanceRecalculatorService,
  ) {}

  /**
   * Get payment frequency for an enrolment
   */
  async getPaymentFrequency(
    locationId: number,
    enrolmentId: number,
  ): Promise<EnrolmentPaymentFrequencyDataDto> {
    try {
      const enrolment = await this.enrolmentPaymentFrequencyRepository.getEnrolmentWithPaymentFrequency(
        enrolmentId,
        locationId,
      );

      if (!enrolment) {
        throw new NotFoundException(`Enrolment not found: ${enrolmentId}`);
      }

      // The date the edit form opens on is TODAY, never the stored one.
      //
      // `paymentCycleStartDate` records when the frequency last took effect. It
      // was being returned as the form's default, so opening the form offered
      // the date the frequency was originally set - years ago on most
      // enrolments. Arcadia reported it on 2026-09-01: setting an enrolment to
      // monthly from 1 September 2026, the form opened on July 2025, and they
      // noted it as a fault that had been seen and fixed once before.
      //
      // Legacy cannot show a stored date at all.
      // `EnrolmentPaymentFrequencyController::actionChangePaymentFrequency`
      // builds a fresh model every time and sets today:
      //
      //   $enrolmentPaymentFrequency = new EnrolmentPaymentFrequency();
      //   $enrolmentPaymentFrequency->effectiveDate = (new \DateTime())->format('M d,Y');
      //
      // and `effectiveDate` there is `public $effectiveDate`, a virtual form
      // attribute that is never persisted. The link to `paymentCycleStartDate`
      // is something this port introduced.
      //
      // The `else` branch that used to hold this behaviour was unreachable:
      // every enrolment has exactly one payment-frequency row, so the stored
      // date always won. 3,257 of 3,731 active enrolments opened on a past
      // date, 2,397 of them on a past year.
      //
      // History is still readable - the row is untouched, and the schedule and
      // payment cycles show when each frequency actually applied. What changes
      // is only what the form suggests, which is a fresh decision every time.
      const effectiveDate = this.formatDateToString(new Date());

      return {
        body: {
          id: enrolment.id,
          paymentFrequencyId: enrolment.paymentFrequency?.id,
          paymentFrequency: enrolment.paymentFrequency?.name || '',
          effectiveDate,
        },
      };
    } catch (error) {
      console.error('Error in getPaymentFrequency service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve payment frequency: ${error.message}`);
    }
  }

  /**
   * Change payment frequency for an enrolment
   * Matches legacy: EnrolmentPaymentFrequencyController::actionChangePaymentFrequency()
   * 
   * Legacy behavior (from SQL queries analysis):
   * 1. Checks if course end date < last payment cycle end date
   *    - If true: Triggers auto-renewal (creates new rates, lessons, schedules, extends course/enrolment dates)
   * 2. Always calls resetPaymentCycle() which:
   *    - Deletes payment cycles from effective date onwards
   *    - Updates last payment cycle end date to last day of previous month
   *    - Creates new payment cycles based on new payment frequency
   *    - Updates lesson due dates
   * 3. Updates enrolment paymentFrequencyId
   * 4. Creates/updates EnrolmentPaymentFrequency record
   * 
   * Current implementation executes the full write flow in a single transaction
   * to avoid partial billing updates.
   */
  async changePaymentFrequency(
    locationId: number,
    enrolmentId: number,
    data: ChangePaymentFrequencyRequestDto,
    userId: number,
  ): Promise<{ id: number; paymentFrequencyId: number; paymentFrequency: string; effectiveDate: string }> {
    try {
      const paymentFrequency = await this.enrolmentPaymentFrequencyRepository.findPaymentFrequencyById(
        data.paymentFrequencyId,
      );
      if (!paymentFrequency) {
        throw new BadRequestException(`Payment frequency not found: ${data.paymentFrequencyId}`);
      }

      // Parse effective date from request and convert to first day of selected month
      const effectiveDateParsed = this.parseEffectiveDate(data.effectiveDate);
      if (!effectiveDateParsed) {
        throw new BadRequestException(`Invalid effective date format: ${data.effectiveDate}`);
      }

      // Convert to first day of the selected month and year
      const effectiveDate = new Date(
        effectiveDateParsed.getFullYear(),
        effectiveDateParsed.getMonth(),
        1,
      );
      const paymentCycleStartDate = effectiveDate;

    await this.dataSource.transaction(async (manager) => {
      // Get enrolment with payment cycles for reset logic
      const enrolmentWithCycles = await this.enrolmentPaymentFrequencyRepository.getEnrolmentWithPaymentCycles(
        enrolmentId,
        locationId,
        manager,
      );

      if (!enrolmentWithCycles) {
        throw new NotFoundException(`Enrolment not found: ${enrolmentId}`);
      }

      // Check if auto-renewal is needed (legacy: if courseEndDate < nextCycleStartDate)
      const courseEndDate = new Date(enrolmentWithCycles.course.endDate);
      const nextCycleStartDate = new Date(
        effectiveDate.getFullYear(),
        effectiveDate.getMonth() + paymentFrequency.frequencyLength,
        1, // First day of the next payment cycle
      );

      if (courseEndDate < nextCycleStartDate) {
        // Trigger auto-renewal (legacy: AutoRenewal::renewEnrolment())
        await this.renewEnrolment(enrolmentWithCycles, paymentFrequency, userId, manager);
      }

      // Update enrolment paymentFrequencyId
      await this.enrolmentPaymentFrequencyRepository.updateEnrolmentPaymentFrequency(
        enrolmentId,
        paymentFrequency.id,
        userId,
        manager,
      );

      // Find or create EnrolmentPaymentFrequency record
      await this.enrolmentPaymentFrequencyRepository.findOrCreateEnrolmentPaymentFrequency(
        enrolmentId,
        paymentFrequency.id,
        paymentCycleStartDate,
        userId,
        manager,
      );

      // Reset payment cycles (critical for billing)
      await this.resetPaymentCycles(
        enrolmentId,
        enrolmentWithCycles,
        paymentCycleStartDate,
        paymentFrequency,
        manager,
      );

      // Put the rebuilt cycles onto the published prepaid prices.
      //
      // Changing the payment frequency is the fourth place payment cycles come
      // into existence - the others are enrolment confirmation, auto-renewal
      // and a pricing-basis change - and it was the one prepaid pricing missed.
      // A tiered enrolment moved from Monthly to Semi-Annually got its six-month
      // cycles and then billed them lesson by lesson instead of the published
      // $827.00.
      //
      // It also covers the reverse: moving BACK to Monthly clears the prepaid
      // rows, because the service removes them for any enrolment that no longer
      // qualifies.
      //
      // Last, after the cycles and their lesson links exist. Failures are caught
      // and logged inside the service - a pricing lookup that cannot answer must
      // not fail the frequency change.
      await this.enrolmentPrepaidPricing.applyForEnrolment(
        {
          enrolmentId,
          frequencyLength: paymentFrequency.frequencyLength,
        },
        manager,
      );

      // The schedule owing marker reads the persisted customer-account balance.
      // Rebuilding payment cycles changes lesson due dates, and prepaid pricing
      // can also change lesson totals, so the old account balance is stale until
      // it is recalculated. Keep this in the same transaction so the cycles,
      // prices, and balance either all succeed or all roll back together.
      const customerId = enrolmentWithCycles.student?.customerId;
      if (customerId) {
        await this.customerBalanceRecalculatorService.recalculateAndPersist(
          customerId,
          {
            manager,
            updatedByUserId: userId,
          },
        );
      }
      });

      // Format effective date for response (MMM dd, yyyy format)
      const effectiveDateFormatted = this.formatDateToString(effectiveDate);

      return {
        id: enrolmentId,
        paymentFrequencyId: paymentFrequency.id,
        paymentFrequency: paymentFrequency.name,
        effectiveDate: effectiveDateFormatted,
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to change payment frequency: ${error.message}`);
    }
  }

  /**
   * Reset payment cycles based on new payment frequency
   * Matches legacy: EnrolmentPaymentFrequency::resetPaymentCycle()
   */
  private async resetPaymentCycles(
    enrolmentId: number,
    enrolment: Enrolment,
    effectiveDate: Date,
    paymentFrequency: PaymentFrequency,
    manager?: EntityManager,
  ): Promise<void> {
    // Get course end date
    const courseEndDate = new Date(enrolment.course.endDate);

    // Calculate interval in months between effective date and course end date
    const intervalMonths = this.diffInMonths(effectiveDate, courseEndDate);

    // Delete payment cycles from effective date onwards
    await this.enrolmentPaymentFrequencyRepository.deletePaymentCyclesFromDate(
      enrolmentId,
      effectiveDate,
      manager,
    );

    // Get last payment cycle (before deletion)
    const lastPaymentCycle = await this.enrolmentPaymentFrequencyRepository.getLastPaymentCycle(
      enrolmentId,
      manager,
    );

    // Update last payment cycle end date to last day of previous month (legacy pattern: clone/delete)
    if (lastPaymentCycle) {
      const lastDayOfPreviousMonth = new Date(
        effectiveDate.getFullYear(),
        effectiveDate.getMonth(),
        0, // Last day of previous month
      );

      // Legacy pattern: update end date, clone, then delete old one
      await this.enrolmentPaymentFrequencyRepository.updatePaymentCycleEndDate(
        lastPaymentCycle.id,
        lastDayOfPreviousMonth,
        manager,
      );

      // Ensure clone receives the adjusted end date, not stale in-memory data.
      lastPaymentCycle.endDate = lastDayOfPreviousMonth;

      // Clone the payment cycle (legacy pattern).
      const clonedCycle = await this.enrolmentPaymentFrequencyRepository.clonePaymentCycle(
        lastPaymentCycle,
        manager,
      );

      // Legacy parity: cloned boundary cycle must relink lessons by date range.
      await this.enrolmentPaymentFrequencyRepository.linkLessonsToPaymentCycle(
        clonedCycle.id,
        enrolment.course.id,
        new Date(clonedCycle.startDate),
        new Date(clonedCycle.endDate),
        manager,
      );

      // Delete the old one (soft delete)
      await this.enrolmentPaymentFrequencyRepository.deletePaymentCycle(lastPaymentCycle.id, manager);
    }

    // Create new payment cycles based on payment frequency
    const paymentCycleCount = Math.floor(intervalMonths / paymentFrequency.frequencyLength);

    let cycleStartDate = new Date(effectiveDate);
    let cycleEndDate: Date | null = null;

    // Collect all cycles to create first
    const cyclesToCreate: Array<{ enrolmentId: number; startDate: Date; endDate: Date }> = [];

    for (let i = 0; i <= paymentCycleCount; i++) {
      if (i > 0 && cycleEndDate) {
        // Move to first day of next month from previous end date
        cycleStartDate = new Date(
          cycleEndDate.getFullYear(),
          cycleEndDate.getMonth() + 1,
          1, // First day of next month
        );
      }

      // Calculate end date: startDate + frequencyLength months - 1 day, then last day of that month
      const tempDate = new Date(
        cycleStartDate.getFullYear(),
        cycleStartDate.getMonth() + paymentFrequency.frequencyLength,
        0, // Last day of the month (month + frequencyLength, day 0 = last day of previous month)
      );

      // Format as last day of that month (Y-m-t equivalent)
      cycleEndDate = new Date(
        tempDate.getFullYear(),
        tempDate.getMonth() + 1,
        0, // Last day of the month
      );

      // Don't extend beyond course end date
      const courseEndDateLastDay = new Date(
        courseEndDate.getFullYear(),
        courseEndDate.getMonth() + 1,
        0, // Last day of course end month
      );

      if (courseEndDateLastDay < cycleEndDate) {
        cycleEndDate = courseEndDateLastDay;
      }

      // Only create cycle if it's within course date range
      if (courseEndDate > cycleStartDate) {
        cyclesToCreate.push({
          enrolmentId,
          startDate: cycleStartDate,
          endDate: cycleEndDate,
        });
      }
    }

    const createdCycles: PaymentCycle[] = [];
    for (const cycle of cyclesToCreate) {
      createdCycles.push(
        await this.enrolmentPaymentFrequencyRepository.createPaymentCycle(
          cycle.enrolmentId,
          cycle.startDate,
          cycle.endDate,
          manager,
        ),
      );
    }

    for (let i = 0; i < createdCycles.length; i++) {
      const createdCycle = createdCycles[i];
      const cycle = cyclesToCreate[i];

      if (createdCycle && createdCycle.id) {
        await this.enrolmentPaymentFrequencyRepository.linkLessonsToPaymentCycle(
          createdCycle.id,
          enrolment.course.id,
          cycle.startDate,
          cycle.endDate,
          manager,
        );
      }
    }

    // Legacy parity: refresh due dates for all linked lessons, including the cloned boundary cycle.
    await this.setDueDate(enrolmentId, manager);
  }

  /**
   * Set due dates for lessons based on payment cycles
   * Matches legacy: Enrolment::setDueDate()
   */
  private async setDueDate(enrolmentId: number, manager?: EntityManager): Promise<void> {
    try {
      const lessonsWithCycles = await this.enrolmentPaymentFrequencyRepository.getConfirmedLessonsForEnrolment(
        enrolmentId,
        manager,
      );

      // Group lessons with the boundary that determines their billing date.
      const lessonsByCycle = new Map<
        number,
        { startDate: Date | string; lessons: Lesson[] }
      >();
      
      for (const {
        lesson,
        paymentCycleId,
        paymentCycleStartDate,
      } of lessonsWithCycles) {
        if (paymentCycleId && paymentCycleStartDate) {
          if (!lessonsByCycle.has(paymentCycleId)) {
            lessonsByCycle.set(paymentCycleId, {
              startDate: paymentCycleStartDate,
              lessons: [],
            });
          }
          lessonsByCycle.get(paymentCycleId)!.lessons.push(lesson);
        }
      }

      // The cycle boundary prevents an earlier moved occurrence from pulling
      // billing forward. A later first occurrence delays billing until the
      // month before service actually begins.
      for (const { startDate, lessons } of lessonsByCycle.values()) {
        const dueDate = calculatePaymentCycleDueDate(
          startDate,
          lessons.map((lesson) => lesson.originalDate ?? lesson.date),
        );

        for (const lesson of lessons) {
          await this.enrolmentPaymentFrequencyRepository.updateLessonDueDate(
            lesson.id,
            dueDate,
            manager,
          );
        }
      }
    } catch (error) {
      console.error('Error in setDueDate:', error);
      throw error;
    }
  }

  /**
   * Calculate difference in months between two dates
   * Matches legacy: EnrolmentPaymentFrequency::diffInMonths()
   */
  private diffInMonths(date1: Date, date2: Date): number {
    const start = new Date(Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate()));
    const end = new Date(Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate()));

    if (end.getTime() <= start.getTime()) {
      return 0;
    }

    let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12
      + (end.getUTCMonth() - start.getUTCMonth());

    let anchor = new Date(start.getTime());
    anchor.setUTCMonth(anchor.getUTCMonth() + months);

    if (anchor.getTime() > end.getTime()) {
      months -= 1;
      anchor = new Date(start.getTime());
      anchor.setUTCMonth(anchor.getUTCMonth() + months);
    }

    const remainingDays = Math.floor((end.getTime() - anchor.getTime()) / (24 * 60 * 60 * 1000));
    return months + Math.floor(remainingDays / 30);
  }

  /**
   * Parse effective date from "MMM dd, yyyy" format
   * Example: "Dec 01, 2025" -> Date object
   */
  private parseEffectiveDate(dateString: string): Date | null {
    try {
      // Parse format like "Dec 01, 2025" or "Dec 1, 2025"
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return null;
      }
      // Verify the parsed date makes sense (not too far in past/future)
      const year = date.getFullYear();
      if (year < 2000 || year > 2100) {
        return null;
      }
      return date;
    } catch {
      return null;
    }
  }

  /**
   * Format date to "MMM dd, yyyy" format
   * Example: Date -> "Dec 01, 2025"
   */
  private formatDateToString(date: Date): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${month} ${day}, ${year}`;
  }

  /**
   * Auto-renew enrolment when course end date < last payment cycle end date
   * Matches legacy: AutoRenewal::renewEnrolment()
   */
  private async renewEnrolment(
    enrolment: Enrolment,
    paymentFrequency: PaymentFrequency,
    userId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const course = await this.enrolmentPaymentFrequencyRepository.getCourseWithProgram(
      enrolment.courseId,
      manager,
    );

    if (!course) {
      throw new NotFoundException(`Course not found: ${enrolment.courseId}`);
    }

    // Get last payment cycle and first lesson
    const lastPaymentCycle = await this.enrolmentPaymentFrequencyRepository.getLastPaymentCycle(
      enrolment.id,
      manager,
    );
    const firstLesson = await this.enrolmentPaymentFrequencyRepository.getFirstLessonForCourse(
      course.id,
      manager,
    );

    if (!lastPaymentCycle || !firstLesson) {
      throw new BadRequestException(`Missing payment cycle or lesson context for enrolment ${enrolment.id}`);
    }

    // Calculate dates
    const lastPaymentCycleStartDate = new Date(lastPaymentCycle.startDate);
    const lastPaymentCycleEndDate = new Date(lastPaymentCycle.endDate);
    const lastPaymentCycleMonthCount = this.diffInMonths(
      lastPaymentCycleStartDate,
      lastPaymentCycleEndDate,
    );

    const courseEndDate = new Date(course.endDate);
    const renewalStartDate = new Date(courseEndDate);
    renewalStartDate.setDate(renewalStartDate.getDate() + 1);

    const renewalEndDate = new Date(courseEndDate);
    // Matches legacy: addMonths(24)->endOfMonth()
    renewalEndDate.setMonth(renewalEndDate.getMonth() + 25, 0);

    const teacherRate = await this.enrolmentPaymentFrequencyRepository.getTeacherQualificationRate(
      course.teacherId,
      course.program.id,
      manager,
    );

    // Read before the rate is decided, because the lesson length is part of the
    // price. It is a pure read and was previously fetched a few lines below.
    const recentSchedule = await this.enrolmentPaymentFrequencyRepository.getRecentCourseSchedule(
      course.id,
      manager,
    );

    if (!recentSchedule) {
      throw new BadRequestException(`No recent course schedule found for course ${course.id}`);
    }

    // The rate the extension is priced at.
    //
    // This used to be `course.program.rate` - the program's list price, from
    // before tiers existed; this file dates from April 2026. On a tiered
    // enrolment that silently reverted every extension lesson to the
    // pre-September rate: $32.50 against the $36.25 the enrolment was sold at,
    // on every lesson created, with nothing flagged.
    //
    // Confirmed with Rachit on 2026-08-24: extending is expected, and the
    // extension must follow the tier when one applies.
    //
    // ## Only when a tier applies
    //
    // The catalogue is asked ONLY when someone actually chose a tier for this
    // enrolment. It used to be asked for every enrolment, and
    // `hourlyRateFor()` answers a missing tier with `DEFAULT_PRICING_TIER` -
    // Tier 1 - so an enrolment nobody had classified was quietly moved onto
    // September pricing the first time it was extended.
    //
    // That was harmless while the rollout was two pilot schools, because the
    // rollout gate inside `hourlyRateFor()` returned `null` everywhere else.
    // Opening the structure to every location removed that gate, and the tier
    // fallback became reachable estate-wide. Arcadia reported it on
    // 2026-09-01: a Burlington enrolment held on the legacy $130 rate moved to
    // $145 on being switched to monthly, with no one having touched its
    // pricing. 4,336 enrolments carry no tier and no held-rate flag, 3,406 of
    // them auto-renewing.
    //
    // Arcadia's rule, in their own words: there should be no price change
    // unless the school makes one through Change Pricing. So an enrolment with
    // no tier carries its own rate forward, and only an explicit tier reads
    // the catalogue. Enrolment CREATION is unaffected - a new enrolment still
    // defaults to Tier 1 and records `pricingTierIsDefaulted`.
    const extensionStartDay = [
      renewalStartDate.getFullYear(),
      String(renewalStartDate.getMonth() + 1).padStart(2, '0'),
      String(renewalStartDate.getDate()).padStart(2, '0'),
    ].join('-');

    // What the course already charges. Also the right answer for a held
    // enrolment, which `hourlyRateFor()` declines to price - that case used to
    // fall through to the program list price and lose a negotiated rate.
    const heldRate =
      await this.enrolmentPaymentFrequencyRepository.findRateInEffectBefore(
        course.id,
        extensionStartDay,
        manager,
      );

    const catalogueRate =
      enrolment.pricingTier === null || enrolment.pricingTier === undefined
        ? null
        : await this.enrolmentCatalogueRate.hourlyRateFor({
            locationId: course.locationId,
            programId: course.program.id,
            duration: recentSchedule.duration,
            effectiveDate: extensionStartDay,
            pricingTier: enrolment.pricingTier,
            keepsPreviousRate: enrolment.keepsPreviousRate,
          });

    const extensionRate = catalogueRate ?? heldRate ?? course.program.rate ?? 0;

    // 1. Create CourseProgramRate
    await this.enrolmentPaymentFrequencyRepository.createCourseProgramRate(
      course.id,
      renewalStartDate,
      renewalEndDate,
      extensionRate,
      manager,
    );

    // 2. Create AutoRenewal record
    const autoRenewal = await this.enrolmentPaymentFrequencyRepository.createAutoRenewal(
      enrolment.id,
      paymentFrequency.id,
      enrolment.endDateTime,
      renewalEndDate,
      lastPaymentCycleStartDate,
      lastPaymentCycleEndDate,
      userId,
      manager,
    );

    // 4. Create lessons for each matching day
    const createdLessons: Lesson[] = [];
    const currentDate = new Date(renewalStartDate);
    const endDate = new Date(renewalEndDate);

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay() === 0 ? 7 : currentDate.getDay(); // Convert Sunday=0 to Sunday=7

      if (dayOfWeek === recentSchedule.day) {
        if (isProfessionalDevelopmentDay(currentDate)) {
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        const lessonDate = new Date(currentDate);
        const [hours, minutes, seconds] = recentSchedule.fromTime.split(':');
        lessonDate.setHours(parseInt(hours), parseInt(minutes), parseInt(seconds || '0'));

        const lesson = await this.enrolmentPaymentFrequencyRepository.createLessonForAutoRenewal(
          course.id,
          enrolment.id,
          enrolment.studentId,
          course.teacherId,
          lessonDate,
          recentSchedule.duration,
          extensionRate,
          teacherRate,
          course.isOnline || 0,
          userId,
          manager,
        );

        // Create AutoRenewalLessons record
        await this.enrolmentPaymentFrequencyRepository.createAutoRenewalLesson(
          autoRenewal.id,
          lesson.id,
          userId,
          manager,
        );

        createdLessons.push(lesson);
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    await this.enrolmentPaymentFrequencyRepository.createPrivateLessonsForAutoRenewal(
      createdLessons,
      manager,
    );

    // 5. Update old course schedule to match legacy behavior
    const recentScheduleEndDate = new Date(renewalStartDate);
    recentScheduleEndDate.setDate(recentScheduleEndDate.getDate() - 1);

    await this.enrolmentPaymentFrequencyRepository.updateCourseScheduleEndDate(
      recentSchedule.id,
      recentScheduleEndDate,
      manager,
    );

    await this.enrolmentPaymentFrequencyRepository.updateCourseScheduleIsRecent(
      recentSchedule.id,
      false,
      manager,
    );

    // 6. Create new course schedule
    if (createdLessons.length > 0) {
      await this.enrolmentPaymentFrequencyRepository.createCourseSchedule(
        course.id,
        recentSchedule.fromTime,
        recentSchedule.duration,
        recentSchedule.day,
        renewalStartDate,
        renewalEndDate,
        course.teacherId,
        manager,
      );
    }

    // 7. Create payment cycles and link lessons
    let paymentCycles: PaymentCycle[] = [];
    if (lastPaymentCycleMonthCount !== paymentFrequency.frequencyLength) {
      // Adjust last payment cycle end date
      const adjustedEndDate = new Date(lastPaymentCycleStartDate);
      adjustedEndDate.setMonth(adjustedEndDate.getMonth() + paymentFrequency.frequencyLength);
      adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);

      await this.enrolmentPaymentFrequencyRepository.updatePaymentCycleEndDate(
        lastPaymentCycle.id,
        adjustedEndDate,
        manager,
      );

      const nextPaymentCycleStartDate = new Date(adjustedEndDate);
      nextPaymentCycleStartDate.setDate(nextPaymentCycleStartDate.getDate() + 1);

      paymentCycles = await this.setAutoRenewalPaymentCycle(
        enrolment.id,
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
        renewalStartDate,
        renewalEndDate,
        paymentFrequency,
        autoRenewal.id,
        userId,
        manager,
      );
    }

    // Link lessons to payment cycles
    for (const lesson of createdLessons) {
      const lessonDate = new Date(lesson.date);
      for (const paymentCycle of paymentCycles) {
        const cycleStart = new Date(paymentCycle.startDate);
        const cycleEnd = new Date(paymentCycle.endDate);
        if (lessonDate >= cycleStart && lessonDate <= cycleEnd) {
          await this.enrolmentPaymentFrequencyRepository.createPaymentCycleLesson(
            paymentCycle.id,
            lesson.id,
            manager,
          );
          break;
        }
      }
    }

    // 8. Update course and enrolment dates
    await this.enrolmentPaymentFrequencyRepository.updateCourseEndDate(
      course.id,
      renewalEndDate,
      manager,
    );
    course.endDate = renewalEndDate;
    if (enrolment.course) {
      enrolment.course.endDate = renewalEndDate;
    }
    enrolment.endDateTime = renewalEndDate;
    await this.enrolmentPaymentFrequencyRepository.updateEnrolmentEndDate(
      enrolment.id,
      renewalEndDate,
      manager,
    );
  }

  /**
   * Set auto-renewal payment cycles
   * Matches legacy: Enrolment::setAutoRenewalPaymentCycle()
   */
  private async setAutoRenewalPaymentCycle(
    enrolmentId: number,
    startDate: Date,
    endDate: Date,
    paymentFrequency: PaymentFrequency,
    autoRenewalId: number,
    userId: number,
    manager?: EntityManager,
  ): Promise<PaymentCycle[]> {
    const normalizedStartDate = new Date(startDate);
    normalizedStartDate.setDate(1);

    let currentStartDate = new Date(normalizedStartDate);
    const paymentCycles: PaymentCycle[] = [];

    while (currentStartDate < endDate) {
      const cycleEndDate = new Date(currentStartDate);
      cycleEndDate.setMonth(
        cycleEndDate.getMonth() + paymentFrequency.frequencyLength,
        0,
      );

      if (cycleEndDate > endDate) {
        cycleEndDate.setTime(endDate.getTime());
      }

      const paymentCycle = await this.enrolmentPaymentFrequencyRepository.createPaymentCycleForAutoRenewal(
        enrolmentId,
        currentStartDate,
        cycleEndDate,
        manager,
      );

      paymentCycles.push(paymentCycle);

      // Link to auto-renewal
      await this.enrolmentPaymentFrequencyRepository.createAutoRenewalPaymentCycle(
        autoRenewalId,
        paymentCycle.id,
        userId,
        manager,
      );

      // Move to next cycle
      currentStartDate = new Date(cycleEndDate);
      currentStartDate.setDate(currentStartDate.getDate() + 1);
    }

    return paymentCycles;
  }
}
