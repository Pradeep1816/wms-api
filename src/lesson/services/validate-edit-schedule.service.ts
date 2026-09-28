import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(customParseFormat);
import { ValidateEditScheduleRepository } from '../repositories/validate-edit-schedule.repository';
import { LessonRepository } from '../repositories/lesson.repository';
import { LocationService } from '../../location/services/location.service';
import { ValidateEditScheduleRequestDto } from '../dto/validate-edit-schedule-request.dto';
import { ProgramTypeEnum } from '../../program/enums/program-type';
import { TeacherOverlapValidator } from '../validators/teacher-overlap.validator';
import { StudentOverlapValidator } from '../validators/student-overlap.validator';
import { TeacherEligibilityValidator } from '../validators/teacher-eligibility.validator';

@Injectable()
export class ValidateEditScheduleService {
  constructor(
    private readonly validateEditScheduleRepository: ValidateEditScheduleRepository,
    private readonly locationService: LocationService,
    private readonly teacherOverlapValidator: TeacherOverlapValidator,
    private readonly studentOverlapValidator: StudentOverlapValidator,
    private readonly teacherEligibilityValidator: TeacherEligibilityValidator,
  ) {}

  /**
   * Validate lesson update (edit schedule) before submit.
   * - date empty: no business validation.
   * - date present: run business validation (invoiced, eligibility when teacher changes, teacher overlap, student overlap).
   * Response keys: date, teacherId, duration (v2 plain keys).
   */
  async validateLessonOnUpdate(
    id: number,
    locationId: number,
    dto: ValidateEditScheduleRequestDto,
  ): Promise<Record<string, string[]>> {
    const dateStr =
      dto.date != null && dto.date !== '' ? String(dto.date).trim() : undefined;
    const errors: Record<string, string[]> = {};

    const add = (key: 'date' | 'teacherId' | 'duration', message: string) => {
      if (!errors[key]) errors[key] = [];
      errors[key].push(message);
    };

    // Legacy: if date is empty, skip all business validation and return no errors
    if (!dateStr) {
      return errors;
    }

    // Only validate DTO fields (including required, regex, etc.) when date is present
    const validationErrors = await validate(dto, { whitelist: true });
    for (const err of validationErrors) {
      if (err.property && err.constraints) {
        const key = err.property as 'date' | 'teacherId' | 'duration';
        if (['date', 'teacherId', 'duration'].includes(key)) {
          errors[key] = Object.values(err.constraints);
        }
      }
    }

    if (
      dto.teacherId === undefined ||
      dto.teacherId === null ||
      dto.teacherId === ''
    ) {
      add('teacherId', 'Teacher Name cannot be blank.');
    }
    const durationVal = dto.duration;
    if (
      !durationVal ||
      (typeof durationVal === 'string' && durationVal.trim() === '')
    ) {
      add('duration', 'Duration cannot be blank.');
    }
    if (Object.keys(errors).length > 0) {
      return errors;
    }

    const lesson =
      await this.validateEditScheduleRepository.findByIdAndLocationId(
        id,
        locationId,
      );
    if (!lesson) return errors;

    const isInvoiced = await this.validateEditScheduleRepository.isLessonInvoiced(id);
    if (isInvoiced) {
      add('date', "Lesson can't be edited once its invoiced");
      return errors;
    }

    const effectiveTeacherId =
      dto.teacherId != null ? Number(dto.teacherId) : lesson.teacherId;
    const effectiveDuration =
      durationVal && String(durationVal).trim()
        ? String(durationVal).trim()
        : lesson.duration;

    let effectiveDate: Date;
    try {
      const raw = dto.date ?? '';
      const normalized = raw.replace(/\+/g, ' ').trim();

      // First, handle the common \"YYYY-MM-DD hh:mm AM/PM\" format manually,
      // so we are not dependent on dayjs token quirks.
      const m = normalized.match(
        /^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2}) (AM|PM)$/i,
      );

      if (m) {
        const year = parseInt(m[1], 10);
        const month = parseInt(m[2], 10) - 1; // JS month 0–11
        const day = parseInt(m[3], 10);
        let hours = parseInt(m[4], 10);
        const minutes = parseInt(m[5], 10);
        const ampm = m[6].toUpperCase();

        if (ampm === 'PM' && hours < 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;

        effectiveDate = new Date(year, month, day, hours, minutes, 0, 0);
      } else {
        // Fallback to dayjs with multiple formats for other accepted shapes
        const formats = [
          'YYYY-MM-DD h:mm A', // 2026-02-18 7:15 AM
          'MMM D, YYYY h:mm A', // Feb 18, 2026 7:15 AM
          'YYYY-MM-DD HH:mm', // 2026-02-18 07:15 (24h, no AM/PM)
        ];

        let parsed = dayjs.invalid();
        for (const fmt of formats) {
          parsed = dayjs(normalized, fmt, true);
          if (parsed.isValid()) break;
        }

        effectiveDate = parsed.isValid() ? parsed.toDate() : new Date(NaN);
      }

      if (isNaN(effectiveDate.getTime())) {
        add('date', 'Invalid lesson date format.');
        return errors;
      }
    } catch {
      add('date', 'Invalid lesson date format.');
      return errors;
    }

    if (!this.isValidDurationFormat(effectiveDuration)) {
      add('duration', 'Duration must be in HH:MM:SS or HH:MM format.');
      return errors;
    }

    const currentTeacherId = Number(lesson.teacherId);
    if (Number(effectiveTeacherId) !== currentTeacherId) {
      try {
        await this.teacherEligibilityValidator.validateTeacherEligibility(
          effectiveTeacherId,
          lesson.id,
          locationId,
        );
      } catch (e: unknown) {
        const message =
          e && typeof e === 'object' && 'message' in e
            ? String((e as { message: unknown }).message)
            : `Please choose an eligible teacher who is qualified to teach ${
                lesson.course?.program?.name || ''
              }!`;
        add('teacherId', message);
      }
    }

    try {
      await this.teacherOverlapValidator.validateTeacherOverlap(
        effectiveTeacherId,
        lesson.id,
        effectiveDate,
        effectiveDuration,
        locationId,
      );
    } catch (e: unknown) {
      const message =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: unknown }).message)
          : 'Teacher occupied with another lesson';
      add('date', message);
    }

    if (lesson.course?.program?.type === ProgramTypeEnum.PRIVATE_PROGRAM) {
      try {
        await this.studentOverlapValidator.validateStudentOverlap(
          lesson.id,
          effectiveDate,
          effectiveDuration,
          locationId,
          // lesson.courseId,
        );
      } catch (e: unknown) {
        const message =
          e && typeof e === 'object' && 'message' in e
            ? String((e as { message: unknown }).message)
            : "Lesson time conflicts with student's another lesson";
        add('date', message);
      }
    }

    return errors;
  }

  private isValidDurationFormat(duration: string): boolean {
    return /^([0-9]{2}):([0-5][0-9])(:([0-5][0-9]))?$/.test(duration);
  }
}
