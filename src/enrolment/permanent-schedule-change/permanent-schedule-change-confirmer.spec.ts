/** Unit coverage for PSC confirmation rules through the PSC persistence port. */
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Course } from '../../course/entities/course.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonDiscount } from '../../lesson/entities/lesson-discount.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { Program } from '../../program/entities/program.entity';
import { PermanentScheduleChangeConfirmer } from './permanent-schedule-change-confirmer';
import type { PermanentScheduleChangeConfirmationPersistence } from '../repositories/permanent-schedule-change/permanent-schedule-change-confirmation.repository';

type FinancialCalculator = {
  calculatePrivateLessonFinancials(
    lesson: Lesson,
    discounts: LessonDiscount[],
    paidAmount: number,
  ): { total: number; balance: number };
};

/** Build the PSC persistence boundary with safe defaults for focused tests. */
function createPersistence() {
  return {
    findNewLessons: vi.fn().mockResolvedValue([] as Lesson[]),
    findOldRescheduledLessons: vi.fn().mockResolvedValue([] as Lesson[]),
    findOldLessons: vi.fn().mockResolvedValue([] as Lesson[]),
    updateCourseTeacher: vi.fn().mockResolvedValue(undefined),
    findPaidAmounts: vi.fn().mockResolvedValue(new Map<number, number>()),
    findDiscounts: vi.fn().mockResolvedValue([] as LessonDiscount[]),
    findPrivateLessons: vi.fn().mockResolvedValue([]),
    findBulkRescheduleLessonIds: vi.fn().mockResolvedValue(new Set<number>()),
    cancelLesson: vi.fn().mockResolvedValue(undefined),
    updateLessonDueDate: vi.fn().mockResolvedValue(undefined),
    moveSplitUsage: vi.fn().mockResolvedValue(undefined),
    findTeacherRate: vi.fn().mockResolvedValue(0),
    updateTeacherRate: vi.fn().mockResolvedValue(undefined),
    moveLessonPayments: vi.fn().mockResolvedValue([] as number[]),
    updateDebitPaymentReferences: vi.fn().mockResolvedValue(undefined),
    saveDiscountCopies: vi.fn().mockResolvedValue([] as LessonDiscount[]),
    savePrivateLesson: vi.fn().mockResolvedValue(undefined),
    updatePrivateLesson: vi.fn().mockResolvedValue(undefined),
    movePaymentCycle: vi.fn().mockResolvedValue(undefined),
    saveBulkRescheduleLesson: vi.fn().mockResolvedValue(undefined),
    resolvePrivateLessonRoot: vi.fn().mockResolvedValue({
      rootLessonId: 0,
      rootExpiryDate: null,
    }),
    updateCourseSchedule: vi.fn().mockResolvedValue(undefined),
    createRescheduleHierarchy: vi.fn().mockResolvedValue(undefined),
  };
}

describe('PermanentScheduleChangeConfirmer', () => {
  it('uses shared lesson entity math for private lesson financials', () => {
    const lesson = Object.assign(new Lesson(), {
      programRate: 65,
      duration: '00:30:00',
      tax: 0,
      discounts: [
        Object.assign(new LessonDiscount(), {
          type: LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
          value: 1.25,
          valueType: 0,
        }),
        Object.assign(new LessonDiscount(), {
          type: LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
          value: 3,
          valueType: 1,
        }),
      ],
    });
    const confirmer = new PermanentScheduleChangeConfirmer(
      {} as PermanentScheduleChangeConfirmationPersistence,
    ) as unknown as FinancialCalculator;

    const financials = confirmer.calculatePrivateLessonFinancials(
      lesson,
      lesson.discounts,
      30.31,
    );

    expect(financials.total).toBe(30.31);
    expect(financials.balance).toBe(0);
  });

  it('fails before mutation when replacement and old lesson counts differ', async () => {
    const repository = createPersistence();
    const replacement = {
      id: 2101,
      courseId: 77,
      teacherId: 701,
      date: new Date('2026-05-12T15:00:00.000Z'),
    } as Lesson;
    repository.findNewLessons.mockResolvedValue([replacement]);
    repository.findOldLessons.mockResolvedValue([
      { id: 1901 } as Lesson,
      { id: 1902 } as Lesson,
    ]);
    const confirmer = new PermanentScheduleChangeConfirmer(
      repository as unknown as PermanentScheduleChangeConfirmationPersistence,
    );

    await expect(
      confirmer.confirm(
        { id: 77, endDate: replacement.date } as Course,
        [replacement],
        '01-05-2026',
        '12-05-2026',
        7001,
      ),
    ).rejects.toThrow(
      'PSC reschedule lesson count mismatch for course 77: expected 2 old lessons but found 1 replacement lessons.',
    );

    expect(repository.updateCourseTeacher).not.toHaveBeenCalled();
    expect(repository.cancelLesson).not.toHaveBeenCalled();
    expect(repository.createRescheduleHierarchy).not.toHaveBeenCalled();
  });

  it('updates the teacher rate and course teacher when PSC reaches the course end date', async () => {
    const repository = createPersistence();
    const replacement = {
      id: 2001,
      courseId: 77,
      teacherId: 701,
      date: new Date('2026-05-12T15:00:00.000Z'),
      duration: '00:45:00',
      course: { id: 77, programId: 901, program: { type: 2 } },
    } as Lesson;
    const oldLesson = {
      id: 1901,
      courseId: 77,
      teacherId: 601,
      date: new Date('2026-05-05T15:00:00.000Z'),
      dueDate: new Date('2026-04-15T00:00:00.000Z'),
      discounts: [],
    } as Lesson;
    repository.findNewLessons.mockResolvedValue([replacement]);
    repository.findOldLessons.mockResolvedValue([oldLesson]);
    repository.findTeacherRate.mockResolvedValue(62);
    const confirmer = new PermanentScheduleChangeConfirmer(
      repository as unknown as PermanentScheduleChangeConfirmationPersistence,
    );

    await confirmer.confirm(
      { id: 77, endDate: replacement.date } as Course,
      [replacement],
      '01-05-2026',
      '12-05-2026',
      7001,
    );

    expect(repository.updateCourseTeacher).toHaveBeenCalledWith(77, 701);
    expect(repository.cancelLesson).toHaveBeenCalledWith(1901);
    expect(repository.updateTeacherRate).toHaveBeenCalledWith(2001, 62);
    expect(repository.updateCourseSchedule).toHaveBeenCalledWith(
      replacement,
      new Date('2026-05-01T00:00:00.000Z'),
      new Date('2026-05-12T00:00:00.000Z'),
    );
    expect(repository.saveBulkRescheduleLesson).toHaveBeenCalledWith(
      2001,
      7001,
    );
  });

  it('recalculates private lesson totals when PSC copies a missing line-item discount', async () => {
    const repository = createPersistence();
    const replacement = {
      id: 3001,
      courseId: 77,
      teacherId: 701,
      date: new Date('2026-05-12T15:00:00.000Z'),
      duration: '00:30:00',
      programRate: 65,
      tax: 0,
      course: {
        id: 77,
        programId: 901,
        program: { type: Program.TYPE_PRIVATE_PROGRAM },
      },
    } as Lesson;
    const oldLesson = {
      id: 2901,
      courseId: 77,
      teacherId: 701,
      date: new Date('2026-05-05T15:00:00.000Z'),
      dueDate: new Date('2026-04-15T00:00:00.000Z'),
      discounts: [
        {
          id: 901,
          lessonId: 2901,
          type: LessonDiscount.TYPE_LINE_ITEM,
          value: 3.75,
          valueType: 0,
          enrolmentId: null,
        } as LessonDiscount,
      ],
    } as Lesson;
    const copiedDiscount = {
      ...oldLesson.discounts[0],
      lessonId: replacement.id,
    };
    repository.findNewLessons.mockResolvedValue([replacement]);
    repository.findOldLessons.mockResolvedValue([oldLesson]);
    repository.findPaidAmounts.mockResolvedValue(new Map([[2901, 28.75]]));
    repository.saveDiscountCopies.mockResolvedValue([copiedDiscount]);
    repository.findPrivateLessons.mockResolvedValue([
      { id: 401, lessonId: 3001, total: 32.5, balance: 3.75 } as never,
    ]);
    repository.resolvePrivateLessonRoot.mockResolvedValue({
      rootLessonId: 3001,
      rootExpiryDate: null,
    });
    const confirmer = new PermanentScheduleChangeConfirmer(
      repository as unknown as PermanentScheduleChangeConfirmationPersistence,
    );

    await confirmer.confirm(
      { id: 77, endDate: new Date('2026-06-01T15:00:00.000Z') } as Course,
      [replacement],
      '01-05-2026',
      '12-05-2026',
      7001,
    );

    expect(repository.saveDiscountCopies).toHaveBeenCalledWith(3001, [
      oldLesson.discounts[0],
    ]);
    expect(repository.updatePrivateLesson).toHaveBeenCalledWith(
      { id: 401 },
      expect.objectContaining({ total: 28.75, balance: 0 }),
    );
  });

  it('rejects an invalid PSC date before mutating lessons', async () => {
    const repository = createPersistence();
    const confirmer = new PermanentScheduleChangeConfirmer(
      repository as unknown as PermanentScheduleChangeConfirmationPersistence,
    );

    await expect(
      confirmer.confirm(
        { id: 77 } as Course,
        [],
        'bad-date',
        '12-05-2026',
        7001,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(repository.findOldLessons).not.toHaveBeenCalled();
    expect(repository.cancelLesson).not.toHaveBeenCalled();
  });

  it('cancels an old lesson through the PSC repository port', async () => {
    const repository = createPersistence();
    const replacement = {
      id: 4001,
      courseId: 77,
      teacherId: 701,
      date: new Date('2026-09-07T15:00:00.000Z'),
    } as Lesson;
    const oldLesson = {
      id: 3901,
      courseId: 77,
      teacherId: 701,
      date: new Date('2026-09-01T15:00:00.000Z'),
    } as Lesson;
    repository.findNewLessons.mockResolvedValue([replacement]);
    repository.findOldLessons.mockResolvedValue([oldLesson]);
    const confirmer = new PermanentScheduleChangeConfirmer(
      repository as unknown as PermanentScheduleChangeConfirmationPersistence,
    );

    await confirmer.confirm(
      { id: 77 } as Course,
      [replacement],
      '07-09-2026',
      '07-09-2026',
      7001,
    );

    expect(repository.findOldLessons).toHaveBeenCalledWith(
      77,
      new Date('2026-09-01T00:00:00.000Z'),
      [],
    );
    expect(repository.cancelLesson).toHaveBeenCalledWith(3901);
    expect(oldLesson.status).not.toBe(LessonStatusEnum.CANCELED);
  });

  it('transfers financial relationships in original occurrence order', async () => {
    const repository = createPersistence();
    const replacements = [
      {
        id: 5001,
        courseId: 77,
        teacherId: 701,
        date: new Date('2026-10-03T17:30:00.000Z'),
      },
      {
        id: 5002,
        courseId: 77,
        teacherId: 701,
        date: new Date('2026-10-10T17:30:00.000Z'),
      },
      {
        id: 5003,
        courseId: 77,
        teacherId: 701,
        date: new Date('2026-11-07T17:30:00.000Z'),
      },
    ] as Lesson[];
    const oldLessonsInScheduledDateOrder = [
      {
        id: 4901,
        courseId: 77,
        teacherId: 701,
        date: new Date('2026-10-05T17:30:00.000Z'),
        originalDate: new Date('2026-10-05T17:30:00.000Z'),
        dueDate: new Date('2026-09-15T00:00:00.000Z'),
        status: LessonStatusEnum.SCHEDULED,
        discounts: [],
      },
      {
        id: 4902,
        courseId: 77,
        teacherId: 701,
        date: new Date('2026-11-02T17:30:00.000Z'),
        originalDate: new Date('2026-11-02T17:30:00.000Z'),
        dueDate: new Date('2026-10-15T00:00:00.000Z'),
        status: LessonStatusEnum.SCHEDULED,
        discounts: [],
      },
      {
        id: 4903,
        courseId: 77,
        teacherId: 701,
        date: new Date('2026-11-29T17:30:00.000Z'),
        originalDate: new Date('2026-10-12T17:30:00.000Z'),
        dueDate: new Date('2026-09-15T00:00:00.000Z'),
        status: LessonStatusEnum.RESCHEDULED,
        discounts: [],
      },
    ] as Lesson[];
    repository.findNewLessons.mockResolvedValue(replacements);
    repository.findOldLessons.mockResolvedValue(oldLessonsInScheduledDateOrder);
    const confirmer = new PermanentScheduleChangeConfirmer(
      repository as unknown as PermanentScheduleChangeConfirmationPersistence,
    );

    await confirmer.confirm(
      { id: 77 } as Course,
      replacements,
      '01-10-2026',
      '07-11-2026',
      7001,
    );

    expect(repository.movePaymentCycle.mock.calls).toEqual([
      [4901, 5001],
      [4903, 5002],
      [4902, 5003],
    ]);
    expect(repository.moveLessonPayments.mock.calls).toEqual([
      [4901, 5001],
      [4903, 5002],
      [4902, 5003],
    ]);
    expect(repository.updateLessonDueDate.mock.calls).toEqual([
      [5001, '2026-09-15'],
      [5002, '2026-09-15'],
      [5003, '2026-10-15'],
    ]);
  });
});
