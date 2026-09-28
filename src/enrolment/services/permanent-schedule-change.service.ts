/**
 * Application orchestration for permanent schedule changes (PSC). This file
 * coordinates canonical PSC validation, draft persistence, and lesson review
 * while keeping HTTP concerns and database query construction elsewhere.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PermanentScheduleChangeConfirmRequestDto,
  PermanentScheduleChangeRequestDto,
  RescheduleRequestDto,
} from '../dto/permanent-schedule-change/permanent-schedule-change-request.dto';
import type { PermanentScheduleChangeReviewDataDto } from '../dto/permanent-schedule-change/permanent-schedule-change-review-response.dto';
import {
  PermanentScheduleChangeDetailDataDto,
  RescheduleResponseDataDto,
} from '../dto/permanent-schedule-change/permanent-schedule-change-response.dto';
import { Enrolment } from '../entities/enrolment.entity';
import { formatPermanentScheduleDate } from '../permanent-schedule-change/domain/permanent-schedule-date';
import { getPermanentScheduleMonthBoundary } from '../permanent-schedule-change/domain/permanent-schedule-eligibility.policy';
import { PermanentScheduleChangeReviewRequestDto } from '../dto/permanent-schedule-change/permanent-schedule-change-review-request.dto';
import { PermanentScheduleChangeDraftService } from '../permanent-schedule-change/permanent-schedule-change-draft.service';
import { PermanentScheduleChangeQueryRepository } from '../repositories/permanent-schedule-change/permanent-schedule-change-query.repository';
import { PermanentScheduleChangeValidator } from '../validators/permanent-schedule-change/permanent-schedule-change.validator';
import { PermanentScheduleChangeReviewService } from '../permanent-schedule-change/permanent-schedule-change-review.service';
import { PermanentScheduleChangeConfirmationService } from '../permanent-schedule-change/permanent-schedule-change-confirmation.service';

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * Enrolment-owned application boundary for the permanent schedule change flow.
 * It is the single public entry point; focused PSC collaborators own domain
 * validation and transactional draft persistence.
 */
@Injectable()
export class PermanentScheduleChangeService {
  /** Inject the focused collaborators used by the PSC application workflow. */
  constructor(
    private readonly draftService: PermanentScheduleChangeDraftService,
    private readonly queryRepository: PermanentScheduleChangeQueryRepository,
    private readonly reviewService: PermanentScheduleChangeReviewService,
    private readonly validator: PermanentScheduleChangeValidator,
    private readonly confirmationService: PermanentScheduleChangeConfirmationService,
  ) {}

  /**
   * Build the current schedule preview and, when a month is supplied, validate
   * that the selected month can be changed.
   */
  async getPreview(
    locationId: number,
    enrolmentId: number,
    request?: PermanentScheduleChangeRequestDto,
  ): Promise<PermanentScheduleChangeDetailDataDto> {
    try {
      const enrolment = await this.loadEligibleEnrolment(
        locationId,
        enrolmentId,
        [
          'course',
          'course.program',
          'course.teacher',
          'course.teacher.profile',
        ],
      );
      const recentSchedule = this.validator.validateRecentSchedule(
        await this.queryRepository.findRecentSchedule(enrolment.courseId),
      );

      const dayName =
        DAY_NAMES[recentSchedule.day === 7 ? 0 : recentSchedule.day];
      const [hoursPart, minutes] = recentSchedule.fromTime.split(':');
      const hours = Number.parseInt(hoursPart, 10);
      const currentDayTime = `${dayName} ${String(hours % 12 || 12).padStart(
        2,
        '0',
      )}:${minutes} ${hours >= 12 ? 'PM' : 'AM'}`;
      const [durationHours, durationMinutes] =
        recentSchedule.duration.split(':');
      const currentTeacherName = enrolment.course.teacher?.profile
        ? `${enrolment.course.teacher.profile.firstname || ''} ${
            enrolment.course.teacher.profile.lastname || ''
          }`.trim()
        : 'Unknown';
      const teachers = await this.queryRepository.findQualifiedTeachers(
        locationId,
        enrolment.course.programId,
      );
      const preview = {
        courseId: enrolment.courseId,
        currentTeacherId: enrolment.course.teacherId,
        currentTeacherName,
        currentDayTime,
        currentDuration: `${durationHours}:${durationMinutes}`,
        teachers,
      };

      if (!request?.startMonth) {
        return preview;
      }

      const dateToChangeSchedule = this.validator.parsePreviewMonth(
        request.startMonth,
      );
      await this.validator.validateMonthConstraints(
        enrolment.courseId,
        dateToChangeSchedule,
      );

      return {
        ...preview,
        dateToChangeSchedule: request.startMonth,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to retrieve preview: ${this.getErrorMessage(error)}`,
      );
    }
  }

  /**
   * Validate a requested permanent schedule and atomically replace its draft
   * lessons, preserving the response contract used by the legacy workflow.
   */
  async reschedule(
    locationId: number,
    enrolmentId: number,
    request: RescheduleRequestDto,
    loggedUserId: number,
  ): Promise<RescheduleResponseDataDto> {
    try {
      const enrolment = await this.loadEligibleEnrolment(
        locationId,
        enrolmentId,
        ['course', 'course.program'],
      );
      const dateToChangeSchedule = this.validator.parseScheduleMonth(
        request.dateToChangeSchedule,
      );
      await this.validator.validateMonthConstraints(
        enrolment.courseId,
        dateToChangeSchedule,
      );

      const rescheduleBeginDate = this.validator.parseRescheduleBeginDate(
        request.rescheduleBeginDate,
      );
      this.validator.validateFirstWeek(rescheduleBeginDate);

      const { day, fromTime } = this.validator.parseScheduleSlot(
        request.dayTime,
      );

      const eligibleTeachers = await this.queryRepository.findQualifiedTeachers(
        locationId,
        enrolment.course.programId,
      );
      this.validator.validateTeacherEligibility(
        eligibleTeachers,
        request.teacherId,
      );

      const recentSchedule = await this.queryRepository.findRecentSchedule(
        enrolment.courseId,
      );
      const isTeacherOnlyChanged = Boolean(
        recentSchedule &&
        recentSchedule.day === day &&
        recentSchedule.fromTime === fromTime &&
        enrolment.course.teacherId !== request.teacherId,
      );

      const lastLessonDate = await this.draftService.replaceDraft(
        enrolment,
        enrolment.course,
        dateToChangeSchedule,
        request.teacherId,
        day,
        fromTime,
        request.duration,
        rescheduleBeginDate,
        loggedUserId,
      );

      return {
        courseId: enrolment.courseId,
        rescheduleBeginDate: formatPermanentScheduleDate(
          getPermanentScheduleMonthBoundary(dateToChangeSchedule),
        ),
        rescheduleEndDate: formatPermanentScheduleDate(lastLessonDate),
        isTeacherOnlyChanged,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to reschedule: ${this.getErrorMessage(error)}`,
      );
    }
  }

  /**
   * Load the lesson-review result for the current PSC draft within the
   * requested location and optional date range.
   */
  async getReview(
    locationId: number,
    enrolmentId: number,
    request: PermanentScheduleChangeReviewRequestDto,
  ): Promise<PermanentScheduleChangeReviewDataDto> {
    this.validator.validateReviewEnrolment(
      await this.queryRepository.findEnrolmentForReview(
        enrolmentId,
        request.courseId,
      ),
      locationId,
      enrolmentId,
      request.courseId,
    );

    const { rescheduleBeginDate, rescheduleEndDate } =
      this.validator.parseReviewDateRange(
        request.rescheduleBeginDate,
        request.rescheduleEndDate,
      );

    return this.reviewService.getReview(
      request.courseId,
      locationId,
      request.showAllReviewLessons ?? false,
      rescheduleBeginDate,
      rescheduleEndDate,
    );
  }

  /**
   * Confirm a PSC draft through its independent transaction workflow while
   * keeping both course and enrolment identity server-owned.
   */
  async confirm(
    locationSlug: string,
    locationId: number,
    enrolmentId: number,
    request: PermanentScheduleChangeConfirmRequestDto,
    loggedUserId: number,
  ): Promise<number | null> {
    const enrolment = await this.loadEligibleEnrolment(
      locationId,
      enrolmentId,
      ['course', 'course.program'],
    );

    return this.confirmationService.confirm({
      courseId: enrolment.courseId,
      enrolmentId,
      locationId,
      locationSlug,
      loggedUserId,
      rescheduleBeginDate: request.rescheduleBeginDate,
      rescheduleEndDate: request.rescheduleEndDate,
    });
  }

  /** Load an enrolment and enforce the course-level eligibility for PSC. */
  private async loadEligibleEnrolment(
    locationId: number,
    enrolmentId: number,
    relations: string[],
  ): Promise<Enrolment> {
    return this.validator.validateEligibleEnrolment(
      await this.queryRepository.findEnrolment(enrolmentId, relations),
      locationId,
      enrolmentId,
    );
  }

  /** Safely obtain an error message without assuming the thrown value's type. */
  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
