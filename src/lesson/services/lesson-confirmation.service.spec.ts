import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { LessonConfirmationService } from './lesson-confirmation.service';
import { Program } from '../../program/entities/program.entity';
import { EnrolmentDiscount } from '../../enrolment/entities/enrolment-discount.entity';
import { LessonStatusEnum } from '../enums/lesson-status';

function createRepositoryMock() {
  return {
    find: vi.fn(),
    insert: vi.fn(async () => ({ identifiers: [] })),
    findOne: vi.fn(),
    create: vi.fn((payload) => payload),
    save: vi.fn(async (payload) => payload),
    update: vi.fn(async () => ({ affected: 1 })),
    delete: vi.fn(async () => ({ affected: 1 })),
    createQueryBuilder: vi.fn(),
  };
}

describe('LessonConfirmationService', () => {
  let service: LessonConfirmationService;

  let courseRepository: ReturnType<typeof createRepositoryMock>;
  let lessonRepository: ReturnType<typeof createRepositoryMock>;
  let privateLessonRepository: ReturnType<typeof createRepositoryMock>;
  let lessonHierarchyRepository: ReturnType<typeof createRepositoryMock>;
  let privateLessonEmailStatusRepository: ReturnType<
    typeof createRepositoryMock
  >;
  let enrolmentRepository: ReturnType<typeof createRepositoryMock>;
  let studentRepository: ReturnType<typeof createRepositoryMock>;
  let userRepository: ReturnType<typeof createRepositoryMock>;
  let lessonDiscountRepository: ReturnType<typeof createRepositoryMock>;
  let customerDiscountRepository: ReturnType<typeof createRepositoryMock>;
  let enrolmentDiscountRepository: ReturnType<typeof createRepositoryMock>;
  let paymentCycleRepository: ReturnType<typeof createRepositoryMock>;
  let enrolmentPaymentFrequencyRepository: ReturnType<
    typeof createRepositoryMock
  >;
  let bulkRescheduleLessonRepository: ReturnType<typeof createRepositoryMock>;
  let courseScheduleRepository: ReturnType<typeof createRepositoryMock>;
  let paymentCycleLessonRepository: ReturnType<typeof createRepositoryMock>;
  let qualificationRepository: ReturnType<typeof createRepositoryMock>;
  let lessonPaymentRepository: ReturnType<typeof createRepositoryMock>;
  let customerBalanceRecalculatorService: {
    recalculateAndPersist: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    courseRepository = createRepositoryMock();
    lessonRepository = createRepositoryMock();
    privateLessonRepository = createRepositoryMock();
    lessonHierarchyRepository = createRepositoryMock();
    privateLessonEmailStatusRepository = createRepositoryMock();
    enrolmentRepository = createRepositoryMock();
    studentRepository = createRepositoryMock();
    userRepository = createRepositoryMock();
    lessonDiscountRepository = createRepositoryMock();
    customerDiscountRepository = createRepositoryMock();
    enrolmentDiscountRepository = createRepositoryMock();
    paymentCycleRepository = createRepositoryMock();
    enrolmentPaymentFrequencyRepository = createRepositoryMock();
    bulkRescheduleLessonRepository = createRepositoryMock();
    courseScheduleRepository = createRepositoryMock();
    paymentCycleLessonRepository = createRepositoryMock();
    qualificationRepository = createRepositoryMock();
    lessonPaymentRepository = createRepositoryMock();
    customerBalanceRecalculatorService = {
      recalculateAndPersist: vi.fn(async () => undefined),
    };

    service = new LessonConfirmationService(
      courseRepository as any,
      lessonRepository as any,
      privateLessonRepository as any,
      lessonHierarchyRepository as any,
      {} as any,
      privateLessonEmailStatusRepository as any,
      enrolmentRepository as any,
      studentRepository as any,
      userRepository as any,
      lessonDiscountRepository as any,
      customerDiscountRepository as any,
      enrolmentDiscountRepository as any,
      paymentCycleRepository as any,
      enrolmentPaymentFrequencyRepository as any,
      {} as any,
      bulkRescheduleLessonRepository as any,
      courseScheduleRepository as any,
      paymentCycleLessonRepository as any,
      qualificationRepository as any,
      lessonPaymentRepository as any,
      customerBalanceRecalculatorService as any,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws NotFoundException when course does not exist', async () => {
    courseRepository.findOne.mockResolvedValue(null);

    await expect(service.confirmLessonsForCourse(77, 3, 7001)).rejects.toThrow(
      new NotFoundException('Course with ID 77 not found'),
    );
    expect(courseRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 77, locationId: 3, isDeleted: false },
      }),
    );
  });

  it('does not throw when recalculation fails in non-strict mode', async () => {
    const error = new Error('balance failed');
    customerBalanceRecalculatorService.recalculateAndPersist = vi.fn(
      async () => {
      throw error;
      },
    );

    await expect(service.updateCustomerBalance(401)).resolves.toBeUndefined();
    expect(
      customerBalanceRecalculatorService.recalculateAndPersist,
    ).toHaveBeenCalledWith(
      401,
      expect.objectContaining({
        manager: undefined,
        updatedByUserId: undefined,
        locationSlug: undefined,
      }),
    );
  });

  it('rethrows when recalculation fails in strict mode', async () => {
    const error = new Error('balance failed strict');
    customerBalanceRecalculatorService.recalculateAndPersist = vi.fn(
      async () => {
      throw error;
      },
    );

    await expect(
      service.updateCustomerBalance(401, { strict: true }),
    ).rejects.toThrow('balance failed strict');
    expect(
      customerBalanceRecalculatorService.recalculateAndPersist,
    ).toHaveBeenCalledWith(
      401,
      expect.objectContaining({
        manager: undefined,
        updatedByUserId: undefined,
        locationSlug: undefined,
      }),
    );
  });

  it('does not wrap regular confirmation in a transaction', async () => {
    const course = {
      id: 77,
      startDate: new Date(),
      endDate: new Date(),
      program: { type: Program.TYPE_PRIVATE_PROGRAM },
      enrolments: [],
    };
    const transactionSpy = vi.fn(async (callback: any) => callback(undefined));
    const transactionManager = { transaction: transactionSpy };

    lessonRepository.manager = transactionManager;
    courseRepository.findOne.mockResolvedValue(course);
    lessonRepository.find.mockResolvedValue([]);

    const confirmWithScopeSpy = vi
      .spyOn(service as any, 'confirmLessonsForCourseWithScope')
      .mockResolvedValue(101);

    const result = await service.confirmLessonsForCourse(77, 3, 7001);

    expect(transactionSpy).not.toHaveBeenCalled();
    expect(confirmWithScopeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        course,
        userId: 7001,
        lessonsToConfirm: [],
      }),
    );
    expect(result).toBe(101);
  });

  it('confirms a private monthly draft enrolment and builds the legacy billable lesson graph', async () => {
    const course = {
      id: 77,
      startDate: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
      endDate: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
      program: { type: Program.TYPE_PRIVATE_PROGRAM },
      enrolments: [{ id: 201, student: { id: 301, user: { id: 401 } } }],
    };
    const draftLesson = {
      id: 1001,
      courseId: 77,
      date: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
      duration: '00:45:00',
      total: 120,
      dueDate: new Date(Date.UTC(2026, 3, 7, 0, 0, 0)),
      originalDate: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
      isConfirmed: false,
      isDeleted: false,
    };
    const confirmedLesson = {
      ...draftLesson,
      isConfirmed: true,
      course: {
        program: { type: Program.TYPE_PRIVATE_PROGRAM },
        enrolments: [
          {
            id: 201,
            student: { id: 301, user: { id: 401 } },
            discounts: undefined,
          },
        ],
      },
    };

    courseRepository.findOne.mockResolvedValue(course);
    lessonRepository.find
      .mockResolvedValueOnce([draftLesson])
      .mockResolvedValueOnce([confirmedLesson])
      .mockResolvedValueOnce([confirmedLesson]);
    lessonHierarchyRepository.findOne.mockResolvedValue(null);
    privateLessonRepository.findOne.mockResolvedValue(null);
    privateLessonEmailStatusRepository.find.mockResolvedValue([]);
    customerDiscountRepository.findOne.mockResolvedValue({ value: 7.5 });
    lessonDiscountRepository.findOne.mockResolvedValue(null);
    enrolmentDiscountRepository.find.mockResolvedValue([
      {
        type: EnrolmentDiscount.TYPE_PAYMENT_FREQUENCY,
        discount: 10,
      },
      {
        type: EnrolmentDiscount.TYPE_MULTIPLE_ENROLMENT,
        discount: 24,
        discountType: EnrolmentDiscount.VALUE_TYPE_DOLLAR,
      },
    ]);
    enrolmentRepository.findOne.mockResolvedValueOnce({
      id: 201,
      student: { id: 301, user: { id: 401 } },
      paymentFrequency: { frequencyLength: 1 },
    });
    enrolmentPaymentFrequencyRepository.findOne.mockResolvedValue({
      enrolmentId: 201,
      paymentCycleStartDate: new Date(Date.UTC(2026, 3, 1, 0, 0, 0)),
    });
    paymentCycleRepository.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 901,
          enrolmentId: 201,
          startDate: new Date(Date.UTC(2026, 3, 1, 0, 0, 0)),
          endDate: new Date(Date.UTC(2026, 3, 30, 0, 0, 0)),
          isDeleted: 0,
        },
      ]);
    paymentCycleRepository.save.mockImplementation(async (payload: any) => ({
      id: 901,
      ...payload,
    }));

    const createPaymentCycleLessonsSpy = vi
      .spyOn(service as any, 'createPaymentCycleLessons')
      .mockResolvedValue(undefined);
    const confirmCustomerSpy = vi
      .spyOn(service, 'confirmCustomer')
      .mockResolvedValue(true);

    const enrolmentId = await service.confirmLessonsForCourse(77, 3, 7001);

    expect(enrolmentId).toBe(201);
    expect(courseRepository.update).toHaveBeenCalledWith(
      { id: 77 },
      { isConfirmed: 1 },
    );
    expect(lessonRepository.update).toHaveBeenCalledWith(
      { id: 1001 },
      { isConfirmed: true },
    );
    expect(privateLessonRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonId: 1001,
        total: 120,
        balance: 120,
      }),
    );
    expect(privateLessonEmailStatusRepository.insert).toHaveBeenCalledTimes(1);
    expect(privateLessonEmailStatusRepository.insert.mock.calls[0][0]).toEqual(
      [1, 2, 3, 4].map((notificationType) => ({
        lessonId: expect.any(Number),
        notificationType,
        status: 0,
      })),
    );
    expect(lessonDiscountRepository.save).toHaveBeenCalledTimes(3);
    expect(confirmCustomerSpy).toHaveBeenCalledWith(201, 7001, undefined);
    expect(paymentCycleRepository.save).toHaveBeenCalledTimes(1);
    expect(createPaymentCycleLessonsSpy).toHaveBeenCalledWith(
      901,
      77,
      new Date(2026, 3, 1),
      new Date(2026, 4, 0),
    );
    expect(lessonRepository.update).toHaveBeenCalledWith(
      { id: 1001 },
      { dueDate: new Date(Date.UTC(2026, 2, 15, 0, 0, 0)) },
    );
    expect(
      lessonRepository.find.mock.calls.some(
        ([criteria]) =>
          criteria?.where?.courseId === 77 &&
          criteria?.where?.isConfirmed === true &&
          criteria?.where?.isDeleted === false &&
          criteria?.where?.status?._type === 'not' &&
          criteria?.where?.status?._value === LessonStatusEnum.CANCELED &&
          Array.isArray(criteria?.relations) &&
          criteria.relations[0] === 'course' &&
          criteria?.order?.date === 'ASC',
      ),
    ).toBe(true);
    expect(
      customerBalanceRecalculatorService.recalculateAndPersist,
    ).toHaveBeenCalledWith(
      401,
      expect.objectContaining({
        manager: undefined,
      }),
    );
  });

  it('creates an initial partial cycle before the regular monthly cycle when payment-cycle effective date starts next month', async () => {
    const course = {
      id: 88,
      startDate: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
      endDate: new Date(Date.UTC(2026, 4, 12, 15, 0, 0)),
      program: { type: Program.TYPE_PRIVATE_PROGRAM },
      enrolments: [{ id: 202, student: { id: 302, user: { id: 402 } } }],
    };
    const draftLessons = [
      {
        id: 1101,
        courseId: 88,
        date: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
        duration: '00:45:00',
        total: 120,
        dueDate: new Date(Date.UTC(2026, 3, 7, 0, 0, 0)),
        originalDate: new Date(Date.UTC(2026, 3, 7, 15, 0, 0)),
        isConfirmed: false,
        isDeleted: false,
      },
      {
        id: 1102,
        courseId: 88,
        date: new Date(Date.UTC(2026, 4, 12, 15, 0, 0)),
        duration: '00:45:00',
        total: 120,
        dueDate: new Date(Date.UTC(2026, 4, 12, 0, 0, 0)),
        originalDate: new Date(Date.UTC(2026, 4, 12, 15, 0, 0)),
        isConfirmed: false,
        isDeleted: false,
      },
    ];
    const confirmedLessons = draftLessons.map((lesson) => ({
      ...lesson,
      isConfirmed: true,
      course: {
        program: { type: Program.TYPE_PRIVATE_PROGRAM },
        enrolments: [
          {
            id: 202,
            student: { id: 302, user: { id: 402 } },
            discounts: [],
          },
        ],
      },
    }));

    courseRepository.findOne.mockResolvedValue(course);
    lessonRepository.find
      .mockResolvedValueOnce(draftLessons)
      .mockResolvedValueOnce(confirmedLessons)
      .mockResolvedValueOnce(confirmedLessons);
    lessonHierarchyRepository.findOne.mockResolvedValue(null);
    privateLessonRepository.findOne.mockResolvedValue(null);
    privateLessonEmailStatusRepository.find.mockResolvedValue([]);
    customerDiscountRepository.findOne.mockResolvedValue(null);
    lessonDiscountRepository.findOne.mockResolvedValue(null);
    enrolmentDiscountRepository.find.mockResolvedValue([]);
    enrolmentRepository.findOne.mockResolvedValueOnce({
      id: 202,
      student: { id: 302, user: { id: 402 } },
      paymentFrequency: { frequencyLength: 1 },
    });
    enrolmentPaymentFrequencyRepository.findOne.mockResolvedValue({
      enrolmentId: 202,
      paymentCycleStartDate: new Date(Date.UTC(2026, 4, 1, 0, 0, 0)),
    });
    paymentCycleRepository.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 911,
          enrolmentId: 202,
          startDate: new Date(Date.UTC(2026, 3, 1, 0, 0, 0)),
          endDate: new Date(Date.UTC(2026, 3, 30, 0, 0, 0)),
          isDeleted: 0,
        },
        {
          id: 912,
          enrolmentId: 202,
          startDate: new Date(Date.UTC(2026, 4, 1, 0, 0, 0)),
          endDate: new Date(Date.UTC(2026, 4, 31, 0, 0, 0)),
          isDeleted: 0,
        },
      ]);
    paymentCycleRepository.save
      .mockResolvedValueOnce({
        id: 911,
        enrolmentId: 202,
        startDate: new Date(2026, 3, 1),
        endDate: new Date(2026, 4, 0),
      })
      .mockResolvedValueOnce({
        id: 912,
        enrolmentId: 202,
        startDate: new Date(2026, 4, 1),
        endDate: new Date(2026, 5, 0),
      });

    const createPaymentCycleLessonsSpy = vi
      .spyOn(service as any, 'createPaymentCycleLessons')
      .mockResolvedValue(undefined);
    vi.spyOn(service, 'confirmCustomer').mockResolvedValue(true);

    await service.confirmLessonsForCourse(88, 3, 7001);

    expect(paymentCycleRepository.save).toHaveBeenCalledTimes(2);
    expect(paymentCycleRepository.save).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        enrolmentId: 202,
        startDate: new Date(2026, 3, 1),
        endDate: new Date(2026, 4, 0),
      }),
    );
    expect(paymentCycleRepository.save).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        enrolmentId: 202,
        startDate: new Date(2026, 4, 1),
        endDate: new Date(2026, 5, 0),
      }),
    );
    expect(createPaymentCycleLessonsSpy).toHaveBeenNthCalledWith(
      1,
      911,
      88,
      new Date(2026, 3, 1),
      new Date(2026, 4, 0),
    );
    expect(createPaymentCycleLessonsSpy).toHaveBeenNthCalledWith(
      2,
      912,
      88,
      new Date(2026, 4, 1),
      new Date(2026, 5, 0),
    );
  });
});
