import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditDiscountService } from './edit-discount.service';
import { Lesson } from '../../entities/lesson.entity';
import { PrivateLesson } from '../../entities/private-lesson.entity';
import { Program } from '../../../program/entities/program.entity';
import { LessonStatusEnum } from '../../enums/lesson-status';
import { User } from '../../../user/entities/user.entity';

function createManagerMock() {
  const lessonRepo = {
    find: vi.fn(),
    save: vi.fn(async (payload) => payload),
  };
  const privateLessonRepo = {
    save: vi.fn(async (payload) => payload),
  };
  const userRepo = {
    findOne: vi.fn(),
  };

  return {
    queryRunner: { data: {} as Record<string, unknown> },
    lessonRepo,
    privateLessonRepo,
    userRepo,
    getRepository: vi.fn((entity: any) => {
      if (entity === Lesson) return lessonRepo;
      if (entity === PrivateLesson) return privateLessonRepo;
      if (entity === User) return userRepo;
      throw new Error(`Unexpected repository request: ${entity?.name || entity}`);
    }),
  };
}

describe('EditDiscountService', () => {
  let service: EditDiscountService;
  let entityManager: { transaction: ReturnType<typeof vi.fn> };
  let editDiscountRepository: any;
  let editClassroomRepository: any;
  let customerBalanceRecalculatorService: any;
  let managerMock: ReturnType<typeof createManagerMock>;

  beforeEach(() => {
    managerMock = createManagerMock();
    entityManager = {
      transaction: vi.fn(async (callback: any) => callback(managerMock)),
    };
    editDiscountRepository = {
      getPrimaryEnrolmentIdsByLessonIds: vi.fn(),
      getCreditAppliedTotalsByLessonIds: vi.fn(),
      discountLessons: vi.fn(),
      discountLessonsBulk: vi.fn(),
      getLessonPaymentsForUnwind: vi.fn(),
      softDeleteLessonPayment: vi.fn(),
      updateLessonPaymentAmount: vi.fn(),
      recalculatePaymentBalances: vi.fn(),
      getCustomerIdsByEnrolmentIds: vi.fn(),
    };
    editClassroomRepository = {
      getInvoicedLessonIds: vi.fn(),
    };
    customerBalanceRecalculatorService = {
      recalculateAndPersist: vi.fn(),
    };

    service = new EditDiscountService(
      entityManager as any,
      editDiscountRepository as any,
      editClassroomRepository as any,
      customerBalanceRecalculatorService as any,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes the resolved enrolmentId into the lesson discount upsert', async () => {
    const lesson = Object.assign(new Lesson(), {
      id: 1001,
      courseId: 77,
      date: new Date('2026-06-08T10:00:00.000Z'),
      duration: '00:30:00',
      status: LessonStatusEnum.SCHEDULED,
      isDeleted: false,
      isConfirmed: true,
      type: 1,
      programRate: 65,
      teacherRate: 0,
      teacherRateOld: 0,
      tax: 0,
      course: {
        program: {
          type: Program.TYPE_PRIVATE_PROGRAM,
        },
      },
    });
    lesson.discounts = [
      {
        type: 2,
        value: 50,
        valueType: 1,
      } as any,
    ];
      lesson.privateLesson = [
        Object.assign(new PrivateLesson(), {
          id: 9001,
          lessonId: 1001,
          total: 16.25,
          balance: 16.25,
        }),
      ];

    managerMock.lessonRepo.find
      .mockResolvedValueOnce([lesson])
      .mockResolvedValueOnce([lesson]);
    managerMock.userRepo.findOne.mockResolvedValue({ id: 501, profile: {} });
    editClassroomRepository.getInvoicedLessonIds.mockResolvedValue([]);
    editDiscountRepository.getPrimaryEnrolmentIdsByLessonIds.mockResolvedValue([
      { lessonId: 1001, enrolmentId: 32154 },
    ]);
    editDiscountRepository.getCreditAppliedTotalsByLessonIds.mockResolvedValue([]);
    editDiscountRepository.getCustomerIdsByEnrolmentIds.mockResolvedValue([501]);

    const result = await service.editDiscount(
      {
        lessonIds: [1001],
        paymentFrequencyDiscount: 50,
      } as any,
      3,
      'woodbridge',
      7001,
    );

    expect(result.status).toBe(true);
    expect(managerMock.queryRunner.data.currentUserId).toBe(7001);
    expect(editDiscountRepository.discountLessons).toHaveBeenCalledWith(
      1001,
      2,
      50,
      1,
      32154,
      managerMock,
    );
    expect(editDiscountRepository.discountLessonsBulk).not.toHaveBeenCalled();
  });

});
