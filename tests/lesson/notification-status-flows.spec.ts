import { describe, expect, it, vi } from 'vitest';
import { EnrolmentAutoRenewalCronRepository } from '../../src/cron/repositories/enrolment-auto-renewal-cron.repository';
import { EnrolmentPaymentFrequencyRepository } from '../../src/enrolment/repositories/enrolment-payment-frequency.repository';
import { PrivateLesson } from '../../src/lesson/entities/private-lesson.entity';
import { PrivateLessonEmailStatus } from '../../src/lesson/entities/private-lesson-email-status.entity';
import { Lesson } from '../../src/lesson/entities/lesson.entity';
import { PrivateLessonBulkRescheduleRepository } from '../../src/lesson/repositories/private-lesson-actions/private-lesson-bulk-reschedule.repository';
import { TeacherSubstituteRepository } from '../../src/lesson/repositories/teacher-substitute.repository';
import { TeacherSubstituteService } from '../../src/lesson/services/teacher-substitute.service';
import { TeacherSubstituteGroupLessonHelper } from '../../src/lesson/repositories/helpers/teacher-substitute/teacher-substitute-group-lesson.helper';
import { GroupLessonEmailStatus } from '../../src/lesson/entities/group-lesson-email-status.entity';
import { Student } from '../../src/student/entities/student.entity';
import { LessonTeacherChangeService } from '../../src/lesson/services/lesson-teacher-change.service';
import { LessonTeacherChangeRepository } from '../../src/lesson/repositories/lesson-teacher-change.repository';

function statuses() {
  const rows: any[] = [];
  return {
    rows,
    find: vi.fn(async () => rows),
    insert: vi.fn(async (values: any[]) => {
      rows.push(...values);
    }),
  };
}

function expectPrivateStatuses(
  store: ReturnType<typeof statuses>,
  lessonId: number,
) {
  expect(store.rows).toEqual(
    [1, 2, 3, 4].map((notificationType) => ({
      lessonId,
      notificationType,
      status: 0,
    })),
  );
}

describe('SMW-1642 notification records through lesson flows', () => {
  it.each(['scheduled renewal', 'payment-frequency extension'])(
    '%s initializes reminders even when financial records exist',
    async (flow) => {
      const store = statuses();
      const manager = {
        getRepository: vi.fn((entity) => {
          if (entity === PrivateLessonEmailStatus) return store;
          if (entity === PrivateLesson)
            return { find: async () => [{ lessonId: 10 }] };
          if (entity === Lesson) return {};
          throw new Error(`Unexpected repository ${entity.name}`);
        }),
      };
      const instance = Object.create(
        flow === 'scheduled renewal'
          ? EnrolmentAutoRenewalCronRepository.prototype
          : EnrolmentPaymentFrequencyRepository.prototype,
      );
      const method =
        flow === 'scheduled renewal'
          ? 'createPrivateLessonsForLegacyAutoRenewal'
          : 'createPrivateLessonsForAutoRenewal';
      await instance[method]([{ id: 10 }], manager);
      await instance[method]([{ id: 10 }], manager);
      expectPrivateStatuses(store, 10);
      expect(store.insert).toHaveBeenCalledTimes(1);
    },
  );

  it('initializes reminders for a selected private lesson moved by bulk reschedule', async () => {
    const store = statuses();
    const chain: any = new Proxy(
      { getCount: async () => 0 },
      { get: (target, key) => target[key] ?? (() => chain) },
    );
    const lessonRepo = {
      createQueryBuilder: () => chain,
      create: (row: any) => row,
      save: async (row: any) => ({ ...row, id: row.id ?? 11 }),
    };
    const relatedRepo = {
      find: async () => [],
      create: (row: any) => row,
      save: vi.fn(),
    };
    const manager = {
      getRepository: (entity: any) =>
        entity === Lesson
          ? lessonRepo
          : entity === PrivateLessonEmailStatus
            ? store
            : relatedRepo,
    };
    const repository = new PrivateLessonBulkRescheduleRepository(
      lessonRepo as any,
    );
    vi.spyOn(repository as any, 'setExpiryForPrivateLesson').mockResolvedValue(
      undefined,
    );
    const result = await repository.rescheduleSingleLesson(
      {
        id: 10,
        date: new Date('2026-09-10T16:00:00Z'),
        teacherId: 7,
        duration: '00:30:00',
        course: { locationId: 20 },
      } as any,
      '2026-09-11',
      77,
      manager as any,
    );
    expect(result).toEqual({ wasRescheduled: true, newLessonId: 11 });
    expectPrivateStatuses(store, 11);
  });

  it('initializes private substitute reminders in the confirmation transaction', async () => {
    const store = statuses();
    const manager = {
      update: vi.fn(),
      getRepository: (entity: any) => {
        if (entity === PrivateLessonEmailStatus) return store;
        throw new Error(`Unexpected repository ${entity.name}`);
      },
    };
    const repository = Object.assign(
      Object.create(TeacherSubstituteRepository.prototype),
      {
        privateLessonHelper: {
          isPrivateLesson: async () => true,
          setExpiryForPrivateLesson: vi.fn(),
          handlePrivateLessonReschedule: vi.fn(),
          recalculatePrivateLessonAmounts: vi.fn(),
        },
        hierarchyHelper: { makeAsChild: vi.fn() },
        paymentHelper: { transferLessonPayments: vi.fn() },
        discountHelper: { copyDiscounts: vi.fn() },
      },
    );
    await repository.cancelAndReschedule(
      { id: 10, teacherId: 7 },
      { id: 11, teacherId: 7 },
      77,
      null,
      null,
      manager,
    );
    expectPrivateStatuses(store, 11);
    expect(manager.update).toHaveBeenCalledWith(
      Lesson,
      { id: 11 },
      expect.objectContaining({ isConfirmed: true }),
    );
  });

  it('initializes reminders through enrolment teacher-change confirmation', async () => {
    const store = statuses();
    const manager = {
      getRepository: (entity: any) =>
        entity === PrivateLessonEmailStatus ? store : {},
    };
    const oldLesson = { id: 10 };
    const newLesson = {
      id: 11,
      date: new Date('2026-09-11T16:00:00Z'),
      course: { program: { type: 1 } },
    };
    const repository: any = {
      findEnrolmentWithCourse: async () => ({ courseId: 20 }),
      findConfirmedLessonsForEnrolment: async () => [oldLesson],
      findDraftLessonsForEnrolment: async () => [newLesson],
      cancelLesson: vi.fn(),
      getLessonPaymentsTotal: async () => 0,
      findLessonDiscounts: async () => [],
      createRescheduleHierarchy: vi.fn(),
      findLessonWithCourseProgram: async () => newLesson,
      upsertPrivateLesson: vi.fn(),
      updatePaymentCycleLessons: vi.fn(),
      saveBulkRescheduleIfMissing: vi.fn(),
      updateCourseTeacherIfChanged: vi.fn(),
      confirmLesson: vi.fn(),
      findCourseById: async () => null,
    };
    // Exercise the real repository initializer, using the transaction passed by the service.
    const realRepository = Object.create(
      LessonTeacherChangeRepository.prototype,
    );
    repository.ensurePrivateLessonEmailStatuses =
      realRepository.ensurePrivateLessonEmailStatuses.bind(realRepository);
    const service = new LessonTeacherChangeService(repository);
    vi.spyOn(
      service as any,
      'calculatePrivateLessonFinancials',
    ).mockReturnValue({});
    await service.confirmEnrolmentTeacherChange(
      1,
      7,
      '2026-09-01',
      20,
      77,
      manager as any,
    );
    expectPrivateStatuses(store, 11);
    expect(repository.confirmLesson).toHaveBeenCalledWith(11, manager);
  });

  it('creates per-student reminders for regular group substitution (lesson.type=1)', async () => {
    const store = statuses();
    const chain: any = new Proxy(
      { getMany: async () => [{ id: 100 }, { id: 101 }] },
      { get: (target, key) => target[key] ?? (() => chain) },
    );
    const manager = {
      getRepository: (entity: any) => {
        if (entity === GroupLessonEmailStatus) return store;
        if (entity === Student) return { createQueryBuilder: () => chain };
        throw new Error(`Unexpected repository ${entity.name}`);
      },
    };
    const helper = Object.create(TeacherSubstituteGroupLessonHelper.prototype);
    const repository = {
      getLessonsByIds: async () => [{ id: 10 }],
      getLessonsWithRelations: async () => [
        {
          id: 11,
          courseId: 20,
          type: 1,
          isConfirmed: false,
          createdByUserId: 77,
          course: { program: { type: 2 } },
        },
      ],
      lessonRepository: {
        manager: { transaction: async (fn: any) => fn(manager) },
      },
      cancelAndReschedule: vi.fn(),
      createGroupLessonEmailStatuses:
        helper.createGroupLessonEmailStatuses.bind(helper),
    };
    const service = new TeacherSubstituteService(
      repository as any,
      {} as any,
      {} as any,
    );
    await service.confirmSubstitute(
      { ids: [10], newLessonIds: [11] } as any,
      77,
      'north-brampton',
    );
    expect(store.rows).toHaveLength(8);
    expect(store.rows.filter((row) => row.studentId === 100)).toHaveLength(4);
    expect(store.rows.filter((row) => row.studentId === 101)).toHaveLength(4);
    expect(
      store.rows.every((row) => row.lessonId === 11 && row.status === 0),
    ).toBe(true);
  });
});
