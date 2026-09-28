/**
 * Pure validation used while confirming permanent schedule changes. Keeping
 * these checks dependency-free allows the existing lesson confirmation API to
 * consume canonical PSC validation without owning enrolment business rules.
 */
import { BadRequestException } from '@nestjs/common';
import { parsePermanentScheduleDate } from '../../permanent-schedule-change/domain/permanent-schedule-date';

/** Validates confirmation input and invariants before persistence is migrated. */
export class PermanentScheduleChangeConfirmationValidator {
  /** Parse an accepted confirmation date or preserve the legacy API error. */
  parseRescheduleDate(value: string): Date {
    try {
      return parsePermanentScheduleDate(value);
    } catch {
      throw new BadRequestException(
        `Invalid date format: ${value}. Expected "d-m-Y" (e.g., "01-02-2026") or "MMM D, Y" (e.g., "Feb 1, 2026")`,
      );
    }
  }

  /** Require one replacement for every old lesson selected by PSC policy. */
  validateReplacementLessonCount(
    courseId: number,
    oldLessonCount: number,
    replacementLessonCount: number,
  ): void {
    if (replacementLessonCount !== oldLessonCount) {
      throw new BadRequestException(
        `PSC reschedule lesson count mismatch for course ${courseId}: expected ${oldLessonCount} old lessons but found ${replacementLessonCount} replacement lessons.`,
      );
    }
  }
}
