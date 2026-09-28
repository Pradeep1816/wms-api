import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { LessonEditScheduleService } from './lesson-edit-schedule.service';
import { LessonStatusEnum } from '../enums/lesson-status';
import { ProgramTypeEnum } from '../../program/enums/program-type';
import { Lesson } from '../entities/lesson.entity';
import { PrivateLesson } from '../entities/private-lesson.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { Qualification } from '../../qualification/entities/qualification.entity';

function createRepositoryMock() {
  return {
    findLessonByIdAndLocation: vi.fn(),
    isLessonInvoiced: vi.fn(),
    getColorLookup: vi.fn(),
    copyDiscounts: vi.fn(),
    createLessonHierarchy: vi.fn(),
    updateLessonOriginalDate: vi.fn(),
    updateCourseDates: vi.fn(),
    getRootPrivateLessonContext: vi.fn(),
    trimPrivateLessonOverpayment: vi.fn(),
    recalculatePaymentBalances: vi.fn(),
    createLessonEmailStatuses: vi.fn(),
    loadFullLesson: vi.fn(),
    updatePrivateLessonExpiryDate: vi.fn(),
    findPrivateLessonByLessonId: vi.fn(),
    getTotalPaidForPrivateLesson: vi.fn(),
    updatePrivateLessonTotals: vi.fn(),
    isOwingRentalAgreement: vi.fn(),
  };
}

function createQueryBuilderExecuteMock() {
  return {
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ affected: 1 }),
    getRawOne: vi.fn().mockResolvedValue(null),
    getRawMany: vi.fn().mockResolvedValue([]),
  };
}

function createQueryRunnerMock() {
  const updateBuilder = createQueryBuilderExecuteMock();
  const paymentRepo = {
    findOne: vi.fn(),
    save: vi.fn(),
  };
  const creditUsageRepo = {
    findOne: vi.fn(),
  };

  const manager = {
    save: vi.fn(async (_entity: any, payload?: any) => payload ?? _entity),
    create: vi.fn((_entity: any, payload: any) => payload),
    findOne: vi.fn(),
    find: vi.fn(),
    getRepository: vi.fn((entity: any) => {
      if (entity?.name === 'Payment') return paymentRepo;
      return creditUsageRepo;
    }),
    createQueryBuilder: vi.fn(() => updateBuilder),
  };

  return {
    connect: vi.fn(),
    startTransaction: vi.fn(),
    commitTransaction: vi.fn(),
    rollbackTransaction: vi.fn(),
    release: vi.fn(),
    isTransactionActive: true,
    manager,
    __updateBuilder: updateBuilder,
    __paymentRepo: paymentRepo,
    __creditUsageRepo: creditUsageRepo,
  };
}

describe('LessonEditScheduleService', () => {
  let service: LessonEditScheduleService;
  let repository: ReturnType<typeof createRepositoryMock>;
  let privateLessonHelper: { handlePrivateLessonReschedule: ReturnType<typeof vi.fn> };
  let teacherOverlapValidator: { validateTeacherOverlap: ReturnType<typeof vi.fn> };
  let studentOverlapValidator: { validateStudentOverlap: ReturnType<typeof vi.fn> };
  let teacherEligibilityValidator: { validateTeacherEligibility: ReturnType<typeof vi.fn> };
  let customerBalanceRecalculatorService: { recalculateAndPersist: ReturnType<typeof vi.fn> };
  let queryRunner: ReturnType<typeof createQueryRunnerMock>;
  let dataSource: { createQueryRunner: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    repository = createRepositoryMock();
    privateLessonHelper = {
      handlePrivateLessonReschedule: vi.fn(),
    };
    teacherOverlapValidator = { validateTeacherOverlap: vi.fn() };
    studentOverlapValidator = { validateStudentOverlap: vi.fn() };
    teacherEligibilityValidator = { validateTeacherEligibility: vi.fn() };
    customerBalanceRecalculatorService = {
      recalculateAndPersist: vi.fn(async () => undefined),
    };
    queryRunner = createQueryRunnerMock();
    dataSource = {
      createQueryRunner: vi.fn(() => queryRunner),
    };

    service = new LessonEditScheduleService(
      {} as any,
      repository as any,
      privateLessonHelper as any,
      teacherOverlapValidator as any,
      studentOverlapValidator as any,
      teacherEligibilityValidator as any,
      customerBalanceRecalculatorService as any,
      dataSource as any,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws NotFoundException when lesson is missing for the location', async () => {
    repository.findLessonByIdAndLocation.mockResolvedValue(null);

    await expect(
      service.editSchedule('training-location', 3, 1001, {}, 501),
    ).rejects.toThrow(new NotFoundException('Lesson not found'));
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
  });

  it('rejects non-private and non-group lessons', async () => {
    repository.findLessonByIdAndLocation.mockResolvedValue({
      id: 1001,
      course: { program: { type: 99 }, enrolments: [] },
    });

    await expect(
      service.editSchedule('training-location', 3, 1001, {}, 501),
    ).rejects.toThrow(new BadRequestException('Only private and group lessons can be edited'));
  });

  it('recalculates the teacher rate when changing the teacher on an unscheduled private lesson', async () => {
    const oldLesson = {
      id: 1001,
      teacherId: 601,
      teacherRate: 28,
      date: new Date('2026-05-05T10:15:00.000Z'),
      courseId: 77,
      duration: '00:45:00',
      status: LessonStatusEnum.UNSCHEDULED,
      programRate: 120,
      tax: 12,
      discounts: [],
      course: {
        program: { id: 901, type: ProgramTypeEnum.PRIVATE_PROGRAM },
        enrolments: [
          {
            id: 201,
            isConfirmed: 1,
            isDeleted: false,
            student: { user: { id: 401 } },
          },
        ],
      },
      privateLesson: [
        { expiryDate: new Date('2026-06-01T00:00:00.000Z') },
      ],
    };

    repository.findLessonByIdAndLocation.mockResolvedValue(oldLesson);
    queryRunner.manager.findOne.mockImplementation(async (entity: any) => {
      if (entity === Qualification) {
        return { rate: 30 };
      }
      return null;
    });
    const recalcPrivateSpy = vi
      .spyOn(service as any, 'recalculatePrivateLessonTotalsForUnscheduledEdit')
      .mockResolvedValue(undefined);
    const recalcBalancesSpy = vi
      .spyOn(service as any, 'recalculateCustomerBalancesStrict')
      .mockResolvedValue(undefined);

    const result = await service.editSchedule(
      'training-location',
      3,
      1001,
      { teacherId: 777, duration: '01:00:00', expiryDate: '2026-06-15T00:00:00.000Z' },
      501,
    );

    expect(repository.isLessonInvoiced).not.toHaveBeenCalled();
    expect(queryRunner.manager.createQueryBuilder).toHaveBeenCalled();
    expect(queryRunner.__updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        teacherId: 777,
        teacherRate: 30,
        duration: '01:00:00',
        status: LessonStatusEnum.UNSCHEDULED,
        updatedByUserId: 501,
      }),
    );
    expect(
      teacherEligibilityValidator.validateTeacherEligibility,
    ).toHaveBeenCalledWith(777, 1001, 3);
    expect(queryRunner.manager.findOne).toHaveBeenCalledWith(Qualification, {
      where: {
        teacherId: 777,
        programId: 901,
        isDeleted: false,
      },
    });
    expect(repository.updateLessonOriginalDate).toHaveBeenCalledWith(
      1001,
      new Date('2026-05-05T10:15:00.000Z'),
      queryRunner,
    );
    expect(repository.updateCourseDates).toHaveBeenCalledWith(77, queryRunner);
    expect(recalcPrivateSpy).toHaveBeenCalledWith(oldLesson, '01:00:00', queryRunner);
    expect(recalcBalancesSpy).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(result).toEqual({
      status: true,
      url: 'admin/v2/training-location/lesson/1001',
    });
  });

  it('preserves the existing rate when an unscheduled lesson teacher is unchanged', async () => {
    const oldLesson = {
      id: 1002,
      teacherId: 601,
      teacherRate: 27,
      date: new Date('2026-05-06T10:15:00.000Z'),
      courseId: 78,
      duration: '00:45:00',
      status: LessonStatusEnum.UNSCHEDULED,
      course: {
        program: { id: 902, type: ProgramTypeEnum.GROUP_PROGRAM },
        enrolments: [],
      },
      privateLesson: [],
    };

    repository.findLessonByIdAndLocation.mockResolvedValue(oldLesson);

    await service.editSchedule(
      'training-location',
      3,
      1002,
      { teacherId: 601, duration: '01:00:00' },
      501,
    );

    expect(
      teacherEligibilityValidator.validateTeacherEligibility,
    ).not.toHaveBeenCalled();
    expect(queryRunner.manager.findOne).not.toHaveBeenCalledWith(
      Qualification,
      expect.anything(),
    );
    expect(queryRunner.__updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        teacherId: 601,
        teacherRate: 27,
        duration: '01:00:00',
        status: LessonStatusEnum.UNSCHEDULED,
      }),
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
  });

  it('keeps the stored exploded total when rescheduling a private lesson', async () => {
    const oldPrivate = {
      id: 321,
      lessonId: 1001,
      total: 15.15,
      balance: 0,
      expiryDate: new Date('2026-06-01T00:00:00.000Z'),
    };
    const newLesson = {
      id: 2001,
      teacherId: 601,
      isExploded: 1,
      total: 15.15,
      tax: 0,
      programRate: 65,
      duration: '00:15:00',
      discounts: [{ type: 3, value: 1.25, valueType: 0 }],
      course: {
        program: { id: 901, type: ProgramTypeEnum.PRIVATE_PROGRAM },
      },
    };
    const activeEnrolment = {
      id: 201,
      isConfirmed: 1,
      isDeleted: false,
    };

    queryRunner.manager.findOne.mockImplementation(async (entity: any) => {
      if (entity === PrivateLesson) {
        return oldPrivate;
      }
      if (entity === Lesson) {
        return newLesson;
      }
      if (entity === Enrolment) {
        return activeEnrolment;
      }
      return null;
    });
    repository.copyDiscounts.mockResolvedValue(undefined);
    repository.getRootPrivateLessonContext.mockResolvedValue(null);
    repository.getTotalPaidForPrivateLesson.mockResolvedValue(15.15);
    repository.trimPrivateLessonOverpayment.mockResolvedValue([]);
    repository.updateCourseDates.mockResolvedValue(undefined);
    queryRunner.manager.create.mockImplementation((entity: any, payload: any) => {
      if (entity === Lesson) {
        return {
          ...payload,
          getNetPrice: vi.fn().mockReturnValue(15.16),
        };
      }
      return payload;
    });
    queryRunner.manager.save.mockImplementation(async (_entity: any, payload?: any) => payload ?? _entity);

    await (service as any).handlePrivateLessonData(
      1001,
      2001,
      { teacherId: 601, date: '2026-05-06 10:15 AM', duration: '00:15:00' },
      queryRunner,
      '00:15:00',
    );

    expect(repository.trimPrivateLessonOverpayment).toHaveBeenCalledWith(
      1001,
      201,
      15.15,
      queryRunner,
    );
    expect(queryRunner.manager.create).toHaveBeenCalledWith(
      PrivateLesson,
      expect.objectContaining({
        lessonId: 2001,
        total: 15.15,
        balance: 0,
      }),
    );
  });

  it('recalculates an exploded private lesson total when duration changes', async () => {
    const oldPrivate = {
      id: 321,
      lessonId: 1001,
      total: 13.94,
      balance: 13.94,
      expiryDate: new Date('2026-06-01T00:00:00.000Z'),
    };
    const newLesson = {
      id: 2001,
      teacherId: 601,
      isExploded: 1,
      total: 13.94,
      tax: 0,
      programRate: 57.48,
      duration: '00:30:00',
      discounts: [{ type: 2, value: 3, valueType: 1 }],
      course: {
        program: { id: 901, type: ProgramTypeEnum.PRIVATE_PROGRAM },
      },
    };

    queryRunner.manager.findOne.mockImplementation(async (entity: any) => {
      if (entity === PrivateLesson) return oldPrivate;
      if (entity === Lesson) return newLesson;
      if (entity === Enrolment) {
        return { id: 201, isConfirmed: 1, isDeleted: false };
      }
      return null;
    });
    repository.copyDiscounts.mockResolvedValue(undefined);
    repository.getRootPrivateLessonContext.mockResolvedValue(null);
    repository.getTotalPaidForPrivateLesson.mockResolvedValue(0);
    repository.trimPrivateLessonOverpayment.mockResolvedValue([]);
    repository.updateCourseDates.mockResolvedValue(undefined);
    queryRunner.manager.create.mockImplementation((entity: any, payload: any) => {
      if (entity === Lesson) return Object.assign(new Lesson(), payload);
      return payload;
    });

    await (service as any).handlePrivateLessonData(
      1001,
      2001,
      { teacherId: 601, date: '2026-05-06 10:15 AM', duration: '00:30:00' },
      queryRunner,
      '00:30:00',
      true,
    );

    expect(repository.trimPrivateLessonOverpayment).toHaveBeenCalledWith(
      1001,
      201,
      27.88,
      queryRunner,
    );
    expect(queryRunner.manager.create).toHaveBeenCalledWith(
      PrivateLesson,
      expect.objectContaining({
        lessonId: 2001,
        total: 27.88,
        balance: 27.88,
      }),
    );
  });

  it('keeps the stored exploded total when unscheduling a private lesson', async () => {
    const lesson = {
      id: 1003,
      isExploded: 1,
      programRate: 65,
      tax: 0,
      duration: '00:15:00',
      discounts: [{ type: 3, value: 1.25, valueType: 0 }],
      course: {
        program: { id: 901, type: ProgramTypeEnum.PRIVATE_PROGRAM },
        enrolments: [
          {
            id: 202,
            isConfirmed: 1,
            isDeleted: false,
          },
        ],
      },
      privateLesson: [
        {
          id: 322,
          lessonId: 1003,
          total: 15.15,
          balance: 0,
          expiryDate: new Date('2026-06-01T00:00:00.000Z'),
        },
      ],
    };

    queryRunner.manager.findOne.mockImplementation(async (entity: any) => {
      if (entity === PrivateLesson) {
        return lesson.privateLesson[0];
      }
      return null;
    });
    repository.findPrivateLessonByLessonId.mockResolvedValue(lesson.privateLesson[0]);
    repository.trimPrivateLessonOverpayment.mockResolvedValue([]);
    repository.getTotalPaidForPrivateLesson.mockResolvedValue(15.15);
    repository.updatePrivateLessonTotals.mockResolvedValue(undefined);
    queryRunner.manager.create.mockImplementation((entity: any, payload: any) => {
      if (entity === Lesson) {
        return {
          ...payload,
          getNetPrice: vi.fn().mockReturnValue(15.16),
        };
      }
      return payload;
    });

    await (service as any).recalculatePrivateLessonTotalsForUnscheduledEdit(
      lesson,
      '00:15:00',
      queryRunner,
    );

    expect(repository.updatePrivateLessonTotals).toHaveBeenCalledWith(
      322,
      15.15,
      0,
      queryRunner,
    );
  });

  it('recalculates an unscheduled exploded lesson total when duration changes', async () => {
    const lesson = {
      id: 1003,
      isExploded: 1,
      programRate: 57.48,
      tax: 0,
      duration: '00:15:00',
      discounts: [{ type: 2, value: 3, valueType: 1 }],
      course: {
        program: { id: 901, type: ProgramTypeEnum.PRIVATE_PROGRAM },
        enrolments: [{ id: 202, isConfirmed: 1, isDeleted: false }],
      },
      privateLesson: [
        {
          id: 322,
          lessonId: 1003,
          total: 13.94,
          balance: 13.94,
          expiryDate: new Date('2026-06-01T00:00:00.000Z'),
        },
      ],
    };

    repository.findPrivateLessonByLessonId.mockResolvedValue(lesson.privateLesson[0]);
    repository.trimPrivateLessonOverpayment.mockResolvedValue([]);
    repository.getTotalPaidForPrivateLesson.mockResolvedValue(0);
    repository.updatePrivateLessonTotals.mockResolvedValue(undefined);
    queryRunner.manager.create.mockImplementation((entity: any, payload: any) => {
      if (entity === Lesson) return Object.assign(new Lesson(), payload);
      return payload;
    });

    await (service as any).recalculatePrivateLessonTotalsForUnscheduledEdit(
      lesson,
      '00:45:00',
      queryRunner,
    );

    expect(repository.updatePrivateLessonTotals).toHaveBeenCalledWith(
      322,
      41.82,
      41.82,
      queryRunner,
    );
  });

  it('returns overpayment when an unscheduled exploded lesson duration decreases', async () => {
    const lesson = {
      id: 1003,
      isExploded: 1,
      programRate: 57.48,
      tax: 0,
      duration: '00:30:00',
      discounts: [{ type: 2, value: 3, valueType: 1 }],
      course: {
        program: { id: 901, type: ProgramTypeEnum.PRIVATE_PROGRAM },
        enrolments: [{ id: 202, isConfirmed: 1, isDeleted: false }],
      },
      privateLesson: [
        {
          id: 322,
          lessonId: 1003,
          total: 27.88,
          balance: 0,
          expiryDate: new Date('2026-06-01T00:00:00.000Z'),
        },
      ],
    };

    repository.findPrivateLessonByLessonId.mockResolvedValue(lesson.privateLesson[0]);
    repository.trimPrivateLessonOverpayment.mockResolvedValue([701]);
    repository.getTotalPaidForPrivateLesson.mockResolvedValue(13.94);
    repository.updatePrivateLessonTotals.mockResolvedValue(undefined);
    queryRunner.manager.create.mockImplementation((entity: any, payload: any) => {
      if (entity === Lesson) return Object.assign(new Lesson(), payload);
      return payload;
    });

    await (service as any).recalculatePrivateLessonTotalsForUnscheduledEdit(
      lesson,
      '00:15:00',
      queryRunner,
    );

    expect(repository.trimPrivateLessonOverpayment).toHaveBeenCalledWith(
      1003,
      202,
      13.94,
      queryRunner,
    );
    expect(repository.recalculatePaymentBalances).toHaveBeenCalledWith(
      [701],
      queryRunner,
    );
    expect(repository.updatePrivateLessonTotals).toHaveBeenCalledWith(
      322,
      13.94,
      0,
      queryRunner,
    );
  });

  it("rejects invoiced scheduled lessons before creating a replacement lesson", async () => {
    const oldLesson = {
      id: 1001,
      teacherId: 601,
      date: new Date('2026-05-05T10:15:00.000Z'),
      duration: '00:45:00',
      status: LessonStatusEnum.SCHEDULED,
      course: {
        program: { type: ProgramTypeEnum.PRIVATE_PROGRAM },
        enrolments: [],
      },
      privateLesson: [],
    };

    repository.findLessonByIdAndLocation.mockResolvedValue(oldLesson);
    repository.isLessonInvoiced.mockResolvedValue(true);

    await expect(
      service.editSchedule(
        'training-location',
        3,
        1001,
        { date: '2026-05-06 10:15 AM', duration: '00:45:00' },
        501,
      ),
    ).rejects.toThrow(new BadRequestException("Lesson can't be edited once invoiced"));

    expect(queryRunner.manager.save).not.toHaveBeenCalledWith(
      Lesson,
      expect.objectContaining({ id: undefined }),
    );
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
  });

  it('creates a replacement lesson for scheduled private edits and applies teacher/date change flow', async () => {
    const oldLesson = {
      id: 1001,
      type: 1,
      teacherId: 601,
      teacherRate: 40,
      date: new Date('2026-05-05T10:15:00.000Z'),
      duration: '00:45:00',
      status: LessonStatusEnum.SCHEDULED,
      colorCode: null,
      isPresent: true,
      originalDate: new Date('2026-05-05T10:15:00.000Z'),
      courseId: 77,
      isOnline: false,
      privateLesson: [],
      lessonPayment: [],
      teacher: { id: 601 },
      course: {
        id: 77,
        program: { id: 901, type: ProgramTypeEnum.PRIVATE_PROGRAM, name: 'Private Piano' },
        enrolments: [
          {
            id: 201,
            course: { program: { name: 'Private Piano' } },
            student: {
              user: {
                id: 401,
                firstname: 'Mila',
                lastname: 'Student',
                customerAccount: { balance: 0 },
              },
            },
          },
        ],
      },
      discounts: [],
      classroom: null,
      tax: 0,
      programRate: 120,
    };

    repository.findLessonByIdAndLocation.mockResolvedValue(oldLesson);
    repository.isLessonInvoiced.mockResolvedValue(false);
    repository.getColorLookup.mockResolvedValue({
      'lesson-rescheduled': '#f00',
      'teacher-substituted': '#0f0',
      'private-lesson': '#00f',
    });
    repository.isOwingRentalAgreement.mockResolvedValue(false);
    repository.loadFullLesson.mockResolvedValue({
      id: 2001,
      teacherId: 777,
      colorCode: null,
      isPresent: true,
      originalDate: new Date('2026-05-05T10:15:00.000Z'),
      course: {
        program: { type: ProgramTypeEnum.PRIVATE_PROGRAM, name: 'Private Piano' },
        enrolments: [
          {
            id: 201,
            course: { program: { name: 'Private Piano' } },
            student: {
              id: 301,
              user: {
                id: 401,
                firstname: 'Mila',
                lastname: 'Student',
                customerAccount: { balance: 0 },
              },
            },
          },
        ],
      },
    });
    queryRunner.manager.findOne.mockImplementation(async (entity: any) => {
      if (entity === Qualification) {
        return { rate: 62 };
      }
      return null;
    });
    queryRunner.manager.save.mockImplementation(async (_entity: any, payload?: any) => {
      if (payload && payload.id === undefined) {
        return { ...payload, id: 2001 };
      }
      return payload ?? _entity;
    });

    const handlePrivateSpy = vi
      .spyOn(service as any, 'handlePrivateLessonData')
      .mockResolvedValue(undefined);
    const transferPaymentsSpy = vi
      .spyOn(service as any, 'transferLessonPaymentsWithCreditReferences')
      .mockResolvedValue(undefined);
    const recalcBalancesSpy = vi
      .spyOn(service as any, 'recalculateCustomerBalancesStrict')
      .mockResolvedValue(undefined);
    const lessonTitleSpy = vi
      .spyOn(service as any, 'getLessonTitle')
      .mockReturnValue('Mila Student - Private Piano');
    const lessonDescriptionSpy = vi
      .spyOn(service as any, 'getLessonDescription')
      .mockReturnValue([{ name: 'Program', value: 'Private Piano' }]);

    const result = await service.editSchedule(
      'training-location',
      3,
      1001,
      {
        teacherId: 777,
        date: '2026-05-06 10:15 AM',
        duration: '01:00:00',
      },
      501,
    );

    expect(repository.isLessonInvoiced).toHaveBeenCalledWith(1001, queryRunner);
    expect(queryRunner.manager.save).toHaveBeenCalledWith(Lesson, expect.objectContaining({
      id: 1001,
      status: LessonStatusEnum.CANCELED,
    }));
    expect(queryRunner.manager.create).toHaveBeenCalledWith(
      Lesson,
      expect.objectContaining({
        colorCode: null,
        status: LessonStatusEnum.RESCHEDULED,
        teacherId: 777,
      }),
    );
    expect(teacherEligibilityValidator.validateTeacherEligibility).toHaveBeenCalledWith(
      777,
      1001,
      3,
    );
    expect(teacherOverlapValidator.validateTeacherOverlap).toHaveBeenCalledWith(
      777,
      1001,
      new Date(Date.UTC(2026, 4, 6, 10, 15, 0)),
      '01:00:00',
      3,
    );
    expect(studentOverlapValidator.validateStudentOverlap).toHaveBeenCalledWith(
      1001,
      new Date(Date.UTC(2026, 4, 6, 10, 15, 0)),
      '01:00:00',
      3,
    );
    expect(handlePrivateSpy).toHaveBeenCalledWith(
      1001,
      2001,
      { teacherId: 777, date: '2026-05-06 10:15 AM', duration: '01:00:00' },
      queryRunner,
      '01:00:00',
      true,
    );
    expect(transferPaymentsSpy).toHaveBeenCalledWith(1001, 2001, queryRunner);
    expect(repository.createLessonHierarchy).toHaveBeenCalledWith(1001, 2001, queryRunner);
    expect(repository.createLessonEmailStatuses).toHaveBeenCalledWith(
      2001,
      77,
      true,
      queryRunner,
    );
    expect(recalcBalancesSpy).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(lessonTitleSpy).toHaveBeenCalled();
    expect(lessonDescriptionSpy).toHaveBeenCalled();
    expect(result).toEqual({
      lessonId: 2001,
      isPrivateLesson: true,
      isOwing: false,
      isOwingRentalAgreement: false,
      isOnline: false,
      resourceId: 777,
      title: 'Mila Student - Private Piano',
      start: new Date(Date.UTC(2026, 4, 6, 10, 15, 0)).toISOString(),
      end: new Date(Date.UTC(2026, 4, 6, 10, 15, 0)).toISOString(),
      url: 'admin/v2/training-location/private-lesson/2001',
      className: 'lesson-rescheduled',
      backgroundColor: '#f00',
      tooltip: [{ name: 'Program', value: 'Private Piano' }],
    });
  });

  it('clears the default rescheduled color when only the date changes', async () => {
    const oldLesson = {
      id: 1002,
      type: 1,
      teacherId: 601,
      teacherRate: 40,
      date: new Date('2026-05-05T10:15:00.000Z'),
      duration: '00:45:00',
      status: LessonStatusEnum.SCHEDULED,
      colorCode: null,
      isPresent: true,
      originalDate: new Date('2026-05-05T10:15:00.000Z'),
      courseId: 78,
      isOnline: false,
      privateLesson: [],
      lessonPayment: [],
      teacher: { id: 601 },
      course: {
        id: 78,
        program: { id: 901, type: ProgramTypeEnum.PRIVATE_PROGRAM, name: 'Private Piano' },
        enrolments: [
          {
            id: 202,
            course: { program: { name: 'Private Piano' } },
            student: {
              user: {
                id: 402,
                firstname: 'Noah',
                lastname: 'Student',
                customerAccount: { balance: 0 },
              },
            },
          },
        ],
      },
      discounts: [],
      classroom: null,
      tax: 0,
      programRate: 120,
    };

    repository.findLessonByIdAndLocation.mockResolvedValue(oldLesson);
    repository.isLessonInvoiced.mockResolvedValue(false);
    repository.getColorLookup.mockResolvedValue({
      'lesson-rescheduled': '#f00',
      'teacher-substituted': '#0f0',
      'private-lesson': '#00f',
    });
    repository.isOwingRentalAgreement.mockResolvedValue(false);
    repository.loadFullLesson.mockResolvedValue({
      id: 2002,
      teacherId: 601,
      colorCode: null,
      isPresent: true,
      originalDate: new Date('2026-05-05T10:15:00.000Z'),
      course: {
        program: { type: ProgramTypeEnum.PRIVATE_PROGRAM, name: 'Private Piano' },
        enrolments: [
          {
            id: 202,
            course: { program: { name: 'Private Piano' } },
            student: {
              id: 302,
              user: {
                id: 402,
                firstname: 'Noah',
                lastname: 'Student',
                customerAccount: { balance: 0 },
              },
            },
          },
        ],
      },
    });
    queryRunner.manager.findOne.mockImplementation(async (entity: any) => {
      if (entity === Qualification) {
        return { rate: 40 };
      }
      return null;
    });
    queryRunner.manager.save.mockImplementation(async (_entity: any, payload?: any) => {
      if (payload && payload.id === undefined) {
        return { ...payload, id: 2002 };
      }
      return payload ?? _entity;
    });

    const handlePrivateSpy = vi
      .spyOn(service as any, 'handlePrivateLessonData')
      .mockResolvedValue(undefined);
    const transferPaymentsSpy = vi
      .spyOn(service as any, 'transferLessonPaymentsWithCreditReferences')
      .mockResolvedValue(undefined);
    const recalcBalancesSpy = vi
      .spyOn(service as any, 'recalculateCustomerBalancesStrict')
      .mockResolvedValue(undefined);

    await service.editSchedule(
      'training-location',
      3,
      1002,
      {
        date: '2026-05-06 10:15 AM',
        duration: '01:00:00',
      },
      501,
    );

    expect(teacherEligibilityValidator.validateTeacherEligibility).not.toHaveBeenCalled();
    expect(queryRunner.manager.create).toHaveBeenCalledWith(
      Lesson,
      expect.objectContaining({
        colorCode: null,
        status: LessonStatusEnum.RESCHEDULED,
        teacherId: 601,
      }),
    );
    expect(handlePrivateSpy).toHaveBeenCalled();
    expect(transferPaymentsSpy).toHaveBeenCalled();
    expect(recalcBalancesSpy).toHaveBeenCalled();
  });
});
