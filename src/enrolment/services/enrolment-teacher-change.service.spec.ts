import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { EnrolmentTeacherChangeService } from './enrolment-teacher-change.service';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';

function createRepositoryMock() {
  return {
    find: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
    createQueryBuilder: vi.fn(),
    create: vi.fn((payload) => payload),
    save: vi.fn(async (payload) => payload),
  };
}

function createQueryBuilderMock(rawMany: unknown[] = []) {
  return {
    leftJoinAndSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    getMany: vi.fn().mockResolvedValue(rawMany),
  };
}

function createQueryRunnerMock(manager: any) {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    startTransaction: vi.fn().mockResolvedValue(undefined),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    rollbackTransaction: vi.fn().mockResolvedValue(undefined),
    manager,
  };
}

function createService() {
  const dataSource = {
    createQueryRunner: vi.fn(),
  };

  const service = Object.create(EnrolmentTeacherChangeService.prototype) as EnrolmentTeacherChangeService;
  Object.assign(service, { dataSource });

  return { service, dataSource };
}

describe('EnrolmentTeacherChangeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects enrolments that do not share the same teacher', async () => {
    const { service, dataSource } = createService();
    const enrolmentRepo = createRepositoryMock();
    const lessonRepo = createRepositoryMock();
    const manager = {
      getRepository: vi.fn((entity: any) => {
        switch (entity?.name) {
          case 'Enrolment':
            return enrolmentRepo;
          case 'Lesson':
            return lessonRepo;
          default:
            throw new Error(`Unexpected repository: ${entity?.name}`);
        }
      }),
    };
    const queryRunner = createQueryRunnerMock(manager);
    dataSource.createQueryRunner.mockReturnValue(queryRunner);

    enrolmentRepo.find.mockResolvedValue([
      { id: 1, courseId: 10, course: { teacherId: 101 } },
      { id: 2, courseId: 11, course: { teacherId: 202 } },
    ]);

    const resultPromise = service.changeTeacherForEnrolments(
      1,
      {
        enrolmentIds: [1, 2],
        teacherId: 999,
        changesFrom: '2099-01-01',
      } as any,
      77,
    );

    await expect(resultPromise).rejects.toThrow(BadRequestException);
    await expect(resultPromise).rejects.toThrow('Choose enrolments with same teacher!');

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('rejects teacher changes when the effective date is in the past', async () => {
    const { service, dataSource } = createService();
    const enrolmentRepo = createRepositoryMock();
    const lessonRepo = createRepositoryMock();
    const manager = {
      getRepository: vi.fn((entity: any) => {
        switch (entity?.name) {
          case 'Enrolment':
            return enrolmentRepo;
          case 'Lesson':
            return lessonRepo;
          default:
            throw new Error(`Unexpected repository: ${entity?.name}`);
        }
      }),
    };
    const queryRunner = createQueryRunnerMock(manager);
    dataSource.createQueryRunner.mockReturnValue(queryRunner);

    enrolmentRepo.find.mockResolvedValue([
      { id: 1, courseId: 10, course: { teacherId: 101 } },
    ]);

    await expect(
      service.changeTeacherForEnrolments(
        1,
        {
          enrolmentIds: [1],
          teacherId: 999,
          changesFrom: '2000-01-01',
        } as any,
        77,
      ),
    ).rejects.toThrow('Effect from cannot be in past date');

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('clones confirmed lessons into new drafts with the new teacher', async () => {
    const { service, dataSource } = createService();
    const enrolmentRepo = createRepositoryMock();
    const lessonRepo = createRepositoryMock();
    const lessonDiscountRepo = createRepositoryMock();
    const confirmedLessons = [
      {
        id: 11,
        courseId: 10,
        teacherId: 101,
        classroomId: 7,
        colorCode: '#123456',
        date: new Date('2099-01-08T10:00:00.000Z'),
        duration: '01:00:00',
        status: LessonStatusEnum.SCHEDULED,
        isPresent: true,
        isDeleted: false,
        isConfirmed: true,
        type: 1,
        isExploded: 0,
        isOnline: false,
        createdByUserId: 4,
        updatedByUserId: 4,
        programRate: 100,
        teacherRate: 50,
        teacherRateOld: 0,
        tax: 5,
        paidStatus: 0,
        total: 105,
        dueDate: new Date('2099-01-08T00:00:00.000Z'),
        originalDate: new Date('2099-01-08T10:00:00.000Z'),
      },
      {
        id: 12,
        courseId: 10,
        teacherId: 101,
        classroomId: 7,
        colorCode: '#123456',
        date: new Date('2099-01-15T10:00:00.000Z'),
        duration: '01:00:00',
        status: LessonStatusEnum.RESCHEDULED,
        isPresent: true,
        isDeleted: false,
        isConfirmed: true,
        type: 1,
        isExploded: 0,
        isOnline: false,
        createdByUserId: 4,
        updatedByUserId: 4,
        programRate: 100,
        teacherRate: 50,
        teacherRateOld: 0,
        tax: 5,
        paidStatus: 0,
        total: 105,
        dueDate: new Date('2099-01-15T00:00:00.000Z'),
        originalDate: new Date('2099-01-15T10:00:00.000Z'),
      },
    ];
    const queryBuilder = createQueryBuilderMock(confirmedLessons);
    lessonRepo.createQueryBuilder.mockReturnValue(queryBuilder);
    lessonDiscountRepo.find.mockResolvedValue([]);

    const manager = {
      getRepository: vi.fn((entity: any) => {
        switch (entity?.name) {
          case 'Enrolment':
            return enrolmentRepo;
          case 'Lesson':
            return lessonRepo;
          case 'LessonDiscount':
            return lessonDiscountRepo;
          default:
            throw new Error(`Unexpected repository: ${entity?.name}`);
        }
      }),
    };
    const queryRunner = createQueryRunnerMock(manager);
    dataSource.createQueryRunner.mockReturnValue(queryRunner);

    enrolmentRepo.find.mockResolvedValue([
      { id: 1, courseId: 10, course: { teacherId: 101, isDeleted: false } },
    ]);
    lessonRepo.find.mockResolvedValue([]);

    await service.changeTeacherForEnrolments(
      1,
      {
        enrolmentIds: [1],
        teacherId: 555,
        changesFrom: '2099-01-01',
      } as any,
      77,
    );

    expect(lessonRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(lessonRepo.save).toHaveBeenCalledTimes(1);
    const savedDrafts = lessonRepo.save.mock.calls[0][0];

    expect(savedDrafts).toHaveLength(2);
    expect(savedDrafts[0]).toEqual(
      expect.objectContaining({
        courseId: 10,
        teacherId: 555,
        isConfirmed: false,
        createdByUserId: 77,
        updatedByUserId: 77,
        total: 105,
        status: LessonStatusEnum.SCHEDULED,
      }),
    );
    expect(savedDrafts[1]).toEqual(
      expect.objectContaining({
        courseId: 10,
        teacherId: 555,
        isConfirmed: false,
        createdByUserId: 77,
        updatedByUserId: 77,
        total: 105,
        status: LessonStatusEnum.RESCHEDULED,
      }),
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('copies lesson discounts onto the drafted teacher-change lessons', async () => {
    const { service, dataSource } = createService();
    const enrolmentRepo = createRepositoryMock();
    const lessonRepo = createRepositoryMock();
    const lessonDiscountRepo = createRepositoryMock();

    const confirmedLessons = [
      {
        id: 11,
        courseId: 10,
        teacherId: 101,
        classroomId: 7,
        colorCode: '#123456',
        date: new Date('2099-01-08T10:00:00.000Z'),
        duration: '01:00:00',
        status: LessonStatusEnum.SCHEDULED,
        isPresent: true,
        isDeleted: false,
        isConfirmed: true,
        type: 1,
        isExploded: 0,
        isOnline: false,
        createdByUserId: 4,
        updatedByUserId: 4,
        programRate: 100,
        teacherRate: 50,
        teacherRateOld: 0,
        tax: 5,
        paidStatus: 0,
        total: 105,
        dueDate: new Date('2099-01-08T00:00:00.000Z'),
        originalDate: new Date('2099-01-08T10:00:00.000Z'),
      },
    ];
    const queryBuilder = createQueryBuilderMock(confirmedLessons);
    lessonRepo.createQueryBuilder.mockReturnValue(queryBuilder);
    lessonRepo.save.mockImplementation(async (payload: any[]) =>
      payload.map((lesson, index) => ({
        ...lesson,
        id: 900 + index,
      })),
    );
    lessonRepo.find.mockResolvedValue([]);

    lessonDiscountRepo.find.mockImplementation(async ({ where }: any) => {
      if (where?.lessonId === 11) {
        return [
          {
            id: 21,
            lessonId: 11,
            value: 3.75,
            enrolmentId: 33,
            valueType: 0,
            type: 4,
          },
        ];
      }

      return [];
    });

    const manager = {
      getRepository: vi.fn((entity: any) => {
        switch (entity?.name) {
          case 'Enrolment':
            return enrolmentRepo;
          case 'Lesson':
            return lessonRepo;
          case 'LessonDiscount':
            return lessonDiscountRepo;
          default:
            throw new Error(`Unexpected repository: ${entity?.name}`);
        }
      }),
    };
    const queryRunner = createQueryRunnerMock(manager);
    dataSource.createQueryRunner.mockReturnValue(queryRunner);

    enrolmentRepo.find.mockResolvedValue([
      { id: 1, courseId: 10, course: { teacherId: 101, isDeleted: false } },
    ]);

    await service.changeTeacherForEnrolments(
      1,
      {
        enrolmentIds: [1],
        teacherId: 555,
        changesFrom: '2099-01-01',
      } as any,
      77,
    );

    expect(lessonDiscountRepo.find).toHaveBeenCalledWith({
      where: { lessonId: 11 },
    });
    expect(lessonDiscountRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        lessonId: 900,
        value: 3.75,
        enrolmentId: 33,
        valueType: 0,
        type: 4,
      }),
    ]);
  });

  it('deletes stale draft lessons and dependent rows before regenerating teacher-change drafts', async () => {
    const service = Object.create(EnrolmentTeacherChangeService.prototype) as EnrolmentTeacherChangeService;

    const lessonRepo = {
      find: vi.fn().mockResolvedValue([{ id: 101 }, { id: 102 }]),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const privateLessonRepo = {
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const privateLessonEmailStatusRepo = {
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const lessonDiscountRepo = {
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const lessonPaymentRepo = {
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const paymentCycleLessonRepo = {
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const bulkRescheduleLessonRepo = {
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const invoiceItemLessonRepo = {
      delete: vi.fn().mockResolvedValue(undefined),
    };

    const manager = {
      getRepository: vi.fn((entity: any) => {
        switch (entity?.name) {
          case 'Lesson':
            return lessonRepo;
          case 'PrivateLesson':
            return privateLessonRepo;
          case 'PrivateLessonEmailStatus':
            return privateLessonEmailStatusRepo;
          case 'LessonDiscount':
            return lessonDiscountRepo;
          case 'LessonPayment':
            return lessonPaymentRepo;
          case 'PaymentCycleLesson':
            return paymentCycleLessonRepo;
          case 'BulkRescheduleLesson':
            return bulkRescheduleLessonRepo;
          case 'InvoiceItemLesson':
            return invoiceItemLessonRepo;
          default:
            throw new Error(`Unexpected repository: ${entity?.name}`);
        }
      }),
    };

    await (service as any).deleteDraftLessonsForCourses([77, 88], manager as any);

    expect(lessonRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          isConfirmed: false,
        }),
        select: ['id'],
      }),
    );
    expect(privateLessonEmailStatusRepo.delete).toHaveBeenCalledTimes(1);
    expect(privateLessonRepo.delete).toHaveBeenCalledTimes(1);
    expect(lessonDiscountRepo.delete).toHaveBeenCalledTimes(1);
    expect(lessonPaymentRepo.delete).toHaveBeenCalledTimes(1);
    expect(paymentCycleLessonRepo.delete).toHaveBeenCalledTimes(1);
    expect(bulkRescheduleLessonRepo.delete).toHaveBeenCalledTimes(1);
    expect(invoiceItemLessonRepo.delete).toHaveBeenCalledTimes(1);
    expect(lessonRepo.delete).toHaveBeenCalledTimes(1);
  });
});
