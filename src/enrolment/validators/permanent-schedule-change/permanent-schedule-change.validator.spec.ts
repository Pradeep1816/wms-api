import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { CourseSchedule } from '../../../course/entities/course-schedule.entity';
import { Course } from '../../../course/entities/course.entity';
import { Program } from '../../../program/entities/program.entity';
import type { Enrolment } from '../../entities/enrolment.entity';
import type { PermanentScheduleChangeQueryRepository } from '../../repositories/permanent-schedule-change/permanent-schedule-change-query.repository';
import { PermanentScheduleChangeValidator } from './permanent-schedule-change.validator';

type PscHttpExceptionConstructor =
  | typeof BadRequestException
  | typeof NotFoundException;

describe('PermanentScheduleChangeValidator', () => {
  const month = new Date('2026-02-01T00:00:00.000Z');
  const eligibleEnrolment = {
    id: 22,
    course: {
      locationId: 3,
      program: { type: Program.TYPE_PRIVATE_PROGRAM },
      type: Course.TYPE_REGULAR,
      isDeleted: false,
    },
  } as Enrolment;

  function createValidator(
    counts = {
      lessonsToChange: 1,
      invoicedLessons: 0,
    },
  ) {
    const queryRepository = {
      getMonthConstraintCounts: vi.fn().mockResolvedValue(counts),
    };
    return {
      queryRepository,
      validator: new PermanentScheduleChangeValidator(
        queryRepository as unknown as PermanentScheduleChangeQueryRepository,
      ),
    };
  }

  it('accepts an enrolment eligible for PSC', () => {
    const { validator } = createValidator();

    expect(validator.validateEligibleEnrolment(eligibleEnrolment, 3, 22)).toBe(
      eligibleEnrolment,
    );
  });

  it('preserves every enrolment eligibility error', () => {
    const { validator } = createValidator();
    const cases: Array<
      [Enrolment | null, string, PscHttpExceptionConstructor]
    > = [
      [null, 'Enrolment not found: 22', NotFoundException],
      [
        {
          ...eligibleEnrolment,
          course: { ...eligibleEnrolment.course, locationId: 9 },
        },
        'Enrolment does not belong to this location',
        BadRequestException,
      ],
      [
        {
          ...eligibleEnrolment,
          course: {
            ...eligibleEnrolment.course,
            program: { type: 0 },
          },
        } as Enrolment,
        'Permanent schedule change is only available for private program enrolments',
        BadRequestException,
      ],
      [
        {
          ...eligibleEnrolment,
          course: { ...eligibleEnrolment.course, type: 0 },
        },
        'Permanent schedule change is only available for regular courses',
        BadRequestException,
      ],
      [
        {
          ...eligibleEnrolment,
          course: { ...eligibleEnrolment.course, isDeleted: true },
        },
        'Course is deleted',
        BadRequestException,
      ],
    ];

    for (const [enrolment, message, exception] of cases) {
      expect(() =>
        validator.validateEligibleEnrolment(enrolment, 3, 22),
      ).toThrow(exception);
      expect(() =>
        validator.validateEligibleEnrolment(enrolment, 3, 22),
      ).toThrow(message);
    }
  });

  it('validates review ownership and location', () => {
    const { validator } = createValidator();

    expect(() => validator.validateReviewEnrolment(null, 3, 22, 44)).toThrow(
      'Enrolment 22 was not found for course 44',
    );
    expect(() =>
      validator.validateReviewEnrolment(
        { course: { locationId: 9 } } as Enrolment,
        3,
        22,
        44,
      ),
    ).toThrow('Enrolment does not belong to this location');
    expect(
      validator.validateReviewEnrolment(eligibleEnrolment, 3, 22, 44),
    ).toBe(eligibleEnrolment);
  });

  it('requires a recent schedule for preview', () => {
    const { validator } = createValidator();
    const schedule = { id: 5 } as CourseSchedule;

    expect(validator.validateRecentSchedule(schedule)).toBe(schedule);
    expect(() => validator.validateRecentSchedule(null)).toThrow(
      'No course schedule found for enrolment',
    );
  });

  it('parses each PSC API date field using canonical domain rules', () => {
    const { validator } = createValidator();

    expect(validator.parsePreviewMonth('2026-02')).toEqual(month);
    expect(validator.parseScheduleMonth('2026-02')).toEqual(month);
    expect(validator.parseRescheduleBeginDate('Feb 2, 2026')).toEqual(
      new Date('2026-02-02T00:00:00.000Z'),
    );
  });

  it('preserves field-specific parser errors', () => {
    const { validator } = createValidator();

    expect(() => validator.parsePreviewMonth('invalid')).toThrow(
      'Invalid startMonth format: invalid. Expected "YYYY-MM"',
    );
    expect(() => validator.parseScheduleMonth('invalid')).toThrow(
      'Invalid dateToChangeSchedule format: invalid. Expected "YYYY-MM"',
    );
    expect(() => validator.parseRescheduleBeginDate('invalid')).toThrow(
      'Invalid rescheduleBeginDate format. Expected "MMM D, Y"',
    );
  });

  it('restricts the first replacement date to the first seven days', () => {
    const { validator } = createValidator();

    expect(() =>
      validator.validateFirstWeek(new Date('2026-02-07T00:00:00.000Z')),
    ).not.toThrow();
    expect(() =>
      validator.validateFirstWeek(new Date('2026-02-08T00:00:00.000Z')),
    ).toThrow(
      'Reschedule begin date should be within first seven days (Feb 1, 2026 - Feb 7, 2026) of the month',
    );
  });

  it('parses a weekly slot and rejects an invalid slot', () => {
    const { validator } = createValidator();

    expect(validator.parseScheduleSlot('Monday 04:00 PM')).toEqual({
      day: 1,
      fromTime: '16:00:00',
    });
    expect(() => validator.parseScheduleSlot('Funday 04:00 PM')).toThrow(
      'Invalid dayTime format',
    );
  });

  it('requires the selected teacher to be eligible', () => {
    const { validator } = createValidator();

    expect(() =>
      validator.validateTeacherEligibility([{ id: 20 }], 20),
    ).not.toThrow();
    expect(() => validator.validateTeacherEligibility([], 20)).toThrow(
      'Selected teacher is not eligible for this program and location',
    );
  });

  it('parses an inclusive optional review date range', () => {
    const { validator } = createValidator();

    expect(
      validator.parseReviewDateRange('Feb 1, 2026', 'Feb 15, 2026'),
    ).toEqual({
      rescheduleBeginDate: new Date('2026-02-01T00:00:00.000Z'),
      rescheduleEndDate: new Date('2026-02-15T23:59:59.999Z'),
    });
    expect(validator.parseReviewDateRange()).toEqual({
      rescheduleBeginDate: undefined,
      rescheduleEndDate: undefined,
    });
    expect(() => validator.parseReviewDateRange('invalid')).toThrow(
      'Invalid date format: invalid',
    );
  });

  it('accepts a month with future lessons and no invoiced lessons', async () => {
    const { validator } = createValidator({
      lessonsToChange: 2,
      invoicedLessons: 0,
    });

    await expect(
      validator.validateMonthConstraints(44, month),
    ).resolves.toBeUndefined();
  });

  it('rejects a month when there are no lessons left to change', async () => {
    const { validator } = createValidator({
      lessonsToChange: 0,
      invoicedLessons: 0,
    });

    await expect(validator.validateMonthConstraints(44, month)).rejects.toThrow(
      'There were no lessons to change schedule!',
    );
  });

  it('rejects a month containing invoiced lessons', async () => {
    const { validator } = createValidator({
      lessonsToChange: 2,
      invoicedLessons: 1,
    });

    await expect(validator.validateMonthConstraints(44, month)).rejects.toThrow(
      'You cannot select this month',
    );
  });

  it('supports a transaction-scoped persistence reader', async () => {
    const { validator, queryRepository } = createValidator();
    const transactionReader = {
      getMonthConstraintCounts: vi.fn().mockResolvedValue({
        lessonsToChange: 2,
        invoicedLessons: 0,
      }),
    };

    await validator.validateMonthConstraints(44, month, transactionReader);

    expect(transactionReader.getMonthConstraintCounts).toHaveBeenCalledWith(
      44,
      month,
    );
    expect(queryRepository.getMonthConstraintCounts).not.toHaveBeenCalled();
  });
});
