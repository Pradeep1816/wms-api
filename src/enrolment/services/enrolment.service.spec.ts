import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { EnrolmentService } from './enrolment.service';
import { EnrolmentDiscount } from '../entities/enrolment-discount.entity';
import { Program } from '../../program/entities/program.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonDiscount } from '../../lesson/entities/lesson-discount.entity';

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

function createRepositoryMock() {
  return {
    findOne: vi.fn(),
    find: vi.fn(),
    count: vi.fn(),
    createQueryBuilder: vi.fn(),
    create: vi.fn((payload) => payload),
    save: vi.fn(async (payload) => payload),
    update: vi.fn(),
  };
}

function createQueryBuilderMock(rawOne: unknown = null, many: unknown[] = []) {
  return {
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    addOrderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
    getRawOne: vi.fn().mockResolvedValue(rawOne),
    getMany: vi.fn().mockResolvedValue(many),
  };
}

function createQueryRunnerMock() {
  return {
    data: {} as Record<string, unknown>,
    connect: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    startTransaction: vi.fn().mockResolvedValue(undefined),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    rollbackTransaction: vi.fn().mockResolvedValue(undefined),
    manager: {
      find: vi.fn(),
      findOne: vi.fn(),
      count: vi.fn(),
      createQueryBuilder: vi.fn(),
      create: vi.fn((payload) => payload),
      save: vi.fn(async (payload) => payload),
    },
  };
}

function createService() {
  const enrolmentEntityRepository = createRepositoryMock();
  const courseRepository = createRepositoryMock();
  const lessonRepository = createRepositoryMock();
  const courseProgramRateRepository = createRepositoryMock();
  const userRepository = createRepositoryMock();
  const groupLessonRepository = createRepositoryMock();
  const groupLessonEmailStatusRepository = createRepositoryMock();
  const dataSource = {
    createQueryRunner: vi.fn(),
  };

  const service = Object.create(EnrolmentService.prototype) as EnrolmentService;
  Object.assign(service, {
    enrolmentEntityRepository,
    courseRepository,
    lessonRepository,
    courseProgramRateRepository,
    userRepository,
    groupLessonRepository,
    groupLessonEmailStatusRepository,
    dataSource,
  });

  return {
    service,
    enrolmentEntityRepository,
    courseRepository,
    lessonRepository,
    courseProgramRateRepository,
    userRepository,
    groupLessonRepository,
    groupLessonEmailStatusRepository,
    dataSource,
  };
}

function seedPrivateCycleQueries(queryRunner: ReturnType<typeof createQueryRunnerMock>, rawResults: unknown[]) {
  const builders = rawResults.map((rawResult) => createQueryBuilderMock(rawResult));
  for (const builder of builders) {
    queryRunner.manager.createQueryBuilder.mockImplementationOnce(() => builder);
  }
  return builders;
}

describe('EnrolmentService discount flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the valid private cycle when unpaid lessons exist', async () => {
    const { service } = createService();
    const queryRunner = createQueryRunnerMock();
    const cycles = [
      { startDate: utcDate(2026, 3, 1), endDate: utcDate(2026, 3, 30), isDeleted: 0 },
      { startDate: utcDate(2026, 4, 1), endDate: utcDate(2026, 5, 30), isDeleted: 0 },
      { startDate: utcDate(2026, 6, 1), endDate: utcDate(2026, 7, 31), isDeleted: 0 },
    ];

    queryRunner.manager.find.mockResolvedValue(cycles);
    seedPrivateCycleQueries(queryRunner, [{ exists: 1 }, null, { exists: 1 }, null, { exists: 1 }]);

    const result = await (service as any).getPrivateDiscountCycleRange(
      queryRunner,
      { id: 42 } as any,
      { id: 77 } as any,
    );

    expect(result?.startDate.toISOString()).toBe(cycles[1].startDate.toISOString());
    expect(result?.endDate.toISOString()).toBe(cycles[2].endDate.toISOString());
  });

  it('returns the valid private cycle when partial payments exist', async () => {
    const { service } = createService();
    const queryRunner = createQueryRunnerMock();
    const cycles = [
      { startDate: utcDate(2026, 3, 1), endDate: utcDate(2026, 3, 30), isDeleted: 0 },
      { startDate: utcDate(2026, 4, 1), endDate: utcDate(2026, 5, 30), isDeleted: 0 },
      { startDate: utcDate(2026, 6, 1), endDate: utcDate(2026, 7, 31), isDeleted: 0 },
    ];

    queryRunner.manager.find.mockResolvedValue(cycles);
    seedPrivateCycleQueries(queryRunner, [{ exists: 1 }, null, { exists: 1 }, null, { exists: 1 }]);

    const result = await (service as any).getPrivateDiscountCycleRange(
      queryRunner,
      { id: 42 } as any,
      { id: 77 } as any,
    );

    expect(result?.startDate.toISOString()).toBe(cycles[1].startDate.toISOString());
    expect(result?.endDate.toISOString()).toBe(cycles[2].endDate.toISOString());
  });

  it('uses the latest end date for the private preview window', async () => {
    const { service } = createService();
    const queryRunner = createQueryRunnerMock();
    const cycles = [
      { startDate: utcDate(2026, 3, 1), endDate: utcDate(2026, 3, 30), isDeleted: 0 },
      { startDate: utcDate(2026, 4, 1), endDate: utcDate(2026, 7, 31), isDeleted: 0 },
      { startDate: utcDate(2026, 5, 1), endDate: utcDate(2026, 5, 31), isDeleted: 0 },
    ];

    queryRunner.manager.find.mockResolvedValue(cycles);
    seedPrivateCycleQueries(queryRunner, [{ exists: 1 }, null, { exists: 1 }, null, { exists: 1 }]);

    const result = await (service as any).getPrivateDiscountCycleRange(
      queryRunner,
      { id: 42 } as any,
      { id: 77 } as any,
    );

    expect(result?.startDate.toISOString()).toBe(cycles[1].startDate.toISOString());
    expect(result?.endDate.toISOString()).toBe(cycles[1].endDate.toISOString());
  });

  it('matches legacy by treating an empty private payment cycle as editable', async () => {
    const { service } = createService();
    const queryRunner = createQueryRunnerMock();
    const cycles = [
      { startDate: utcDate(2023, 11, 1), endDate: utcDate(2023, 11, 31), isDeleted: 0 },
      { startDate: utcDate(2026, 7, 1), endDate: utcDate(2026, 7, 31), isDeleted: 0 },
      { startDate: utcDate(2028, 3, 1), endDate: utcDate(2028, 3, 30), isDeleted: 0 },
    ];

    queryRunner.manager.find.mockResolvedValue(cycles);
    seedPrivateCycleQueries(queryRunner, [null, null]);

    const result = await (service as any).getPrivateDiscountCycleRange(
      queryRunner,
      { id: 42 } as any,
      { id: 77 } as any,
    );

    expect(result?.startDate.toISOString()).toBe(cycles[0].startDate.toISOString());
    expect(result?.endDate.toISOString()).toBe(cycles[2].endDate.toISOString());
  });

  it('excludes canceled lessons when checking the private cycle window', async () => {
    const { service } = createService();
    const queryRunner = createQueryRunnerMock();
    const cycles = [
      { startDate: utcDate(2026, 3, 1), endDate: utcDate(2026, 3, 30), isDeleted: 0 },
    ];

    queryRunner.manager.find.mockResolvedValue(cycles);
    const builders = seedPrivateCycleQueries(queryRunner, [null, { exists: 1 }, null, null]);

    await (service as any).getPrivateDiscountCycleRange(
      queryRunner,
      { id: 42 } as any,
      { id: 77 } as any,
    );

    expect(builders[2].andWhere).toHaveBeenCalledWith('lesson.status != :canceledStatus', {
      canceledStatus: LessonStatusEnum.CANCELED,
    });
    expect(builders[3].andWhere).toHaveBeenCalledWith('lesson.status != :canceledStatus', {
      canceledStatus: LessonStatusEnum.CANCELED,
    });
  });

  it('returns the legacy preview row and class for private discounts', async () => {
    const { service, enrolmentEntityRepository, courseRepository, dataSource } = createService();
    const queryRunner = createQueryRunnerMock();
    const tempQueryRunner = queryRunner;
    const cycles = [
      { startDate: utcDate(2026, 3, 1), endDate: utcDate(2026, 3, 30), isDeleted: 0 },
      { startDate: utcDate(2026, 4, 1), endDate: utcDate(2026, 5, 30), isDeleted: 0 },
      { startDate: utcDate(2026, 6, 1), endDate: utcDate(2026, 7, 31), isDeleted: 0 },
    ];

    enrolmentEntityRepository.findOne.mockResolvedValue({
      id: 42,
      courseId: 77,
      isDeleted: false,
    });
    courseRepository.findOne.mockResolvedValue({
      id: 77,
      program: { type: Program.TYPE_PRIVATE_PROGRAM },
    });
    dataSource.createQueryRunner.mockReturnValue(tempQueryRunner);
    tempQueryRunner.manager.find.mockResolvedValue(cycles);
    seedPrivateCycleQueries(tempQueryRunner, [{ exists: 1 }, null, { exists: 1 }, null, { exists: 1 }]);

    const result = await service.getDiscountPreview(1, 42);

    expect(result.previewItems).toEqual([
      expect.objectContaining({
        objects: "Lesson's Discount",
        action: 'will be modified',
        date_range: 'within May 01, 2026 - Aug 31, 2026',
        class: 'lesson-discount',
      }),
    ]);
    expect(tempQueryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('rejects the preview when no private cycle is editable', async () => {
    const { service, enrolmentEntityRepository, courseRepository, dataSource } = createService();
    const queryRunner = createQueryRunnerMock();

    enrolmentEntityRepository.findOne.mockResolvedValue({
      id: 42,
      courseId: 77,
      isDeleted: false,
    });
    courseRepository.findOne.mockResolvedValue({
      id: 77,
      program: { type: Program.TYPE_PRIVATE_PROGRAM },
    });
    dataSource.createQueryRunner.mockReturnValue(queryRunner);
    queryRunner.manager.find.mockResolvedValue([
      { startDate: utcDate(2026, 3, 1), endDate: utcDate(2026, 3, 30), isDeleted: 0 },
      { startDate: utcDate(2026, 4, 1), endDate: utcDate(2026, 5, 30), isDeleted: 0 },
    ]);
    seedPrivateCycleQueries(queryRunner, [{ exists: 1 }, { exists: 1 }]);

    await expect(service.getDiscountPreview(1, 42)).rejects.toThrow(
      new BadRequestException("You can't edit discounts."),
    );
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('passes the private discount window into both private discount resets', async () => {
    const { service, dataSource } = createService();
    const queryRunner = createQueryRunnerMock();
    const effectiveRange = {
      startDate: utcDate(2026, 5, 1),
      endDate: utcDate(2026, 7, 31),
    };
    const enrolment = {
      id: 42,
      courseId: 77,
      studentId: 9001,
      isDeleted: false,
    };
    const course = {
      id: 77,
      program: { type: Program.TYPE_PRIVATE_PROGRAM },
    };
    const loggedUser = {
      id: 7001,
      profile: { firstname: 'Admin', lastname: 'User' },
    };

    dataSource.createQueryRunner.mockReturnValue(queryRunner);
    queryRunner.manager.findOne
      .mockResolvedValueOnce(enrolment)
      .mockResolvedValueOnce(course)
      .mockResolvedValueOnce({ discount: 10, discountType: EnrolmentDiscount.VALUE_TYPE_PERCENTAGE })
      .mockResolvedValueOnce({ discount: 5, discountType: EnrolmentDiscount.VALUE_TYPE_DOLLAR })
      .mockResolvedValueOnce(loggedUser);
    queryRunner.manager.save.mockResolvedValue(undefined);

    const validateSpy = vi
      .spyOn(service as any, 'validateDiscountEdit')
      .mockResolvedValue(effectiveRange);
    const resetSpy = vi.spyOn(service as any, 'resetDiscount').mockResolvedValue(undefined);
    const logSpy = vi.spyOn(service as any, 'logDiscountChange').mockResolvedValue(undefined);

    const result = await service.updateEnrolmentDiscounts(
      1,
      'north-york',
      42,
      {
        pfDiscount: '12',
        multipleEnrolDiscount: '9',
      } as any,
      7001,
    );

    expect(result).toEqual({
      status: true,
      message: 'Discounts updated successfully',
    });
    expect(queryRunner.data.currentUserId).toBe(7001);
    expect(validateSpy).toHaveBeenCalledTimes(1);
    expect(resetSpy).toHaveBeenNthCalledWith(
      1,
      queryRunner,
      enrolment,
      course,
      EnrolmentDiscount.TYPE_PAYMENT_FREQUENCY,
      12,
      effectiveRange,
    );
    expect(resetSpy).toHaveBeenNthCalledWith(
      2,
      queryRunner,
      enrolment,
      course,
      EnrolmentDiscount.TYPE_MULTIPLE_ENROLMENT,
      9,
      effectiveRange,
    );
    expect(queryRunner.manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        discount: 12,
        discountType: EnrolmentDiscount.VALUE_TYPE_PERCENTAGE,
      }),
    );
    expect(queryRunner.manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        discount: 9,
        discountType: EnrolmentDiscount.VALUE_TYPE_DOLLAR,
      }),
    );
    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('normalizes inverted discount value types without recalculating unchanged amounts', async () => {
    const { service, dataSource } = createService();
    const queryRunner = createQueryRunnerMock();
    const enrolment = {
      id: 42,
      courseId: 77,
      studentId: 9001,
      isDeleted: false,
    };
    const course = {
      id: 77,
      program: { type: Program.TYPE_PRIVATE_PROGRAM },
    };
    const existingPfDiscount = {
      discount: 10,
      discountType: EnrolmentDiscount.VALUE_TYPE_DOLLAR,
    };
    const existingMultiDiscount = {
      discount: 5,
      discountType: EnrolmentDiscount.VALUE_TYPE_PERCENTAGE,
    };

    dataSource.createQueryRunner.mockReturnValue(queryRunner);
    queryRunner.manager.findOne
      .mockResolvedValueOnce(enrolment)
      .mockResolvedValueOnce(course)
      .mockResolvedValueOnce(existingPfDiscount)
      .mockResolvedValueOnce(existingMultiDiscount)
      .mockResolvedValueOnce({
        id: 7001,
        profile: { firstname: 'Admin', lastname: 'User' },
      });
    queryRunner.manager.save.mockResolvedValue(undefined);

    vi.spyOn(service as any, 'validateDiscountEdit').mockResolvedValue({
      startDate: utcDate(2026, 5, 1),
      endDate: utcDate(2026, 7, 31),
    });
    const resetSpy = vi.spyOn(service as any, 'resetDiscount').mockResolvedValue(undefined);
    const logSpy = vi.spyOn(service as any, 'logDiscountChange').mockResolvedValue(undefined);

    await service.updateEnrolmentDiscounts(
      1,
      'north-york',
      42,
      {
        pfDiscount: '10',
        multipleEnrolDiscount: '5',
      } as any,
      7001,
    );

    expect(existingPfDiscount.discountType).toBe(
      EnrolmentDiscount.VALUE_TYPE_PERCENTAGE,
    );
    expect(existingMultiDiscount.discountType).toBe(
      EnrolmentDiscount.VALUE_TYPE_DOLLAR,
    );
    expect(queryRunner.manager.save).toHaveBeenCalledWith(existingPfDiscount);
    expect(queryRunner.manager.save).toHaveBeenCalledWith(existingMultiDiscount);
    expect(resetSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('matches the legacy lesson filter when resetting private discounts', async () => {
    const { service } = createService();
    const queryRunner = createQueryRunnerMock();
    const queryBuilder = createQueryBuilderMock();

    queryRunner.manager.createQueryBuilder.mockReturnValue(queryBuilder);

    await (service as any).resetDiscount(
      queryRunner,
      { id: 42 } as any,
      { program: { type: Program.TYPE_PRIVATE_PROGRAM } } as any,
      EnrolmentDiscount.TYPE_PAYMENT_FREQUENCY,
      10,
      {
        startDate: utcDate(2026, 5, 1),
        endDate: utcDate(2026, 7, 31),
      },
    );

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('lesson.isDeleted = 0');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('lesson.isConfirmed = 1');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('lesson.status IN (:...activeStatuses)', {
      activeStatuses: [LessonStatusEnum.RESCHEDULED, LessonStatusEnum.SCHEDULED],
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('pl.balance > 0');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('lesson.date >= NOW()');
  });

  it('recalculates payment frequency discounts using the legacy percentage rule', async () => {
    const { service } = createService();
    const queryRunner = createQueryRunnerMock();
    const lessonDiscount = Object.assign(Object.create(LessonDiscount.prototype), {
      id: 2001,
      lessonId: 1001,
      enrolmentId: 42,
      type: LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
      value: 3,
      valueType: 0,
    });
    const lesson = Object.assign(Object.create(Lesson.prototype), {
      id: 1001,
      courseId: 77,
      isDeleted: false,
      isConfirmed: 1,
      status: LessonStatusEnum.SCHEDULED,
      duration: '00:30:00',
      programRate: 65,
      tax: 0,
      discounts: [lessonDiscount],
    });
    const lessonQueryBuilder = createQueryBuilderMock(null, [lesson]);
    const creditQueryBuilder = createQueryBuilderMock({ total: '0' });
    const updateQueryBuilder = createQueryBuilderMock();

    queryRunner.manager.createQueryBuilder
      .mockImplementationOnce(() => lessonQueryBuilder)
      .mockImplementationOnce(() => creditQueryBuilder)
      .mockImplementationOnce(() => updateQueryBuilder);
    queryRunner.manager.findOne
      .mockResolvedValueOnce(lessonDiscount)
      .mockResolvedValueOnce(lesson);
    queryRunner.manager.find.mockResolvedValueOnce([lessonDiscount]);

    await (service as any).resetDiscount(
      queryRunner,
      { id: 42 } as any,
      { program: { type: Program.TYPE_PRIVATE_PROGRAM } } as any,
      EnrolmentDiscount.TYPE_PAYMENT_FREQUENCY,
      3,
      {
        startDate: utcDate(2026, 5, 1),
        endDate: utcDate(2026, 7, 31),
      },
    );

    expect(updateQueryBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        total: 31.53,
        balance: 31.53,
      }),
    );
  });

  it('skips private discount reset when no editable private discount window exists', async () => {
    const { service } = createService();
    const queryRunner = createQueryRunnerMock();

    await (service as any).resetDiscount(
      queryRunner,
      { id: 42 } as any,
      { program: { type: Program.TYPE_PRIVATE_PROGRAM } } as any,
      EnrolmentDiscount.TYPE_PAYMENT_FREQUENCY,
      10,
      null,
    );

    expect(queryRunner.manager.createQueryBuilder).not.toHaveBeenCalled();
    expect(queryRunner.manager.findOne).not.toHaveBeenCalled();
  });
});

describe('EnrolmentService editProgramRate online sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs enrolment online changes to the course and all active lessons', async () => {
    const {
      service,
      enrolmentEntityRepository,
      courseRepository,
      lessonRepository,
    } = createService();

    const enrolment = {
      id: 42,
      courseId: 77,
      isDeleted: false,
      isAutoRenew: 0,
      isOnline: 0,
      student: {
        id: 9001,
        firstName: 'Aman',
        lastName: 'Tomar',
      },
    };
    const course = {
      id: 77,
      locationId: 1,
      isDeleted: false,
      isOnline: 0,
      updatedByUserId: 11,
      program: { name: 'Piano' },
    };

    enrolmentEntityRepository.findOne.mockResolvedValue(enrolment);
    courseRepository.findOne.mockResolvedValue(course);
    enrolmentEntityRepository.save.mockImplementation(async (payload: any) => payload);
    courseRepository.save.mockImplementation(async (payload: any) => payload);
    lessonRepository.update.mockResolvedValue({ affected: 3 });

    const result = await service.editProgramRate(
      1,
      42,
      { isOnline: true },
      7001,
      'training-location',
    );

    expect(result).toEqual({ message: 'Details successfully updated!' });
    expect(enrolmentEntityRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        isOnline: 1,
        updatedByUserId: 7001,
      }),
    );
    expect(courseRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        isOnline: 1,
        updatedByUserId: 7001,
      }),
    );
    expect(lessonRepository.update).toHaveBeenCalledWith(
      {
        courseId: 77,
        isDeleted: false,
      },
      expect.objectContaining({
        isOnline: true,
        updatedByUserId: 7001,
      }),
    );
  });
});

describe('EnrolmentService group lesson confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['zero discount', 0, 0, 0, 143.75],
    ['percentage discount', 3, 1, 0, 139.44],
    ['fixed discount', 4.31, 0, 0, 139.44],
    ['percentage discount with tax', 3, 1, 1.25, 140.69],
  ])(
    'persists billable cents for a %s',
    async (_label, discountValue, valueType, tax, expectedTotal) => {
      const {
        service,
        enrolmentEntityRepository,
        courseRepository,
        lessonRepository,
        userRepository,
        groupLessonRepository,
        groupLessonEmailStatusRepository,
      } = createService();
      const enrolment = {
        id: 33855,
        courseId: 900,
        studentId: 77,
        isDeleted: false,
        isConfirmed: 0,
        createdAt: utcDate(2026, 8, 8),
      };

      enrolmentEntityRepository.findOne.mockResolvedValue(enrolment);
      courseRepository.findOne.mockResolvedValue({
        id: 900,
        locationId: 15,
      });
      lessonRepository.find.mockResolvedValue([
        {
          id: 5275131,
          programRate: 143.75,
          tax,
          discounts: [
            {
              enrolmentId: enrolment.id,
              type: 5,
              value: discountValue,
              valueType,
            },
          ],
        },
      ]);
      groupLessonRepository.find.mockResolvedValue([]);
      groupLessonEmailStatusRepository.find.mockResolvedValue([]);
      userRepository.findOne.mockResolvedValue(null);

      await service.confirmGroupEnrolment(
        15,
        'training-location',
        enrolment.id,
        694,
      );

      expect(groupLessonRepository.save).toHaveBeenCalledWith([
        expect.objectContaining({
          lessonId: 5275131,
          enrolmentId: enrolment.id,
          total: expectedTotal,
          balance: expectedTotal,
          paidStatus: 1,
        }),
      ]);
    },
  );
});

/**
 * Deleting an enrolment that never had any lessons.
 *
 * Every batch in `fullDeleteEnrolment` is keyed on an array of ids, and an
 * empty array in `IN (:...ids)` renders `IN ()` - a MySQL syntax error, not an
 * empty result. An enrolment saved but never confirmed has no lessons, so the
 * delete failed outright and the row could not be removed through the app.
 */
describe('EnrolmentService.fullDeleteEnrolment with no lessons', () => {
  function buildForEmptyEnrolment() {
    const { service, dataSource } = createService();
    const queryRunner = createQueryRunnerMock();

    const enrolment = {
      id: 500,
      courseId: 900,
      studentId: 77,
      isDeleted: false,
      student: { id: 77, user: { id: 12 } },
      course: { id: 900, program: { type: 1 } },
    };
    const course = { id: 900, locationId: 15, program: { type: 1 } };

    queryRunner.manager.findOne.mockImplementation((entity: { name: string }) => {
      if (entity.name === 'Enrolment') return Promise.resolve(enrolment);
      if (entity.name === 'Course') return Promise.resolve(course);
      // No customer account, and no other lesson left on the course.
      return Promise.resolve(null);
    });
    // No lessons, and no payment cycles.
    queryRunner.manager.find.mockResolvedValue([]);
    queryRunner.manager.update = vi.fn().mockResolvedValue(undefined);
    queryRunner.manager.createQueryBuilder.mockImplementation(() => {
      throw new Error('no id array is non-empty, so no batch query should run');
    });

    dataSource.createQueryRunner.mockReturnValue(queryRunner);
    // Runs after the transaction commits and is not what this test is about.
    (service as unknown as { setStatus: unknown }).setStatus = vi
      .fn()
      .mockResolvedValue(undefined);

    return { service, queryRunner, enrolment };
  }

  it('deletes it instead of failing on an empty IN () clause', async () => {
    const { service, queryRunner, enrolment } = buildForEmptyEnrolment();

    const result = await service.fullDeleteEnrolment(15, 500, 'training-location');

    expect(result.status).toBe(true);
    expect(enrolment.isDeleted).toBe(true);
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('looks for the next lesson without an empty NOT IN () clause', async () => {
    // With nothing being deleted there is nothing to exclude, so the `id`
    // condition has to be absent rather than built from an empty array.
    const { service, queryRunner } = buildForEmptyEnrolment();

    await service.fullDeleteEnrolment(15, 500, 'training-location');

    const lessonLookup = queryRunner.manager.findOne.mock.calls.find(
      (call: unknown[]) => (call[0] as { name: string }).name === 'Lesson',
    );

    expect(lessonLookup).toBeDefined();
    expect(
      (lessonLookup![1] as { where: Record<string, unknown> }).where,
    ).not.toHaveProperty('id');
  });
});
