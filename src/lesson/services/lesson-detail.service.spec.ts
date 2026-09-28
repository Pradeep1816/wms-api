import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Lesson } from '../entities/lesson.entity';
import { LessonDiscount } from '../entities/lesson-discount.entity';
import type { LessonDetailRepository } from '../repositories/lesson-detail.repository';
import type { LessonScheduleRepository } from '../repositories/lesson-schedule.repository';
import type { LessonConfirmationService } from './lesson-confirmation.service';
import { LessonDetailService } from './lesson-detail.service';
import type { LessonPaymentService } from './lesson-payment.service';
import type { LessonScheduleTransformationService } from './transformation/lesson-schedule-transformation.service';

describe('LessonDetailService', () => {
  let service: LessonDetailService;
  let lessonDetailRepository: Record<string, ReturnType<typeof vi.fn>>;
  let lessonScheduleTransformationService: Record<
    string,
    ReturnType<typeof vi.fn>
  >;
  let lessonConfirmationService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    lessonDetailRepository = {
      findLessonDetailsById: vi.fn(),
      updateTeacherRate: vi.fn(),
      getLessonDiscounts: vi.fn(),
      getLessonPayments: vi.fn(),
      updatePrivateLessonTotals: vi.fn(),
      getCustomerIdByLesson: vi.fn(),
    };
    lessonScheduleTransformationService = {
      calculateUnit: vi.fn(),
      calculateGrossPrice: vi.fn(),
      calculateDiscount: vi.fn(),
      calculateSubTotal: vi.fn(),
      calculateNetCost: vi.fn(
        (teacherRate: number, unit: number) => teacherRate * unit,
      ),
      calculateProfit: vi.fn(
        (subTotal: number, netCost: number) => subTotal - netCost,
      ),
    };
    lessonConfirmationService = {
      updateCustomerBalance: vi.fn(),
    };
    service = new LessonDetailService(
      lessonDetailRepository as unknown as LessonDetailRepository,
      {} as LessonScheduleRepository,
      lessonScheduleTransformationService as unknown as LessonScheduleTransformationService,
      lessonConfirmationService as unknown as LessonConfirmationService,
      {} as LessonPaymentService,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves an exploded child total when only teacher cost changes', async () => {
    const discounts = [
      Object.assign(new LessonDiscount(), {
        type: LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
        value: 0.63,
        valueType: 0,
      }),
      Object.assign(new LessonDiscount(), {
        type: LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
        value: 6,
        valueType: 1,
      }),
    ];
    const lesson = Object.assign(new Lesson(), {
      id: 5275001,
      isExploded: 1,
      duration: '00:15:00',
      programRate: 65,
      teacherRate: 10,
      tax: 0,
      privateLesson: [
        {
          id: 9001,
          lessonId: 5275001,
          total: 14.69,
          balance: 14.69,
        },
      ],
    });

    lessonDetailRepository.findLessonDetailsById.mockResolvedValue(lesson);
    lessonDetailRepository.getLessonDiscounts.mockResolvedValue(discounts);
    lessonDetailRepository.getLessonPayments.mockResolvedValue(0);
    lessonDetailRepository.getCustomerIdByLesson.mockResolvedValue(14863);

    const result = await service.updateLessonCost(lesson.id, 15, 20, 694);

    expect(lessonDetailRepository.updateTeacherRate).toHaveBeenCalledWith(
      lesson.id,
      20,
      694,
    );
    expect(lessonDetailRepository.getLessonPayments).not.toHaveBeenCalled();
    expect(
      lessonDetailRepository.updatePrivateLessonTotals,
    ).not.toHaveBeenCalled();
    expect(
      lessonConfirmationService.updateCustomerBalance,
    ).toHaveBeenCalledWith(14863);
    expect(result).toEqual({
      costPerHour: '$20.00',
      cost: '$5.00',
      price: '$14.69',
      profit: '$9.69',
    });
  });

  it('retains legacy total recalculation for a non-exploded lesson', async () => {
    const discounts = [
      Object.assign(new LessonDiscount(), {
        type: LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
        value: 1.25,
        valueType: 0,
      }),
      Object.assign(new LessonDiscount(), {
        type: LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
        value: 6,
        valueType: 1,
      }),
    ];
    const lesson = Object.assign(new Lesson(), {
      id: 5275002,
      isExploded: 0,
      duration: '00:30:00',
      programRate: 65,
      teacherRate: 10,
      tax: 0,
      privateLesson: [
        {
          id: 9002,
          lessonId: 5275002,
          total: 29.38,
          balance: 19.37,
        },
      ],
    });

    lessonDetailRepository.findLessonDetailsById.mockResolvedValue(lesson);
    lessonDetailRepository.getLessonDiscounts.mockResolvedValue(discounts);
    lessonDetailRepository.getLessonPayments.mockResolvedValue(10.01);
    lessonDetailRepository.getCustomerIdByLesson.mockResolvedValue(14863);

    await service.updateLessonCost(lesson.id, 15, 20, 694);

    expect(lessonDetailRepository.getLessonPayments).toHaveBeenCalledWith(
      lesson.id,
    );
    expect(
      lessonDetailRepository.updatePrivateLessonTotals,
    ).toHaveBeenCalledWith(9002, 29.38, 19.37);
  });
});
