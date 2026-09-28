import { Injectable } from '@nestjs/common';
import { Lesson } from '../../entities/lesson.entity';
import { ScheduleInfo } from '../../dto/lesson-details-response.dto';
import { formatDate, formatLongDateUTC } from '../../../utils/date-utils';
import {
  formatEasternTime,
  formatDuration,
  formatCurrency,
} from '../../../utils/formatters';
import { RoundingUtils } from '../../../utils/rounding.utils';

import { LessonDiscount } from '../../entities/lesson-discount.entity';
import { ProgramTypeEnum } from '../../../program/enums/program-type';
import { LessonStatusEnum } from '../../enums/lesson-status';
import { prepaidReduction } from '../../utils/prepaid-reduction';

@Injectable()
export class LessonScheduleTransformationService {
  transformToScheduleInfo(lesson: Lesson): ScheduleInfo {
    const lessonDate = lesson.date ? new Date(lesson.date) : null;
    const originalLessonDate = lesson.originalDate
      ? new Date(lesson.originalDate)
      : lessonDate;
    const expiryDate = lesson.privateLesson?.[0]?.expiryDate
      ? new Date(lesson.privateLesson[0].expiryDate)
      : null;
    const isUnscheduled = lesson.status === LessonStatusEnum.UNSCHEDULED;
    const isRescheduled = lesson.status === LessonStatusEnum.RESCHEDULED;

    return {
      teacher: this.getTeacherName(lesson),
      teacherId: lesson.teacherId || 0,
      originalDate:
        (isRescheduled || isUnscheduled) && originalLessonDate
          ? formatLongDateUTC(originalLessonDate)
          : null,
      scheduledDate:
        !isUnscheduled && lessonDate
          ? formatLongDateUTC(lessonDate)
          : null,
      time: formatEasternTime(lessonDate),
      duration: formatDuration(lesson.duration),
      expiryDate: expiryDate ? formatDate(expiryDate) : null,
    };
  }
  formatDueDate(lesson: Lesson): string | null {
    if (!lesson?.dueDate) return null;
    return formatDate(new Date(lesson.dueDate));
  }

  private getTeacherName(lesson: Lesson): string {
    const profile = lesson.teacher?.profile;
    if (profile) {
      const fullName =
        `${profile.firstname || ''} ${profile.lastname || ''}`.trim();
      return fullName || lesson.teacher?.username || 'Unknown';
    }
    return lesson.teacher?.username || 'Unknown';
  }

  /**
   * Calculate unit (duration in decimal hours)
   * Example: "00:30:00" -> 0.5
   */
  calculateUnit(duration: string): number {
    return RoundingUtils.durationToHours(duration).toNumber();
  }

  calculateNetCost(teacherRate: number, unit: number): number {
    return RoundingUtils.roundDecimal(
      RoundingUtils.decimal(teacherRate).times(unit),
      2,
    );
  }

  calculateGrossPrice(
    programRate: number,
    unit: number,
    lesson: Lesson,
  ): number {
    const isGroup =
      lesson.course?.program?.type === ProgramTypeEnum.GROUP_PROGRAM;
    const gross = isGroup ? programRate : programRate * unit; // Group: flat rate, Private: rate × unit
    return RoundingUtils.roundDecimal(gross, 2);
  }

  /**
   * Calculate discount with cascade order: type 3 → 4 → 1 → 7 → 2
   * Matches legacy behavior where percentage discounts apply to current lessonPrice (after previous discounts)
   */
  calculateDiscount(grossPrice: number, discounts: LessonDiscount[]): number {
    let totalDiscount = 0;
    const baseGrossPrice = this.round(grossPrice);
    let lessonPrice = baseGrossPrice;

    const discountOrder = [
      LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
      LessonDiscount.TYPE_LINE_ITEM,
      LessonDiscount.TYPE_CUSTOMER,
      LessonDiscount.TYPE_PREPAID_CYCLE,
      LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
    ]; // Multi-enrolment → Line Item → Customer → Prepaid → Payment Frequency

    for (const type of discountOrder) {
      const discount = discounts.find((d) => d.type === type);
      if (!discount) continue;

      let discountAmount = 0;
      const v = parseFloat(discount.value?.toString() ?? '0');

      // Prepaid is dollars and replaces payment frequency. Display only here,
      // but a schedule quoting a different figure from the invoice is a support
      // call, so it has to agree with the paths that bill.
      if (type === LessonDiscount.TYPE_PREPAID_CYCLE) {
        return totalDiscount + prepaidReduction(v, lessonPrice);
      }

      // multi-enrolment discount is always treated as a fixed dollar amount
      // even when valueType is 1 in lesson_discount rows.
      if (type === LessonDiscount.TYPE_MULTIPLE_ENROLMENT) {
        discountAmount = lessonPrice < 0 ? 0 : v;
      } else if (discount.valueType === 1) {
        // Percentage: apply to current lessonPrice (after previous discounts)
        discountAmount = (v / 100) * lessonPrice;
      } else {
        // Fixed amount: add directly
        discountAmount = lessonPrice < 0 ? 0 : v;
      }

      totalDiscount += discountAmount;
      lessonPrice = baseGrossPrice - totalDiscount; // Recalculate for next iteration
    }

    return totalDiscount;
  }

  calculateSubTotal(grossPrice: number, discount: number): number {
    return grossPrice - discount;
  }

  calculateProfit(subTotal: number, netCost: number): number {
    return subTotal - netCost;
  }

  roundBalance(balance: number): number {
    return RoundingUtils.applyBalanceToleranceForLesson(balance);
  }

  round(value: number): number {
    return RoundingUtils.roundHalfUpForLesson(value, 2);
  }

  canViewAttendance(lesson: Lesson): boolean {
    const isPrivate =
      lesson.course?.program?.type === ProgramTypeEnum.PRIVATE_PROGRAM;
    const isUnscheduled = lesson.status === LessonStatusEnum.UNSCHEDULED;
    return isPrivate && !isUnscheduled;
  }

  transformToAttendanceCostTotals(
    lesson: Lesson,
    discounts: LessonDiscount[],
    totalPaid: number,
    invoiceSummary?: {
      invoiceId: number;
      invoiceNumber: number;
      balance: number;
    } | null,
  ): any {
    const isGroupLesson =
      lesson.course?.program?.type === ProgramTypeEnum.GROUP_PROGRAM;
    const canViewAttendance = this.canViewAttendance(lesson);
    lesson.discounts = discounts;

    const unit =
      typeof lesson.getUnit === 'function'
        ? lesson.getUnit()
        : this.calculateUnit(lesson.duration);
    const netCost = this.calculateNetCost(lesson.teacherRate, unit);
    const grossPrice =
      isGroupLesson
        ? this.calculateGrossPrice(lesson.programRate, unit, lesson)
        : typeof lesson.getGrossPrice === 'function'
        ? lesson.getGrossPrice()
        : this.calculateGrossPrice(lesson.programRate, unit, lesson);
    const discount = isGroupLesson
      ? this.calculateDiscount(grossPrice, discounts)
      : typeof lesson.getDiscount === 'function'
      ? lesson.getDiscount()
      : this.calculateDiscount(grossPrice, discounts);
    const subTotal = isGroupLesson
      ? this.calculateSubTotal(grossPrice, discount)
      : typeof lesson.getSubTotal === 'function'
      ? lesson.getSubTotal()
      : this.calculateSubTotal(grossPrice, discount);
    let profit = this.calculateProfit(subTotal, netCost);
    const enrolmentCount = lesson.course?.enrolments?.length || 0;
    const costPerStudent =
      enrolmentCount > 0
        ? formatCurrency(netCost / enrolmentCount)
        : null;

    const tax = Number(lesson.tax ?? 0);
    const privateLesson = isGroupLesson
      ? null
      : (lesson.privateLesson?.[0] ?? null);
    const hasStoredPrivateTotal =
      !isGroupLesson &&
      privateLesson !== null &&
      privateLesson.total !== null &&
      privateLesson.total !== undefined;
    const storedPrivateTotal = hasStoredPrivateTotal
      ? Number(privateLesson.total)
      : null;
    // Private lessons should display the persisted private_lesson.total when
    // it exists. Explode and recurring-payment now preserve that stored value
    // as the cent-safe source of truth, while recomputing from rate/duration
    // can reintroduce a one-cent drift on half-cent boundaries.
    const displayTotal = isGroupLesson
      ? this.round(subTotal + tax)
      : hasStoredPrivateTotal && storedPrivateTotal !== null
      ? storedPrivateTotal
      : typeof lesson.getNetPrice === 'function'
      ? lesson.getNetPrice()
      : this.round(subTotal + tax);
    // Keep the visible subtotal/discount derived from the same stored total so
    // the schedule UI matches the DB-backed amount shown in payment flows.
    const displaySubTotal = isGroupLesson
      ? subTotal
      : hasStoredPrivateTotal && storedPrivateTotal !== null
      ? this.round(displayTotal - tax)
      : subTotal;
    const displayDiscount = isGroupLesson
      ? discount
      : hasStoredPrivateTotal && storedPrivateTotal !== null
      ? this.round(grossPrice - displaySubTotal)
      : discount;
    if (!isGroupLesson && hasStoredPrivateTotal && storedPrivateTotal !== null) {
      profit = this.calculateProfit(displaySubTotal, netCost);
    }
    let total: number;
    let balance: number;

    if (isGroupLesson) {
      total = displayTotal;
      balance = this.roundBalance(total - totalPaid);
    } else {
      total = displayTotal;
      balance =
        privateLesson?.balance ??
        this.roundBalance(total - totalPaid);
    }
    const invoiceOwingAmount =
      invoiceSummary && Number(invoiceSummary.balance) > 0.09
        ? Number(invoiceSummary.balance)
        : 0;

    return {
      attendance: canViewAttendance
        ? {
            present: lesson.isPresent ? 'Yes' : 'No',
          }
        : null,

      cost: {
        costPerHour: formatCurrency(lesson.teacherRate),
        cost: formatCurrency(netCost),
        price: isGroupLesson ? null : formatCurrency(displaySubTotal),
        profit: isGroupLesson ? null : formatCurrency(profit),
        costPerStudent: isGroupLesson ? costPerStudent : null,
      },

      totals: {
        lessonRatePerHour: formatCurrency(lesson.programRate),
        qty: this.round(unit),
        lessonPrice: formatCurrency(grossPrice),
        discount: formatCurrency(displayDiscount),
        subTotal: formatCurrency(displaySubTotal),
        tax: formatCurrency(tax),
        total: formatCurrency(total),
        paid: formatCurrency(totalPaid),
        balance: formatCurrency(balance),
        invoiceId: invoiceSummary?.invoiceId ?? null,
        invoiceNumber: invoiceSummary
          ? `I-${String(invoiceSummary.invoiceNumber).padStart(5, '0')}`
          : null,
        invoiceOwing: invoiceSummary
          ? formatCurrency(invoiceOwingAmount)
          : null,
      },
    };
  }
}
