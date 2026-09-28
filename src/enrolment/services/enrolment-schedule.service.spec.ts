import { describe, expect, it, vi } from 'vitest';
import { EnrolmentScheduleService } from './enrolment-schedule.service';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { LessonDiscount } from '../../lesson/entities/lesson-discount.entity';

describe('extension schedule history', () => {
  it.each([
    ['2026-10-24', false],
    ['2026-10-31', false],
    ['2026-11-01', true],
    ['2026-11-14', true],
  ])('extends lessons to %s without reversed schedule periods', async (end, createsPeriod) => {
    const schedule = {
      id: 1, courseId: 10, startDate: new Date('2026-09-19T00:00:00'),
      endDate: new Date('2026-10-31T23:59:59'), teacherId: 601,
      day: 6, fromTime: '10:00:00', duration: '00:30:00', isRecent: true,
    };
    const service: any = Object.create(EnrolmentScheduleService.prototype);
    const query: any = {
      update: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(), andWhere: vi.fn().mockReturnThis(),
      execute: vi.fn(), getMany: vi.fn().mockResolvedValue([]),
    };
    Object.assign(service, {
      courseScheduleRepository: {
        findOne: vi.fn().mockResolvedValue(schedule), create: vi.fn((row) => row),
        save: vi.fn(), createQueryBuilder: vi.fn(() => query),
      },
      paymentFrequencyRepository: { findOne: vi.fn().mockResolvedValue(null) },
      lessonRepository: { createQueryBuilder: () => query },
      courseRepository: { findOne: vi.fn().mockResolvedValue(null) },
      restoreDeletedLessonsForExtension: vi.fn().mockResolvedValue(new Map()),
      generateLessons: vi.fn(), reconcileExtendedLessons: vi.fn(),
      linkLessonsToPaymentCycles: vi.fn(), updateStudentAndUserStatus: vi.fn(),
    });
    const enrolment = { id: 20, courseId: 10 };
    const lastLesson = { date: new Date('2026-10-10T10:00:00') };
    const endDate = new Date(`${end}T23:59:59`);
    await service.extendEnrolment(enrolment, lastLesson, endDate, 1);
    expect(service.generateLessons).toHaveBeenCalledWith(enrolment, lastLesson, endDate, schedule, 1);
    if (createsPeriod) {
      expect(service.courseScheduleRepository.save).toHaveBeenCalledWith({
        courseId: 10, startDate: new Date('2026-11-01T00:00:00'), endDate,
        teacherId: 601, day: 6, fromTime: '10:00:00', duration: '00:30:00', isRecent: true,
      });
    } else {
      expect(service.courseScheduleRepository.save).not.toHaveBeenCalled();
      expect(service.courseScheduleRepository.createQueryBuilder).not.toHaveBeenCalled();
    }
  });
});

function createService(manager: any): EnrolmentScheduleService {
  const noop = {} as any;
  const lessonRepository = { manager } as any;
  const deps = [
    noop,
    noop,
    noop,
    noop,
    lessonRepository,
    ...Array(29).fill(noop),
  ] as any;

  return new EnrolmentScheduleService(...deps);
}

describe('EnrolmentScheduleService private lesson discount calculation', () => {
  it('treats PF as percentage even when historical valueType says dollar', () => {
    const service = createService({});

    const discount = (service as any).calculatePrivateLessonDiscount(32.5, [
      {
        type: LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
        value: 3,
        valueType: 0,
      },
    ]);

    expect(discount).toBeCloseTo(0.975, 8);
  });

  it('treats Multiple Enrolment as dollars even when valueType says percentage', () => {
    const service = createService({});

    const discount = (service as any).calculatePrivateLessonDiscount(32.5, [
      {
        type: LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
        value: 1.25,
        valueType: 1,
      },
      {
        type: LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
        value: 3,
        valueType: 0,
      },
    ]);

    expect(discount).toBeCloseTo(2.1875, 8);
  });
});

type ExtendState = {
  lessonsById: Map<number, any>;
  lessonPaymentsByLessonId: Map<number, any[]>;
  privateLessonsByLessonId: Map<number, any[]>;
  paymentCycleLinksByLessonId: Map<number, any[]>;
};

function createChainableQueryBuilder(getManyResult: any[] = [], getRawOneResult: any = null) {
  const qb: any = {
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    addOrderBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    into: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn(async () => undefined),
    getMany: vi.fn(async () => getManyResult),
    getRawOne: vi.fn(async () => getRawOneResult),
  };

  return qb;
}

function createExtendReconciliationService() {
  const noop = {} as any;
  const state: ExtendState = {
    lessonsById: new Map([
      [
        10,
        {
          id: 10,
          courseId: 123,
          date: new Date(Date.UTC(2026, 6, 1, 12, 0, 0)),
          status: LessonStatusEnum.SCHEDULED,
          isDeleted: false,
          isConfirmed: true,
        },
      ],
      [
        11,
        {
          id: 11,
          courseId: 123,
          date: new Date(Date.UTC(2026, 6, 1, 12, 0, 0)),
          status: LessonStatusEnum.CANCELED,
          isDeleted: false,
          isConfirmed: true,
        },
      ],
      [
        12,
        {
          id: 12,
          courseId: 123,
          date: new Date(Date.UTC(2026, 6, 1, 12, 0, 0)),
          status: LessonStatusEnum.SCHEDULED,
          isDeleted: false,
          isConfirmed: true,
        },
      ],
    ]),
    lessonPaymentsByLessonId: new Map([
      [
        10,
        [
          {
            id: 2,
            lessonId: 10,
            paymentId: 502,
            enrolmentId: 44,
            amount: 50,
            isDeleted: 0,
            payment: { paymentMethodId: 4, isDeleted: 0 },
          },
        ],
      ],
      [
        11,
        [
          {
            id: 1,
            lessonId: 11,
            paymentId: 501,
            enrolmentId: 44,
            amount: 100,
            isDeleted: 0,
            payment: { paymentMethodId: 4, isDeleted: 0 },
          },
        ],
      ],
      [12, []],
    ]),
    privateLessonsByLessonId: new Map([
      [10, [{ id: 100, lessonId: 10, total: 200, balance: 150 }]],
      [11, [{ id: 101, lessonId: 11, total: 100, balance: 0 }]],
      [12, [{ id: 102, lessonId: 12, total: 100, balance: 100 }]],
    ]),
    paymentCycleLinksByLessonId: new Map([
      [10, [{ id: 201, lessonId: 10, paymentCycleId: 301, isDeleted: 0 }]],
      [11, [{ id: 202, lessonId: 11, paymentCycleId: 301, isDeleted: 0 }]],
      [12, [{ id: 203, lessonId: 12, paymentCycleId: 302, isDeleted: 0 }]],
    ]),
  };

  const lessonQueryBuilder = createChainableQueryBuilder(
    Array.from(state.lessonsById.values()),
    null,
  );
  const creditUsageQueryBuilder = createChainableQueryBuilder([], null);

  const lessonRepository = {
    createQueryBuilder: vi
      .fn()
      .mockImplementationOnce(() => lessonQueryBuilder)
      .mockImplementationOnce(() => creditUsageQueryBuilder),
    update: vi.fn(async (id: number, values: any) => {
      const current = state.lessonsById.get(Number(id));
      if (current) {
        state.lessonsById.set(Number(id), { ...current, ...values });
      }
      return { affected: 1 };
    }),
  } as any;

  const lessonPaymentRepository = {
    find: vi.fn(async (criteria: any) => {
      const lessonId = Number(criteria?.where?.lessonId ?? criteria?.lessonId ?? 0);
      const rows = state.lessonPaymentsByLessonId.get(lessonId) ?? [];
      return rows.map((row) => ({
        ...row,
        payment: row.payment ? { ...row.payment } : row.payment,
      }));
    }),
    update: vi.fn(async (criteria: any, values: any) => {
      const oldLessonId = Number(criteria?.lessonId ?? criteria?.where?.lessonId ?? 0);
      const newLessonId = Number(values?.lessonId ?? 0);
      const rows = state.lessonPaymentsByLessonId.get(oldLessonId) ?? [];
      if (oldLessonId > 0 && newLessonId > 0 && rows.length > 0) {
        const remaining = state.lessonPaymentsByLessonId.get(newLessonId) ?? [];
        const moved = rows.map((row) => ({ ...row, lessonId: newLessonId }));
        state.lessonPaymentsByLessonId.set(oldLessonId, []);
        state.lessonPaymentsByLessonId.set(newLessonId, [...remaining, ...moved]);
      }
      return { affected: 1 };
    }),
  } as any;

  const privateLessonRepository = {
    find: vi.fn(async (criteria: any) => {
      const lessonId = Number(criteria?.where?.lessonId ?? criteria?.lessonId ?? 0);
      const rows = state.privateLessonsByLessonId.get(lessonId) ?? [];
      return rows.map((row) => ({ ...row }));
    }),
    save: vi.fn(async (rows: any[]) => {
      for (const row of rows) {
        const lessonId = Number(row.lessonId);
        const existingRows = state.privateLessonsByLessonId.get(lessonId) ?? [];
        const index = existingRows.findIndex((item) => item.id === row.id);
        if (index >= 0) {
          existingRows[index] = { ...existingRows[index], ...row };
        } else {
          existingRows.push({ ...row });
        }
        state.privateLessonsByLessonId.set(lessonId, existingRows);
      }
      return rows;
    }),
  } as any;

  const paymentCycleLessonRepository = {
    find: vi.fn(async (criteria: any) => {
      const lessonId = Number(criteria?.where?.lessonId ?? criteria?.lessonId ?? 0);
      const rows = state.paymentCycleLinksByLessonId.get(lessonId) ?? [];
      return rows.map((row) => ({ ...row }));
    }),
    update: vi.fn(async (idOrCriteria: any, values: any) => {
      const linkId = Number(typeof idOrCriteria === 'number' ? idOrCriteria : idOrCriteria?.id ?? 0);
      for (const [lessonId, rows] of state.paymentCycleLinksByLessonId.entries()) {
        const index = rows.findIndex((row) => row.id === linkId);
        if (index < 0) {
          continue;
        }

        const updated = { ...rows[index], ...values };
        if (values?.lessonId && Number(values.lessonId) !== lessonId) {
          rows.splice(index, 1);
          const newLessonId = Number(values.lessonId);
          const targetRows = state.paymentCycleLinksByLessonId.get(newLessonId) ?? [];
          targetRows.push(updated);
          state.paymentCycleLinksByLessonId.set(newLessonId, targetRows);
        } else {
          rows[index] = updated;
          state.paymentCycleLinksByLessonId.set(lessonId, rows);
        }
        return { affected: 1 };
      }

      return { affected: 0 };
    }),
  } as any;

  const paymentRepository = {
    update: vi.fn(async () => undefined),
  } as any;

  const deps = [
    noop,
    noop,
    noop,
    noop,
    lessonRepository,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    privateLessonRepository,
    noop,
    paymentCycleLessonRepository,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    lessonPaymentRepository,
    paymentRepository,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
  ] as any;

  const service = new EnrolmentScheduleService(...deps);

  return {
    service,
    state,
    mocks: {
      lessonRepository,
      lessonPaymentRepository,
      privateLessonRepository,
      paymentCycleLessonRepository,
      paymentRepository,
    },
  };
}

describe('EnrolmentScheduleService end-date reconciliation', () => {
  it('moves payments and payment-cycle links from duplicate lessons to the canonical active lesson', async () => {
    const { service, state, mocks } = createExtendReconciliationService();
    const enrolment = { id: 44, courseId: 123 } as any;

    await (service as any).reconcileExtendedLessons(
      enrolment,
      new Date(Date.UTC(2026, 6, 1, 12, 0, 0)),
      new Date(Date.UTC(2026, 6, 1, 12, 0, 0)),
      901,
    );

    expect(mocks.lessonRepository.update).toHaveBeenCalledWith(
      12,
      expect.objectContaining({
        status: LessonStatusEnum.CANCELED,
        updatedByUserId: 901,
      }),
    );
    expect(mocks.lessonPaymentRepository.update).toHaveBeenCalledWith(
      { lessonId: 11, isDeleted: 0 },
      { lessonId: 10 },
    );
    expect(mocks.paymentCycleLessonRepository.update).toHaveBeenCalledWith(202, {
      isDeleted: 1,
    });
    expect(mocks.paymentCycleLessonRepository.update).toHaveBeenCalledWith(203, {
      lessonId: 10,
    });

    expect(state.lessonPaymentsByLessonId.get(10)).toHaveLength(2);
    expect(state.lessonPaymentsByLessonId.get(11)).toHaveLength(0);
    expect(state.lessonsById.get(10)?.status).toBe(LessonStatusEnum.SCHEDULED);
    expect(state.lessonsById.get(11)?.status).toBe(LessonStatusEnum.CANCELED);
    expect(state.lessonsById.get(12)?.status).toBe(LessonStatusEnum.CANCELED);
    expect(state.privateLessonsByLessonId.get(10)?.[0]?.balance).toBe(50);
    expect(state.privateLessonsByLessonId.get(11)?.[0]?.balance).toBe(100);
    expect(state.privateLessonsByLessonId.get(12)?.[0]?.balance).toBe(100);
  });
});

type RestoreState = {
  lessonsById: Map<number, any>;
  lessonPaymentsByLessonId: Map<number, any[]>;
  privateLessonsByLessonId: Map<number, any[]>;
  paymentsById: Map<number, any>;
};

function createRestoreExtensionService() {
  const noop = {} as any;
  const state: RestoreState = {
    lessonsById: new Map([
      [
        20,
        {
          id: 20,
          courseId: 123,
          date: new Date(Date.UTC(2026, 6, 1, 12, 0, 0)),
          status: LessonStatusEnum.CANCELED,
          isDeleted: true,
          isConfirmed: true,
        },
      ],
      [
        21,
        {
          id: 21,
          courseId: 123,
          date: new Date(Date.UTC(2026, 6, 8, 12, 0, 0)),
          status: LessonStatusEnum.CANCELED,
          isDeleted: true,
          isConfirmed: true,
        },
      ],
    ]),
    lessonPaymentsByLessonId: new Map([
      [
        20,
        [
          {
            id: 301,
            lessonId: 20,
            paymentId: 901,
            enrolmentId: 44,
            amount: 100,
            isDeleted: 1,
            payment: { paymentMethodId: 4, isDeleted: 0 },
          },
        ],
      ],
      [21, []],
    ]),
    privateLessonsByLessonId: new Map([
      [20, [{ id: 401, lessonId: 20, total: 100, balance: 0 }]],
      [21, [{ id: 402, lessonId: 21, total: 80, balance: 0 }]],
    ]),
    paymentsById: new Map([
      [
        901,
        {
          id: 901,
          amount: 100,
          balance: 0,
          paymentMethodId: 4,
          isDeleted: 0,
        },
      ],
    ]),
  };

  const deletedLessonsQueryBuilder = createChainableQueryBuilder(
    Array.from(state.lessonsById.values()),
    null,
  );

  const lessonRepository = {
    createQueryBuilder: vi.fn(() => deletedLessonsQueryBuilder),
    update: vi.fn(async (id: number, values: any) => {
      const current = state.lessonsById.get(Number(id));
      if (current) {
        state.lessonsById.set(Number(id), { ...current, ...values });
      }
      return { affected: 1 };
    }),
  } as any;

  const lessonPaymentRepository = {
    find: vi.fn(async (criteria: any) => {
      const where = criteria?.where ?? criteria ?? {};
      const lessonId = where.lessonId !== undefined ? Number(where.lessonId) : null;
      const paymentId = where.paymentId !== undefined ? Number(where.paymentId) : null;
      const enrolmentId = where.enrolmentId !== undefined ? Number(where.enrolmentId) : null;
      const isDeleted = where.isDeleted;
      const rows = Array.from(state.lessonPaymentsByLessonId.values()).reduce(
        (allRows, lessonRows) => allRows.concat(lessonRows),
        [] as any[],
      );
      return rows
        .filter((row) => (
          (lessonId === null || row.lessonId === lessonId)
          && (paymentId === null || row.paymentId === paymentId)
          && (enrolmentId === null || row.enrolmentId === enrolmentId)
          && (isDeleted === undefined ? true : row.isDeleted === isDeleted)
        ))
        .map((row) => ({
          ...row,
          payment: row.payment ? { ...row.payment } : row.payment,
        }));
    }),
    update: vi.fn(async (id: number, values: any) => {
      for (const [lessonId, rows] of state.lessonPaymentsByLessonId.entries()) {
        const index = rows.findIndex((row) => row.id === Number(id));
        if (index < 0) {
          continue;
        }

        rows[index] = { ...rows[index], ...values };
        state.lessonPaymentsByLessonId.set(lessonId, rows);
        return { affected: 1 };
      }

      return { affected: 0 };
    }),
  } as any;

  const privateLessonRepository = {
    find: vi.fn(async (criteria: any) => {
      const lessonId = Number(criteria?.where?.lessonId ?? criteria?.lessonId ?? 0);
      const rows = state.privateLessonsByLessonId.get(lessonId) ?? [];
      return rows.map((row) => ({ ...row }));
    }),
    save: vi.fn(async (rows: any[]) => {
      for (const row of rows) {
        const lessonId = Number(row.lessonId);
        const existingRows = state.privateLessonsByLessonId.get(lessonId) ?? [];
        const index = existingRows.findIndex((item) => item.id === row.id);
        if (index >= 0) {
          existingRows[index] = { ...existingRows[index], ...row };
        } else {
          existingRows.push({ ...row });
        }
        state.privateLessonsByLessonId.set(lessonId, existingRows);
      }
      return rows;
    }),
  } as any;

  const paymentRepository = {
    findOne: vi.fn(async (criteria: any) => {
      const paymentId = Number(criteria?.where?.id ?? criteria?.id ?? 0);
      const payment = state.paymentsById.get(paymentId);
      return payment ? { ...payment } : null;
    }),
    update: vi.fn(async (id: number, values: any) => {
      const paymentId = Number(id);
      const current = state.paymentsById.get(paymentId);
      if (current) {
        state.paymentsById.set(paymentId, { ...current, ...values });
      }
      return { affected: 1 };
    }),
  } as any;

  const invoicePaymentRepository = {
    find: vi.fn(async () => []),
  } as any;

  const deps = [
    noop,
    noop,
    noop,
    noop,
    lessonRepository,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    privateLessonRepository,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    invoicePaymentRepository,
    noop,
    noop,
    noop,
    lessonPaymentRepository,
    paymentRepository,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
  ] as any;

  const service = new EnrolmentScheduleService(...deps);

  return {
    service,
    state,
    mocks: {
      lessonRepository,
      lessonPaymentRepository,
      privateLessonRepository,
      paymentRepository,
    },
  };
}

describe('EnrolmentScheduleService end-date restore', () => {
  it('restores soft-deleted paid and unpaid lessons so paid rows come back at 0.00', async () => {
    const { service, state, mocks } = createRestoreExtensionService();
    const enrolment = { id: 44, courseId: 123 } as any;

    await (service as any).restoreDeletedLessonsForExtension(
      enrolment,
      new Date(Date.UTC(2026, 6, 1, 0, 0, 0)),
      new Date(Date.UTC(2026, 6, 30, 23, 59, 59)),
      777,
    );

    expect(mocks.lessonRepository.update).toHaveBeenCalledWith(
      20,
      expect.objectContaining({
        isDeleted: false,
        status: LessonStatusEnum.SCHEDULED,
        updatedByUserId: 777,
      }),
    );
    expect(mocks.lessonRepository.update).toHaveBeenCalledWith(
      21,
      expect.objectContaining({
        isDeleted: false,
        status: LessonStatusEnum.SCHEDULED,
        updatedByUserId: 777,
      }),
    );

    expect(state.lessonsById.get(20)?.isDeleted).toBe(false);
    expect(state.lessonsById.get(20)?.status).toBe(LessonStatusEnum.SCHEDULED);
    expect(state.lessonsById.get(21)?.isDeleted).toBe(false);
    expect(state.lessonsById.get(21)?.status).toBe(LessonStatusEnum.SCHEDULED);

    expect(state.lessonPaymentsByLessonId.get(20)?.[0]?.isDeleted).toBe(0);
    expect(state.privateLessonsByLessonId.get(20)?.[0]?.balance).toBe(0);
    expect(state.privateLessonsByLessonId.get(21)?.[0]?.balance).toBe(80);
    expect(state.paymentsById.get(901)?.balance).toBe(0);
    expect(mocks.paymentRepository.update).toHaveBeenCalledWith(
      901,
      expect.objectContaining({
        balance: 0,
        updatedByUserId: 777,
      }),
    );
  });
});

type DueDatePreservationState = {
  lessonsById: Map<number, any>;
  paymentCycles: any[];
};

function createDueDatePreservationService() {
  const noop = {} as any;
  const state: DueDatePreservationState = {
    lessonsById: new Map([
      [
        30,
        {
          id: 30,
          courseId: 123,
          date: new Date(Date.UTC(2026, 6, 5, 12, 0, 0)),
          dueDate: new Date(Date.UTC(2026, 4, 20, 0, 0, 0)),
          status: LessonStatusEnum.SCHEDULED,
          isDeleted: false,
          isConfirmed: true,
        },
      ],
      [
        31,
        {
          id: 31,
          courseId: 123,
          date: new Date(Date.UTC(2026, 6, 12, 12, 0, 0)),
          dueDate: new Date(Date.UTC(2026, 4, 20, 0, 0, 0)),
          status: LessonStatusEnum.SCHEDULED,
          isDeleted: false,
          isConfirmed: true,
        },
      ],
    ]),
    paymentCycles: [
      {
        id: 401,
        enrolmentId: 44,
        startDate: new Date(Date.UTC(2026, 6, 1, 0, 0, 0)),
        endDate: new Date(Date.UTC(2026, 6, 31, 23, 59, 59)),
        isDeleted: 0,
      },
    ],
  };

  const paymentCycleLessonInsertBuilder = createChainableQueryBuilder([], null);

  const lessonRepository = {
    update: vi.fn(async (id: number, values: any) => {
      const current = state.lessonsById.get(Number(id));
      if (current) {
        state.lessonsById.set(Number(id), { ...current, ...values });
      }
      return { affected: 1 };
    }),
  } as any;

  const paymentCycleRepository = {
    find: vi.fn(async () => state.paymentCycles.map((row) => ({ ...row }))),
  } as any;

  const paymentCycleLessonRepository = {
    find: vi.fn(async () => []),
    createQueryBuilder: vi.fn(() => paymentCycleLessonInsertBuilder),
    update: vi.fn(async () => ({ affected: 1 })),
  } as any;

  const deps = Array(34).fill(noop) as any[];
  deps[4] = lessonRepository;
  deps[6] = paymentCycleRepository;
  deps[14] = paymentCycleLessonRepository;

  const service = new EnrolmentScheduleService(...deps);

  return {
    service,
    state,
    mocks: {
      lessonRepository,
      paymentCycleRepository,
      paymentCycleLessonRepository,
      paymentCycleLessonInsertBuilder,
    },
  };
}

describe('EnrolmentScheduleService end-date due date preservation', () => {
  it('preserves the due date of restored lessons while assigning due dates to new lessons', async () => {
    const { service, state, mocks } = createDueDatePreservationService();
    const enrolment = { id: 44, courseId: 123 } as any;
    const restoredDueDates = new Map<number, string | null>([[30, '2026-05-20']]);

    await (service as any).linkLessonsToPaymentCycles(
      enrolment,
      [
        state.lessonsById.get(30),
        state.lessonsById.get(31),
      ],
      restoredDueDates,
    );

    expect(mocks.paymentCycleRepository.find).toHaveBeenCalledWith({
      where: {
        enrolmentId: enrolment.id,
        isDeleted: 0,
      },
      order: { startDate: 'ASC' },
    });
    expect(mocks.paymentCycleLessonRepository.createQueryBuilder).toHaveBeenCalled();
    expect(mocks.lessonRepository.update).toHaveBeenCalledWith(
      31,
      expect.objectContaining({
        dueDate: '2026-06-15',
      }),
    );
    expect(mocks.lessonRepository.update.mock.calls.find(([id]) => Number(id) === 30)).toBeUndefined();

    expect(state.lessonsById.get(30)?.dueDate).toEqual(new Date(Date.UTC(2026, 4, 20, 0, 0, 0)));
    expect(state.lessonsById.get(31)?.dueDate).toBe('2026-06-15');
  });
});

describe('EnrolmentScheduleService end-date shrink payment balance', () => {
  it('restores payment credit without binary drift when removing a paid lesson', async () => {
    const lesson = {
      id: 5275131,
      date: new Date('2026-09-30T15:30:00.000Z'),
      status: LessonStatusEnum.SCHEDULED,
    };
    const payment = {
      id: 1795156,
      amount: 312.83,
      isDeleted: 0,
      paymentMethodId: 4,
    };
    const lessonQuery = {
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getMany: vi.fn().mockResolvedValue([lesson]),
    };
    const invoiceLookup = {
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getCount: vi.fn().mockResolvedValue(0),
    };
    const paidBuilder = {
      leftJoin: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getRawOne: vi.fn().mockResolvedValue({ total: '33.9500' }),
    };
    const lessonUsedBuilder = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getRawOne: vi.fn().mockResolvedValue({ sum: '173.3800' }),
    };
    const invoiceUsedBuilder = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getRawOne: vi.fn().mockResolvedValue({ sum: '139.4400' }),
    };
    const lessonPaymentRepository = {
      createQueryBuilder: vi
        .fn()
        .mockReturnValueOnce(paidBuilder)
        .mockReturnValueOnce(lessonUsedBuilder),
      find: vi.fn().mockResolvedValue([
        {
          id: 1992441,
          lessonId: lesson.id,
          enrolmentId: 33855,
          paymentId: payment.id,
          amount: 33.95,
          isDeleted: 0,
          payment,
        },
      ]),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    };
    const paymentRepository = {
      findOne: vi.fn().mockResolvedValue(payment),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    };
    const service = Object.create(
      EnrolmentScheduleService.prototype,
    ) as EnrolmentScheduleService;
    Object.assign(service, {
      lessonRepository: {
        createQueryBuilder: vi.fn(() => lessonQuery),
        update: vi.fn().mockResolvedValue({ affected: 1 }),
      },
      invoiceItemLessonRepository: {
        createQueryBuilder: vi.fn(() => invoiceLookup),
      },
      privateLessonRepository: {
        findOne: vi.fn().mockResolvedValue({
          id: 13289,
          lessonId: lesson.id,
          total: 33.95,
          balance: 0,
        }),
        update: vi.fn().mockResolvedValue({ affected: 1 }),
      },
      lessonPaymentRepository,
      invoicePaymentRepository: {
        createQueryBuilder: vi.fn(() => invoiceUsedBuilder),
      },
      paymentRepository,
      courseRepository: {
        findOne: vi.fn().mockResolvedValue(null),
      },
    });

    await (
      service as unknown as {
        addCreditInvoice: (
          enrolment: { id: number; courseId: number },
          endDate: Date,
          userId: number,
        ) => Promise<void>;
      }
    ).addCreditInvoice(
      { id: 33855, courseId: 900 },
      new Date('2026-09-01T00:00:00.000Z'),
      694,
    );

    expect(paymentRepository.update).toHaveBeenCalledWith(
      { id: payment.id },
      { balance: 0.01, updatedByUserId: 694 },
    );
  });
});
