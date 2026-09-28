import { describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { LessonExplodeRepository } from './lesson-explode.repository';
import { Lesson } from '../../entities/lesson.entity';
import { PrivateLesson } from '../../entities/private-lesson.entity';
import { LessonHierarchy } from '../../entities/lesson-hierarchy.entity';
import { LessonPayment } from '../../entities/lesson-payment.entity';
import { LessonDiscount } from '../../entities/lesson-discount.entity';
import { LessonStatusEnum } from '../../enums/lesson-status';

function createRepositoryMock() {
  return {
    create: vi.fn((payload) => payload),
    save: vi.fn(async (payload) => payload),
    find: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(async () => ({ affected: 1 })),
    delete: vi.fn(async () => ({ affected: 1 })),
    manager: {},
  };
}

describe('LessonExplodeRepository', () => {
  it.each([
    [2.9, [1.45, 1.45]],
    [2.91, [1.46, 1.45]],
  ])(
    'splits prepaid dollars %s between children while conserving totals',
    async (reduction: number, expectedShares: number[]) => {
      const entities = [
        Lesson,
        PrivateLesson,
        LessonHierarchy,
        LessonPayment,
        LessonDiscount,
      ];
      const repositories = entities.map(() => createRepositoryMock());
      repositories.forEach((r) => r.find.mockResolvedValue([]));
      const [lessons, privateLessons, , , discounts] = repositories;
      let nextId = 2000;
      lessons.save.mockImplementation(async (row) => ({
        ...row,
        id: nextId++,
      }));
      discounts.find.mockResolvedValue([
        { type: 7, value: reduction, valueType: 0 },
        { type: 2, value: 8, valueType: 1 },
      ]);
      const manager = {
        getRepository: (entity) => repositories[entities.indexOf(entity)],
      };
      const dataSource = {
        transaction: (run) => run(manager),
      } as unknown as DataSource;
      const repository = new LessonExplodeRepository(
        ...(repositories as [any, any, any, any, any]),
        {} as any,
        {} as any,
        dataSource,
      );
      await repository.executeExplode(
        Object.assign(new Lesson(), {
          id: 1000,
          duration: '00:30:00',
          programRate: 72.5,
          tax: 0,
          date: new Date('2026-09-09T10:00:00Z'),
          privateLesson: [{ total: Number((36.25 - reduction).toFixed(2)) }],
        }),
        200,
        300,
      );
      const saved = discounts.save.mock.calls.map(([row]) => row);
      expect(saved.filter((r) => r.type === 7).map((r) => r.value)).toEqual(
        expectedShares,
      );
      expect(saved.filter((r) => r.type === 2).map((r) => r.value)).toEqual([
        8, 8,
      ]);
      expect(
        privateLessons.save.mock.calls.reduce(
          (sum, [r]) => sum + Math.round(r.total * 100),
          0,
        ),
      ).toBe(Math.round((36.25 - reduction) * 100));
    },
  );

  it('preserves unrelated parent payment balance during explode', async () => {
    const lessonRepo = createRepositoryMock();
    const privateLessonRepo = createRepositoryMock();
    const lessonHierarchyRepo = createRepositoryMock();
    const lessonPaymentRepo = createRepositoryMock();
    const lessonDiscountRepo = createRepositoryMock();

    const originalPayment = {
      id: 501,
      amount: 130,
      balance: 129.99,
      isDeleted: 0,
    };
    const originalLessonPayments = [
      {
        id: 9001,
        royaltyCategoryId: 1,
        royaltyRateApplied: 6,
        advertisementRateApplied: 1.25,
        lessonId: 1001,
        paymentId: 501,
        enrolmentId: 201,
        amount: 0.01,
        isDeleted: 0,
        payment: originalPayment,
      },
    ];
    const savedLessonPayments: Array<Record<string, any>> = [];
    const savedPrivateLessons = new Map<number, Record<string, any>>();
    let nextLessonId = 2001;

    privateLessonRepo.find.mockImplementation(async ({ where }: any) => {
      if (where.lessonId === 1001) {
        return [
          {
            id: 3001,
            lessonId: 1001,
            expiryDate: new Date('2026-12-01T00:00:00.000Z'),
          },
        ];
      }

      return Array.from(savedPrivateLessons.values()).filter(
        (item) => item.lessonId === where.lessonId,
      );
    });
    privateLessonRepo.findOne.mockImplementation(async ({ where }: any) => {
      return savedPrivateLessons.get(where.lessonId) ?? null;
    });
    privateLessonRepo.save.mockImplementation(async (payload: any) => {
      if (Array.isArray(payload)) {
        payload.forEach((item) => savedPrivateLessons.set(item.lessonId, item));
      } else {
        savedPrivateLessons.set(payload.lessonId, payload);
      }
      return payload;
    });

    lessonPaymentRepo.find.mockImplementation(async ({ where }: any) => {
      if (where.lessonId === 1001) {
        return originalLessonPayments;
      }

      return savedLessonPayments.filter(
        (item) => item.lessonId === where.lessonId && item.isDeleted === 0,
      );
    });
    lessonPaymentRepo.save.mockImplementation(async (payload: any) => {
      savedLessonPayments.push(payload);
      return payload;
    });

    lessonRepo.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: nextLessonId++,
      getGrossPrice() {
        return Number(this.programRate ?? 0) * 0.25;
      },
      getNetPrice() {
        return Number(
          (
            Number(this.programRate ?? 0) * 0.25 +
            Number(this.tax ?? 0)
          ).toFixed(2),
        );
      },
    }));
    lessonRepo.update.mockResolvedValue({ affected: 1 });
    lessonHierarchyRepo.find.mockResolvedValue([]);
    lessonHierarchyRepo.save.mockResolvedValue([]);
    lessonDiscountRepo.find.mockResolvedValue([]);
    lessonDiscountRepo.save.mockResolvedValue([]);

    const manager = {
      getRepository: vi.fn((entity: any) => {
        switch (entity) {
          case Lesson:
            return lessonRepo;
          case PrivateLesson:
            return privateLessonRepo;
          case LessonHierarchy:
            return lessonHierarchyRepo;
          case LessonPayment:
            return lessonPaymentRepo;
          case LessonDiscount:
            return lessonDiscountRepo;
          default:
            throw new Error(
              `Unexpected repository request: ${entity?.name ?? entity}`,
            );
        }
      }),
    };

    const dataSource = {
      transaction: vi.fn(async (callback: any) => callback(manager)),
    } as unknown as DataSource;

    const repository = new LessonExplodeRepository(
      lessonRepo as any,
      privateLessonRepo as any,
      lessonHierarchyRepo as any,
      lessonPaymentRepo as any,
      lessonDiscountRepo as any,
      {} as any,
      {} as any,
      dataSource,
    );

    const lesson = {
      id: 1001,
      courseId: 200,
      teacherId: 300,
      classroomId: null,
      duration: '00:30:00',
      status: LessonStatusEnum.UNSCHEDULED,
      isPresent: true,
      isDeleted: false,
      isConfirmed: true,
      type: 1,
      isExploded: 0,
      isOnline: false,
      createdByUserId: 10,
      updatedByUserId: 10,
      programRate: 57.5,
      teacherRate: 0,
      teacherRateOld: 0,
      tax: 0,
      total: 28.75,
      dueDate: new Date('2026-09-03T00:00:00.000Z'),
      paidStatus: 0,
      originalDate: new Date('2026-09-03T00:00:00.000Z'),
      getGrossPrice() {
        return 28.75;
      },
    } as any;

    const result = await repository.executeExplode(lesson, 201, 999);

    expect(result.explodedLessons).toHaveLength(2);
    expect(originalPayment.balance).toBe(129.99);
    expect(originalLessonPayments[0].payment.balance).toBe(129.99);
    expect(lessonPaymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonId: 2001,
        amount: 0.01,
        royaltyCategoryId: 1,
        royaltyRateApplied: 6,
        advertisementRateApplied: 1.25,
      }),
    );
  });

  it('preserves the parent net total when exploding a discounted lesson', async () => {
    const lessonRepo = createRepositoryMock();
    const privateLessonRepo = createRepositoryMock();
    const lessonHierarchyRepo = createRepositoryMock();
    const lessonPaymentRepo = createRepositoryMock();
    const lessonDiscountRepo = createRepositoryMock();

    const originalPayment = {
      id: 601,
      amount: 130,
      balance: 129.99,
      isDeleted: 0,
    };
    const originalLessonPayments = [
      {
        id: 9101,
        lessonId: 1002,
        paymentId: 601,
        enrolmentId: 202,
        amount: 0.01,
        isDeleted: 0,
        payment: originalPayment,
      },
    ];
    const savedPrivateLessons = new Map<number, Record<string, any>>();
    let nextLessonId = 3001;

    privateLessonRepo.find.mockImplementation(async ({ where }: any) => {
      if (where.lessonId === 1002) {
        return [
          {
            id: 4001,
            lessonId: 1002,
            expiryDate: new Date('2026-12-01T00:00:00.000Z'),
          },
        ];
      }

      return Array.from(savedPrivateLessons.values()).filter(
        (item) => item.lessonId === where.lessonId,
      );
    });
    privateLessonRepo.findOne.mockImplementation(async ({ where }: any) => {
      return savedPrivateLessons.get(where.lessonId) ?? null;
    });
    privateLessonRepo.save.mockImplementation(async (payload: any) => {
      if (Array.isArray(payload)) {
        payload.forEach((item) => savedPrivateLessons.set(item.lessonId, item));
      } else {
        savedPrivateLessons.set(payload.lessonId, payload);
      }
      return payload;
    });

    lessonPaymentRepo.find.mockImplementation(async ({ where }: any) => {
      if (where.lessonId === 1002) {
        return originalLessonPayments;
      }

      return [];
    });
    lessonPaymentRepo.save.mockResolvedValue({});

    lessonRepo.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: nextLessonId++,
      getGrossPrice() {
        return Number(this.programRate ?? 0) * 0.25;
      },
      getNetPrice() {
        return Number(this.total ?? 0);
      },
    }));
    lessonRepo.update.mockResolvedValue({ affected: 1 });
    lessonHierarchyRepo.find.mockResolvedValue([]);
    lessonHierarchyRepo.save.mockResolvedValue([]);
    lessonDiscountRepo.find.mockResolvedValue([
      {
        type: LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
        value: 1.25,
        valueType: 0,
      },
      {
        type: LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
        value: 6,
        valueType: 1,
      },
    ]);
    lessonDiscountRepo.save.mockImplementation(async (payload: any) => payload);

    const manager = {
      getRepository: vi.fn((entity: any) => {
        switch (entity) {
          case Lesson:
            return lessonRepo;
          case PrivateLesson:
            return privateLessonRepo;
          case LessonHierarchy:
            return lessonHierarchyRepo;
          case LessonPayment:
            return lessonPaymentRepo;
          case LessonDiscount:
            return lessonDiscountRepo;
          default:
            throw new Error(
              `Unexpected repository request: ${entity?.name ?? entity}`,
            );
        }
      }),
    };

    const dataSource = {
      transaction: vi.fn(async (callback: any) => callback(manager)),
    } as unknown as DataSource;

    const repository = new LessonExplodeRepository(
      lessonRepo as any,
      privateLessonRepo as any,
      lessonHierarchyRepo as any,
      lessonPaymentRepo as any,
      lessonDiscountRepo as any,
      {} as any,
      {} as any,
      dataSource,
    );

    const lesson = {
      id: 1002,
      courseId: 200,
      teacherId: 300,
      classroomId: null,
      duration: '00:30:00',
      status: LessonStatusEnum.UNSCHEDULED,
      isPresent: true,
      isDeleted: false,
      isConfirmed: true,
      type: 1,
      isExploded: 0,
      isOnline: false,
      createdByUserId: 10,
      updatedByUserId: 10,
      programRate: 65,
      teacherRate: 0,
      teacherRateOld: 0,
      tax: 0,
      total: 29.38,
      dueDate: new Date('2026-09-03T00:00:00.000Z'),
      paidStatus: 0,
      originalDate: new Date('2026-09-03T00:00:00.000Z'),
      getGrossPrice() {
        return 32.5;
      },
      getNetPrice() {
        return 29.38;
      },
    } as any;

    const result = await repository.executeExplode(lesson, 202, 1000);

    expect(result.explodedLessons).toHaveLength(2);
    expect(
      lessonRepo.save.mock.calls.map(([payload]: any[]) =>
        Number(payload.total),
      ),
    ).toEqual([14.69, 14.69]);
    expect(
      Array.from(savedPrivateLessons.values()).map((item) =>
        Number(item.total),
      ),
    ).toEqual([14.69, 14.69]);
    expect(
      Array.from(savedPrivateLessons.values()).reduce(
        (sum, item) => sum + Number(item.total),
        0,
      ),
    ).toBe(29.38);
  });

  it('uses the stored private lesson total when lesson.total is zero', async () => {
    const lessonRepo = createRepositoryMock();
    const privateLessonRepo = createRepositoryMock();
    const lessonHierarchyRepo = createRepositoryMock();
    const lessonPaymentRepo = createRepositoryMock();
    const lessonDiscountRepo = createRepositoryMock();

    const savedPrivateLessons = new Map<number, Record<string, any>>();
    let nextLessonId = 4001;

    privateLessonRepo.find.mockImplementation(async ({ where }: any) => {
      if (where.lessonId === 1003) {
        return [
          {
            id: 5001,
            lessonId: 1003,
            expiryDate: new Date('2026-12-01T00:00:00.000Z'),
          },
        ];
      }

      return Array.from(savedPrivateLessons.values()).filter(
        (item) => item.lessonId === where.lessonId,
      );
    });
    privateLessonRepo.findOne.mockImplementation(async ({ where }: any) => {
      return savedPrivateLessons.get(where.lessonId) ?? null;
    });
    privateLessonRepo.save.mockImplementation(async (payload: any) => {
      if (Array.isArray(payload)) {
        payload.forEach((item) => savedPrivateLessons.set(item.lessonId, item));
      } else {
        savedPrivateLessons.set(payload.lessonId, payload);
      }
      return payload;
    });

    lessonPaymentRepo.find.mockImplementation(async ({ where }: any) => {
      if (where.lessonId === 1003) {
        return [];
      }

      return [];
    });
    lessonPaymentRepo.save.mockResolvedValue({});

    lessonRepo.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: nextLessonId++,
      getGrossPrice() {
        return Number(this.programRate ?? 0) * 0.25;
      },
      getNetPrice() {
        return Number(this.privateLesson?.[0]?.total ?? this.total ?? 0);
      },
    }));
    lessonRepo.update.mockResolvedValue({ affected: 1 });
    lessonHierarchyRepo.find.mockResolvedValue([]);
    lessonHierarchyRepo.save.mockResolvedValue([]);
    lessonDiscountRepo.find.mockResolvedValue([
      {
        type: LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
        value: 1.25,
        valueType: 0,
      },
      {
        type: LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
        value: 6,
        valueType: 1,
      },
    ]);
    lessonDiscountRepo.save.mockImplementation(async (payload: any) => payload);

    const manager = {
      getRepository: vi.fn((entity: any) => {
        switch (entity) {
          case Lesson:
            return lessonRepo;
          case PrivateLesson:
            return privateLessonRepo;
          case LessonHierarchy:
            return lessonHierarchyRepo;
          case LessonPayment:
            return lessonPaymentRepo;
          case LessonDiscount:
            return lessonDiscountRepo;
          default:
            throw new Error(
              `Unexpected repository request: ${entity?.name ?? entity}`,
            );
        }
      }),
    };

    const dataSource = {
      transaction: vi.fn(async (callback: any) => callback(manager)),
    } as unknown as DataSource;

    const repository = new LessonExplodeRepository(
      lessonRepo as any,
      privateLessonRepo as any,
      lessonHierarchyRepo as any,
      lessonPaymentRepo as any,
      lessonDiscountRepo as any,
      {} as any,
      {} as any,
      dataSource,
    );

    const lesson = {
      id: 1003,
      courseId: 200,
      teacherId: 300,
      classroomId: null,
      duration: '00:30:00',
      status: LessonStatusEnum.UNSCHEDULED,
      isPresent: true,
      isDeleted: false,
      isConfirmed: true,
      type: 1,
      isExploded: 0,
      isOnline: false,
      createdByUserId: 10,
      updatedByUserId: 10,
      programRate: 65,
      teacherRate: 0,
      teacherRateOld: 0,
      tax: 0,
      total: 0,
      privateLesson: [{ total: 29.38, balance: 29.38 }],
      dueDate: new Date('2026-09-03T00:00:00.000Z'),
      paidStatus: 0,
      originalDate: new Date('2026-09-03T00:00:00.000Z'),
      getGrossPrice() {
        return 32.5;
      },
      getNetPrice() {
        return 0;
      },
    } as any;

    const result = await repository.executeExplode(lesson, 203, 1001);

    expect(result.explodedLessons).toHaveLength(2);
    expect(
      lessonRepo.save.mock.calls.map(([payload]: any[]) =>
        Number(payload.total),
      ),
    ).toEqual([14.69, 14.69]);
    expect(
      Array.from(savedPrivateLessons.values()).map((item) =>
        Number(item.total),
      ),
    ).toEqual([14.69, 14.69]);
  });
});
