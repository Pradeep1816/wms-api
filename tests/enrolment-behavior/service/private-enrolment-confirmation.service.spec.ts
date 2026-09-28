import { describe, expect, it, vi, afterEach } from 'vitest';
import { LessonConfirmationService } from '../../../src/lesson/services/lesson-confirmation.service';
import { Program } from '../../../src/program/entities/program.entity';
import { EnrolmentDiscount } from '../../../src/enrolment/entities/enrolment-discount.entity';

function createRepositoryMock() {
  return {
    find: vi.fn(),
    insert: vi.fn(async () => ({ identifiers: [] })),
    findOne: vi.fn(),
    create: vi.fn((payload) => payload),
    save: vi.fn(async (payload) => payload),
    update: vi.fn(async () => ({ affected: 1 })),
  };
}

function buildService() {
  const courseRepository = createRepositoryMock();
  const lessonRepository = createRepositoryMock();
  const privateLessonRepository = createRepositoryMock();
  const lessonHierarchyRepository = createRepositoryMock();
  const privateLessonEmailStatusRepository = createRepositoryMock();
  const enrolmentRepository = createRepositoryMock();
  const studentRepository = createRepositoryMock();
  const userRepository = createRepositoryMock();
  const lessonDiscountRepository = createRepositoryMock();
  const customerDiscountRepository = createRepositoryMock();
  const enrolmentDiscountRepository = createRepositoryMock();
  const paymentCycleRepository = createRepositoryMock();
  const enrolmentPaymentFrequencyRepository = createRepositoryMock();
  const bulkRescheduleLessonRepository = createRepositoryMock();
  const courseScheduleRepository = createRepositoryMock();
  const paymentCycleLessonRepository = createRepositoryMock();
  const lessonPaymentRepository = createRepositoryMock();
  const customerBalanceRecalculatorService = {
    recalculateAndPersist: vi.fn(async () => undefined),
  };

  const service = new LessonConfirmationService(
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
    {} as any,
    lessonPaymentRepository as any,
    customerBalanceRecalculatorService as any,
  );

  return {
    service,
    courseRepository,
    lessonRepository,
    privateLessonRepository,
    lessonHierarchyRepository,
    privateLessonEmailStatusRepository,
    enrolmentRepository,
    lessonDiscountRepository,
    customerDiscountRepository,
    enrolmentDiscountRepository,
    paymentCycleRepository,
    enrolmentPaymentFrequencyRepository,
    customerBalanceRecalculatorService,
  };
}

describe('enrolment behavior: private enrolment confirmation service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('confirms a private monthly draft enrolment and builds the billable lesson graph', async () => {
    const {
      service,
      courseRepository,
      lessonRepository,
      privateLessonRepository,
      lessonHierarchyRepository,
      privateLessonEmailStatusRepository,
      enrolmentRepository,
      lessonDiscountRepository,
      customerDiscountRepository,
      enrolmentDiscountRepository,
      paymentCycleRepository,
      enrolmentPaymentFrequencyRepository,
      customerBalanceRecalculatorService,
    } = buildService();

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
    const expectedCycleStart = new Date(2026, 3, 1);
    const expectedCycleEnd = new Date(2026, 3 + 1, 0);

    const enrolmentId = await service.confirmLessonsForCourse(77, 3, 7001);

    expect(enrolmentId).toBe(201);
    expect(courseRepository.update).toHaveBeenCalledWith({ id: 77 }, { isConfirmed: 1 });
    expect(lessonRepository.update).toHaveBeenCalledWith({ id: 1001 }, { isConfirmed: true });
    expect(privateLessonRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonId: 1001,
        total: 120,
        balance: 120,
      }),
    );
    expect(privateLessonEmailStatusRepository.insert).toHaveBeenCalledTimes(1);
    expect(privateLessonEmailStatusRepository.insert.mock.calls[0][0]).toEqual(
      [1, 2, 3, 4].map(notificationType => ({ lessonId: expect.any(Number), notificationType, status: 0 })),
    );
    expect(lessonDiscountRepository.save).toHaveBeenCalledTimes(3);
    expect(confirmCustomerSpy).toHaveBeenCalledWith(201, 7001, undefined);
    expect(paymentCycleRepository.save).toHaveBeenCalledTimes(1);
    expect(createPaymentCycleLessonsSpy).toHaveBeenCalledWith(
      901,
      77,
      expectedCycleStart,
      expectedCycleEnd,
    );
    expect(lessonRepository.update).toHaveBeenCalledWith(
      { id: 1001 },
      { dueDate: new Date(Date.UTC(2026, 2, 15, 0, 0, 0)) },
    );
    expect(customerBalanceRecalculatorService.recalculateAndPersist).toHaveBeenCalledWith(
      401,
      expect.objectContaining({
        manager: undefined,
        updatedByUserId: undefined,
        locationSlug: undefined,
      }),
    );
  });

  it('creates an initial partial cycle before the regular payment-cycle run when effective date starts next month', async () => {
    const {
      service,
      courseRepository,
      lessonRepository,
      privateLessonRepository,
      lessonHierarchyRepository,
      privateLessonEmailStatusRepository,
      enrolmentRepository,
      lessonDiscountRepository,
      customerDiscountRepository,
      enrolmentDiscountRepository,
      paymentCycleRepository,
      enrolmentPaymentFrequencyRepository,
    } = buildService();

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
          id: 910,
          enrolmentId: 202,
          startDate: new Date(Date.UTC(2026, 3, 1, 0, 0, 0)),
          endDate: new Date(Date.UTC(2026, 3, 30, 0, 0, 0)),
          isDeleted: 0,
        },
        {
          id: 911,
          enrolmentId: 202,
          startDate: new Date(Date.UTC(2026, 4, 1, 0, 0, 0)),
          endDate: new Date(Date.UTC(2026, 4, 31, 0, 0, 0)),
          isDeleted: 0,
        },
      ]);
    paymentCycleRepository.save
      .mockImplementationOnce(async (payload: any) => ({ id: 910, ...payload }))
      .mockImplementationOnce(async (payload: any) => ({ id: 911, ...payload }));

    const createPaymentCycleLessonsSpy = vi
      .spyOn(service as any, 'createPaymentCycleLessons')
      .mockResolvedValue(undefined);
    vi.spyOn(service, 'confirmCustomer').mockResolvedValue(true);
    vi.spyOn(service, 'updateCustomerBalance').mockResolvedValue(undefined);
    const expectedInitialCycleStart = new Date(2026, 3, 1);
    const expectedInitialCycleEnd = new Date(2026, 4, 1);
    expectedInitialCycleEnd.setDate(0);
    const expectedRegularCycleStart = new Date(2026, 4, 1);
    const expectedRegularCycleEnd = new Date(2026, 4 + 1, 0);

    const enrolmentId = await service.confirmLessonsForCourse(88, 3, 7001);

    expect(enrolmentId).toBe(202);
    expect(paymentCycleRepository.save).toHaveBeenCalledTimes(2);
    expect(createPaymentCycleLessonsSpy).toHaveBeenNthCalledWith(
      1,
      910,
      88,
      expectedInitialCycleStart,
      expectedInitialCycleEnd,
    );
    expect(createPaymentCycleLessonsSpy).toHaveBeenNthCalledWith(
      2,
      911,
      88,
      expectedRegularCycleStart,
      expectedRegularCycleEnd,
    );
  });
});
