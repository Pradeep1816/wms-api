import { describe, expect, it } from 'vitest';
import { Lesson } from '../../entities/lesson.entity';
import { LessonScheduleTransformationService } from './lesson-schedule-transformation.service';
import { LessonDiscount } from '../../entities/lesson-discount.entity';
import { ProgramTypeEnum } from '../../../program/enums/program-type';
import { LessonStatusEnum } from '../../enums/lesson-status';

describe('LessonScheduleTransformationService', () => {
  const service = new LessonScheduleTransformationService();

  it('rounds borderline floating-point values with legacy half-up behavior', () => {
    expect(service.round(28.75 * 0.06)).toBe(1.73);
    expect(service.round(-28.75 * 0.06)).toBe(-1.73);
  });

  it('applies legacy balance tolerance after rounding', () => {
    expect(service.roundBalance(0.094)).toBe(0);
    expect(service.roundBalance(-0.094)).toBe(0);
    expect(service.roundBalance(0.105)).toBe(0.11);
  });

  it('formats private lesson totals with the same rounding as legacy', () => {
    const lesson = {
      teacherRate: 0,
      programRate: 57.5,
      duration: '00:30:00',
      tax: 0,
      status: LessonStatusEnum.SCHEDULED,
      isPresent: true,
      course: {
        program: { type: ProgramTypeEnum.PRIVATE_PROGRAM },
        enrolments: [],
      },
      privateLesson: [{ total: 27.03, balance: 27.03 }],
    } as any;

    const discounts = [
      {
        type: LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
        value: 6,
        valueType: 1,
      },
    ] as any[];

    const result = service.transformToAttendanceCostTotals(lesson, discounts, 0);

    expect(result.totals.discount).toBe('$1.72');
    expect(result.totals.subTotal).toBe('$27.03');
    expect(result.totals.total).toBe('$27.03');
    expect(result.totals.balance).toBe('$27.03');
  });

  it('uses the stored private lesson total when discount math would otherwise drift', () => {
    const lesson = Object.assign(new Lesson(), {
      teacherRate: 0,
      programRate: 65,
      duration: '00:15:00',
      tax: 0,
      status: LessonStatusEnum.SCHEDULED,
      isPresent: true,
      course: {
        program: { type: ProgramTypeEnum.PRIVATE_PROGRAM },
        enrolments: [],
      },
      privateLesson: [{ total: 14.69, balance: 14.69 }],
    });

    const discounts = [
      {
        type: LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
        value: 0.63,
        valueType: 0,
      },
      {
        type: LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
        value: 6,
        valueType: 1,
      },
    ] as any[];

    const result = service.transformToAttendanceCostTotals(lesson, discounts, 0);

    expect(result.cost.price).toBe('$14.69');
    expect(result.cost.profit).toBe('$14.69');
    expect(result.totals.discount).toBe('$1.56');
    expect(result.totals.subTotal).toBe('$14.69');
    expect(result.totals.total).toBe('$14.69');
    expect(result.totals.balance).toBe('$14.69');
  });

  it('renders the quarter-hour cent case through the shared lesson math', () => {
    const lesson = {
      teacherRate: 0,
      programRate: 64.98,
      duration: '00:15:00',
      tax: 0,
      status: LessonStatusEnum.SCHEDULED,
      isPresent: true,
      course: {
        program: { type: ProgramTypeEnum.PRIVATE_PROGRAM },
        enrolments: [],
      },
      privateLesson: [],
    } as any;

    const discounts = [
      {
        type: LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
        value: 0.625,
        valueType: 0,
      },
    ] as any[];

    const result = service.transformToAttendanceCostTotals(lesson, discounts, 0);

    expect(result.totals.lessonPrice).toBe('$16.25');
    expect(result.totals.discount).toBe('$0.63');
    expect(result.cost.price).toBe('$15.63');
    expect(result.totals.subTotal).toBe('$15.63');
    expect(result.totals.total).toBe('$15.63');
    expect(result.totals.balance).toBe('$15.63');
  });

  it('shows lesson price minus displayed discount as the subtotal for stacked discounts', () => {
    const lesson = Object.assign(new Lesson(), {
      teacherRate: 0,
      programRate: 72,
      duration: '00:30:00',
      tax: 0,
      status: LessonStatusEnum.SCHEDULED,
      isPresent: true,
      course: {
        program: { type: ProgramTypeEnum.PRIVATE_PROGRAM },
        enrolments: [],
      },
      privateLesson: [{ total: 33.71, balance: 33.71 }],
    });

    const discounts = [
      {
        type: LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
        value: 1.25,
        valueType: 0,
      },
      {
        type: LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
        value: 3,
        valueType: 1,
      },
    ] as any[];

    const result = service.transformToAttendanceCostTotals(lesson, discounts, 0);

    expect(result.totals.lessonPrice).toBe('$36.00');
    expect(result.totals.discount).toBe('$2.29');
    expect(result.totals.subTotal).toBe('$33.71');
    expect(result.totals.total).toBe('$33.71');
    expect(result.totals.balance).toBe('$33.71');
  });

  it('uses the flat group rate instead of lesson duration math for group lessons', () => {
    const lesson = Object.assign(new Lesson(), {
      teacherRate: 0,
      programRate: 30,
      duration: '00:45:00',
      tax: 0,
      status: LessonStatusEnum.SCHEDULED,
      isPresent: true,
      course: {
        program: { type: ProgramTypeEnum.GROUP_PROGRAM },
        enrolments: [],
      },
      privateLesson: [],
      discounts: [],
    });

    const result = service.transformToAttendanceCostTotals(lesson, [], 0);

    expect(result.totals.lessonPrice).toBe('$30.00');
    expect(result.totals.discount).toBe('$0.00');
    expect(result.totals.subTotal).toBe('$30.00');
    expect(result.totals.total).toBe('$30.00');
    expect(result.totals.balance).toBe('$30.00');
    expect(result.cost.price).toBeNull();
    expect(result.cost.profit).toBeNull();
  });
});
