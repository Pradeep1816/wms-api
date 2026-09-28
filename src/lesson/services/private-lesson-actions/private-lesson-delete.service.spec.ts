import { describe, expect, it, vi } from 'vitest';
import { Program } from '../../../program/entities/program.entity';
import { PrivateLessonDeleteService } from './private-lesson-delete.service';

describe('PrivateLessonDeleteService', () => {
  it('restores the royalty classification for credit released by a deleted paid lesson', async () => {
    const manager = {};
    const lesson = {
      id: 101,
      isDeleted: false,
      course: {
        id: 201,
        program: { type: Program.TYPE_PRIVATE_PROGRAM },
        enrolments: [
          {
            id: 301,
            isDeleted: false,
            isConfirmed: 1,
            student: { user: { id: 401 } },
          },
        ],
      },
    };
    const lessonPayment = {
      id: 501,
      lessonId: 101,
      paymentId: 601,
      enrolmentId: 301,
      amount: 32.5,
      royaltyCategoryId: 1,
      royaltyRateApplied: 6,
      advertisementRateApplied: 1.25,
    };
    const repo = {
      findLessonsForDelete: vi.fn().mockResolvedValue([lesson]),
      findLessonIdsWithInvoices: vi.fn().mockResolvedValue(new Set()),
      getLessonCreditAmountsBatch: vi
        .fn()
        .mockResolvedValue(new Map([['101,301', 32.5]])),
      getCreditAppliedLessonPaymentsBatch: vi
        .fn()
        .mockResolvedValue([lessonPayment]),
      softDeleteLessonPaymentsByIds: vi.fn().mockResolvedValue(undefined),
      recalculatePaymentBalancesForLessonPayments: vi
        .fn()
        .mockResolvedValue(undefined),
      softDeleteLessonsByIds: vi.fn().mockResolvedValue(undefined),
      updateCourseDates: vi.fn().mockResolvedValue(undefined),
    };
    const royaltyPaymentCorrectionService = {
      restoreDeletedLessonCredit: vi.fn().mockResolvedValue(true),
    };
    const customerBalanceRecalculatorService = {
      recalculateAndPersist: vi.fn().mockResolvedValue(undefined),
    };
    const entityManager = {
      transaction: vi.fn(async (callback) => callback(manager)),
    };
    const service = new PrivateLessonDeleteService(
      entityManager as any,
      repo as any,
      royaltyPaymentCorrectionService as any,
      customerBalanceRecalculatorService as any,
    );

    const result = await service.deleteLessons(
      'burlington',
      15,
      { lessonIds: [101] },
      694,
    );

    expect(result.status).toBe(true);
    expect(
      royaltyPaymentCorrectionService.restoreDeletedLessonCredit,
    ).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        paymentId: 601,
        lessonPaymentId: 501,
        locationId: 15,
        customerId: 401,
        amount: 32.5,
        itemCategoryId: 1,
        rateApplied: 6,
        advertisementRateApplied: 1.25,
        createdByUserId: 694,
      }),
    );
    expect(repo.softDeleteLessonPaymentsByIds).toHaveBeenCalledWith(
      [501],
      manager,
    );
    expect(
      repo.recalculatePaymentBalancesForLessonPayments,
    ).toHaveBeenCalledWith([501], manager);
  });
});
