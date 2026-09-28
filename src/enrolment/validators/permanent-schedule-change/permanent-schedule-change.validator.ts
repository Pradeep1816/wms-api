/**
 * Central business-validation boundary for permanent schedule changes (PSC).
 * It composes canonical domain parsers with repository-backed checks while
 * preserving the existing API errors and validation order.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CourseSchedule } from '../../../course/entities/course-schedule.entity';
import { Course } from '../../../course/entities/course.entity';
import { Program } from '../../../program/entities/program.entity';
import type { Enrolment } from '../../entities/enrolment.entity';
import {
  endOfPermanentScheduleDay,
  formatPermanentScheduleDate,
  parsePermanentScheduleDate,
  parsePermanentScheduleMonth,
  startOfPermanentScheduleMonth,
} from '../../permanent-schedule-change/domain/permanent-schedule-date';
import {
  parsePermanentScheduleSlot,
  type PermanentScheduleSlot,
} from '../../permanent-schedule-change/domain/permanent-schedule-slot';
import {
  PermanentScheduleChangeQueryRepository,
  type PermanentScheduleMonthConstraintCounts,
} from '../../repositories/permanent-schedule-change/permanent-schedule-change-query.repository';

/** Minimum persistence contract required by PSC month validation. */
export interface PermanentScheduleMonthConstraintReader {
  /** Count changeable and invoiced lessons for the selected course month. */
  getMonthConstraintCounts(
    courseId: number,
    dateToChangeSchedule: Date,
  ): Promise<PermanentScheduleMonthConstraintCounts>;
}

/** Date range normalized for the lesson-review service. */
export interface PermanentScheduleReviewDateRange {
  rescheduleBeginDate?: Date;
  rescheduleEndDate?: Date;
}

/** Owns all PSC business validation and API-facing validation messages. */
@Injectable()
export class PermanentScheduleChangeValidator {
  /** Use the standard query repository unless a transaction reader is supplied. */
  constructor(
    private readonly queryRepository: PermanentScheduleChangeQueryRepository,
  ) {}

  /** Require an enrolment whose course is eligible for permanent changes. */
  validateEligibleEnrolment(
    enrolment: Enrolment | null,
    locationId: number,
    enrolmentId: number,
  ): Enrolment {
    if (!enrolment) {
      throw new NotFoundException(`Enrolment not found: ${enrolmentId}`);
    }
    if (enrolment.course.locationId !== locationId) {
      throw new BadRequestException(
        'Enrolment does not belong to this location',
      );
    }
    if (
      !enrolment.course.program ||
      enrolment.course.program.type !== Program.TYPE_PRIVATE_PROGRAM
    ) {
      throw new BadRequestException(
        'Permanent schedule change is only available for private program enrolments',
      );
    }
    if (enrolment.course.type !== Course.TYPE_REGULAR) {
      throw new BadRequestException(
        'Permanent schedule change is only available for regular courses',
      );
    }
    if (enrolment.course.isDeleted) {
      throw new BadRequestException('Course is deleted');
    }

    return enrolment;
  }

  /** Require a review enrolment belonging to both the course and location. */
  validateReviewEnrolment(
    enrolment: Enrolment | null,
    locationId: number,
    enrolmentId: number,
    courseId: number,
  ): Enrolment {
    if (!enrolment) {
      throw new NotFoundException(
        `Enrolment ${enrolmentId} was not found for course ${courseId}`,
      );
    }
    if (!enrolment.course || enrolment.course.locationId !== locationId) {
      throw new BadRequestException(
        'Enrolment does not belong to this location',
      );
    }

    return enrolment;
  }

  /** Require the course schedule currently used to build a PSC preview. */
  validateRecentSchedule(schedule: CourseSchedule | null): CourseSchedule {
    if (!schedule) {
      throw new BadRequestException('No course schedule found for enrolment');
    }
    return schedule;
  }

  /** Parse a preview month and preserve its existing field-specific error. */
  parsePreviewMonth(value: string): Date {
    try {
      return parsePermanentScheduleMonth(value);
    } catch {
      throw new BadRequestException(
        `Invalid startMonth format: ${value}. Expected "YYYY-MM"`,
      );
    }
  }

  /** Parse the effective PSC month and preserve its existing API error. */
  parseScheduleMonth(value: string): Date {
    try {
      return parsePermanentScheduleMonth(value);
    } catch {
      throw new BadRequestException(
        `Invalid dateToChangeSchedule format: ${value}. Expected "YYYY-MM"`,
      );
    }
  }

  /** Parse the first replacement date and preserve its existing API error. */
  parseRescheduleBeginDate(value: string): Date {
    try {
      return parsePermanentScheduleDate(value);
    } catch {
      throw new BadRequestException(
        'Invalid rescheduleBeginDate format. Expected "MMM D, Y"',
      );
    }
  }

  /** Require the first replacement date to fall in the month's first week. */
  validateFirstWeek(rescheduleBeginDate: Date): void {
    const firstDayOfMonth = startOfPermanentScheduleMonth(rescheduleBeginDate);
    const endOfFirstWeek = new Date(firstDayOfMonth);
    endOfFirstWeek.setUTCDate(endOfFirstWeek.getUTCDate() + 6);

    if (rescheduleBeginDate > endOfFirstWeek) {
      throw new BadRequestException(
        `Reschedule begin date should be within first seven days (${formatPermanentScheduleDate(
          firstDayOfMonth,
        )} - ${formatPermanentScheduleDate(endOfFirstWeek)}) of the month`,
      );
    }
  }

  /** Parse the requested weekly slot and preserve its existing API error. */
  parseScheduleSlot(value: string): PermanentScheduleSlot {
    try {
      return parsePermanentScheduleSlot(value);
    } catch {
      throw new BadRequestException('Invalid dayTime format');
    }
  }

  /** Require the selected teacher to be qualified at the requested location. */
  validateTeacherEligibility(
    eligibleTeachers: Array<{ id: number }>,
    teacherId: number,
  ): void {
    if (!eligibleTeachers.some(({ id }) => id === teacherId)) {
      throw new BadRequestException(
        'Selected teacher is not eligible for this program and location',
      );
    }
  }

  /** Parse the optional review range and make its end date inclusive. */
  parseReviewDateRange(
    rescheduleBeginDateValue?: string,
    rescheduleEndDateValue?: string,
  ): PermanentScheduleReviewDateRange {
    try {
      return {
        rescheduleBeginDate: rescheduleBeginDateValue
          ? parsePermanentScheduleDate(rescheduleBeginDateValue)
          : undefined,
        rescheduleEndDate: rescheduleEndDateValue
          ? endOfPermanentScheduleDay(
              parsePermanentScheduleDate(rescheduleEndDateValue),
            )
          : undefined,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid reschedule date',
      );
    }
  }

  /** Reject months with no changeable lessons or with invoiced lessons. */
  async validateMonthConstraints(
    courseId: number,
    dateToChangeSchedule: Date,
    reader: PermanentScheduleMonthConstraintReader = this.queryRepository,
  ): Promise<void> {
    const { lessonsToChange, invoicedLessons } =
      await reader.getMonthConstraintCounts(courseId, dateToChangeSchedule);

    if (lessonsToChange === 0) {
      throw new BadRequestException(
        'There were no lessons to change schedule!',
      );
    }
    if (invoicedLessons > 0) {
      throw new BadRequestException('You cannot select this month');
    }
  }
}
