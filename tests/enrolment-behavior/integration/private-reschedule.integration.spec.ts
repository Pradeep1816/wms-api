import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';
import { Course } from '../../../src/course/entities/course.entity';
import { CourseSchedule } from '../../../src/course/entities/course-schedule.entity';
import { CustomerDiscount } from '../../../src/customer/entities/customer-discount.entity';
import { Enrolment } from '../../../src/enrolment/entities/enrolment.entity';
import { EnrolmentPaymentFrequency } from '../../../src/enrolment/entities/enrolment-payment-frequency.entity';
import { PaymentCycleLesson } from '../../../src/enrolment/entities/payment-cycle-lesson.entity';
import { EnrolmentPaymentFrequencyRepository } from '../../../src/enrolment/repositories/enrolment-payment-frequency.repository';
import { EnrolmentPaymentFrequencyService } from '../../../src/enrolment/services/enrolment-payment-frequency.service';
import { LessonHierarchy } from '../../../src/lesson/entities/lesson-hierarchy.entity';
import { Lesson } from '../../../src/lesson/entities/lesson.entity';
import { BulkRescheduleLesson } from '../../../src/lesson/entities/bulk-reschedule-lesson.entity';
import { PrivateLesson } from '../../../src/lesson/entities/private-lesson.entity';
import { LessonStatusEnum } from '../../../src/lesson/enums/lesson-status';
import { PrivateLessonDueRepository } from '../../../src/lesson/repositories/private-lesson-due.repository';
import { LessonEditScheduleRepository } from '../../../src/lesson/repositories/lesson-edit-schedule.repository';
import { LessonEditScheduleService } from '../../../src/lesson/services/lesson-edit-schedule.service';
import { Location } from '../../../src/location/entities/location.entity';
import { PaymentCycle } from '../../../src/payment/entities/payment-cycle.entity';
import { PaymentFrequency } from '../../../src/payment/entities/payment-frequency.entity';
import { Program } from '../../../src/program/entities/program.entity';
import { Qualification } from '../../../src/qualification/entities/qualification.entity';
import { Student } from '../../../src/student/entities/student.entity';
import type { CreateStudentEnrolmentDto } from '../../../src/student/dto/create-student-enrolment.dto';
import { UserLocation } from '../../../src/user/entities/user-location.entity';
import { UserProfile } from '../../../src/user/entities/user-profile.entity';
import { User } from '../../../src/user/entities/user.entity';
import {
  acquireControlledTestDbLock,
  createPrivateEnrolmentTestDataSource,
  lessonConfirmationServiceFor,
  permanentScheduleChangeConfirmationServiceFor,
  permanentScheduleChangeReviewServiceFor,
  releaseControlledTestDbLock,
  studentEnrolmentServiceFor,
  withRollback,
} from './fixtures/private-enrolment-test-data-source.js';

const DSN = process.env.TEST_DB_DSN;
const integrationEnabled = typeof DSN === 'string' && DSN.length > 0;

let dataSource: DataSource | null = null;
let dbLockPath: string | null = null;

beforeAll(async () => {
  if (!integrationEnabled) return;
  dbLockPath = await acquireControlledTestDbLock(DSN);
  try {
    dataSource = createPrivateEnrolmentTestDataSource(DSN);
    await dataSource.initialize();
  } catch (error) {
    await releaseControlledTestDbLock(dbLockPath);
    dbLockPath = null;
    throw error;
  }
}, 300_000);

afterAll(async () => {
  if (dataSource?.isInitialized) await dataSource.destroy();
  await releaseControlledTestDbLock(dbLockPath);
  dbLockPath = null;
}, 300_000);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe.skipIf(!integrationEnabled)(
  'private reschedule integration (controlled schema)',
  () => {
    it('reviews and confirms a private reschedule by canceling the old lessons and moving the May cycle links to replacements', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2026, 3, 10, 12, 0, 0)));

      await withRollback(dataSource!, async (manager) => {
        const fixture = await seedHappyPath(manager, {
          customerDiscountValue: undefined,
        });
        const createService = studentEnrolmentServiceFor(manager);
        const reviewService = permanentScheduleChangeReviewServiceFor(manager);
        const confirmService = lessonConfirmationServiceFor(manager);
        const pscConfirmService =
          permanentScheduleChangeConfirmationServiceFor(manager);

        const dto: CreateStudentEnrolmentDto = {
          programId: fixture.programId,
          programRate: 120,
          duration: '00:45',
          paymentFrequency: 'Monthly',
          paymentFrequencyDiscount: 0,
          multipleEnrolDiscount: 0,
          discountedRatePerMonth: 400,
          lessonsCount: 6,
          autoRenew: false,
          startDate: '2026-04-07',
          paymentCycleEffectiveDate: '2026-05-01',
          isOnline: false,
          teacherId: fixture.teacherId,
          day: 'Tuesday',
          startTime: '15:00',
        };

        await createService.createEnrolment(
          fixture.locationId,
          fixture.locationSlug,
          fixture.studentId,
          dto,
          fixture.adminUserId,
        );

        const enrolment = await manager
          .getRepository(Enrolment)
          .findOneByOrFail({
            studentId: fixture.studentId,
          });

        await confirmService.confirmLessonsForCourse(
          enrolment.courseId,
          fixture.locationId,
          fixture.adminUserId,
        );

        const originalLessons = await manager.getRepository(Lesson).find({
          where: { courseId: enrolment.courseId },
          order: { date: 'ASC' },
        });
        expect(originalLessons.map((lesson) => dateOnly(lesson.date))).toEqual([
          '2026-04-07',
          '2026-04-14',
          '2026-04-21',
          '2026-04-28',
          '2026-05-05',
          '2026-05-12',
        ]);

        const oldMayLessons = originalLessons.filter(
          (lesson) => dateOnly(lesson.date) >= '2026-05-01',
        );
        expect(oldMayLessons).toHaveLength(2);

        const replacementLessons = await manager
          .getRepository(Lesson)
          .save([
            buildDraftReplacementLesson(
              enrolment.courseId,
              fixture.teacherId,
              fixture.adminUserId,
              '2026-05-06T15:00:00.000Z',
            ),
            buildDraftReplacementLesson(
              enrolment.courseId,
              fixture.teacherId,
              fixture.adminUserId,
              '2026-05-13T15:00:00.000Z',
            ),
          ]);

        const review = await reviewService.getReview(
          enrolment.courseId,
          fixture.locationId,
          false,
          new Date(Date.UTC(2026, 4, 1, 0, 0, 0)),
          new Date(Date.UTC(2026, 4, 13, 23, 59, 59, 999)),
        );

        expect(review.summary).toEqual({
          holidayConflicted: 0,
          conflicted: 0,
          unscheduled: 0,
          scheduled: 2,
          total: 2,
        });
        expect(review.startDate.toISOString()).toBe('2026-05-01T00:00:00.000Z');
        expect(review.endDate.toISOString()).toBe('2026-05-13T23:59:59.999Z');
        expect(review.lessons.map((lesson) => lesson.id)).toEqual(
          replacementLessons.map((lesson) => lesson.id),
        );

        const returnedEnrolmentId = await pscConfirmService.confirm({
          courseId: enrolment.courseId,
          enrolmentId: enrolment.id,
          locationId: fixture.locationId,
          locationSlug: fixture.locationSlug,
          loggedUserId: fixture.adminUserId,
          rescheduleBeginDate: '01-05-2026',
          rescheduleEndDate: '13-05-2026',
        });

        expect(returnedEnrolmentId).toBe(enrolment.id);

        const refreshedCourse = await manager
          .getRepository(Course)
          .findOneByOrFail({ id: enrolment.courseId });
        expect(dateOnly(refreshedCourse.startDate)).toBe('2026-04-07');
        expect(dateOnly(refreshedCourse.endDate)).toBe('2026-05-13');

        const refreshedEnrolment = await manager
          .getRepository(Enrolment)
          .findOneByOrFail({ id: enrolment.id });
        expect(refreshedEnrolment.isConfirmed).toBe(1);
        expect(Boolean(refreshedEnrolment.isEnableInfo)).toBe(true);
        expect(Boolean(refreshedEnrolment.isEnableRescheduleInfo)).toBe(true);
        expect(dateOnly(refreshedEnrolment.endDateTime)).toBe('2026-05-13');

        const lessonsAfterReschedule = await manager
          .getRepository(Lesson)
          .find({
            where: { courseId: enrolment.courseId },
            order: { date: 'ASC' },
          });

        const refreshedOldMayLessons = lessonsAfterReschedule.filter((lesson) =>
          oldMayLessons.some((oldLesson) => oldLesson.id === lesson.id),
        );
        expect(refreshedOldMayLessons.map((lesson) => lesson.status)).toEqual([
          LessonStatusEnum.CANCELED,
          LessonStatusEnum.CANCELED,
        ]);

        const confirmedReplacementLessons = lessonsAfterReschedule.filter(
          (lesson) =>
            replacementLessons.some(
              (replacement) => replacement.id === lesson.id,
            ),
        );
        expect(confirmedReplacementLessons).toHaveLength(2);
        expect(
          confirmedReplacementLessons.every((lesson) => lesson.isConfirmed),
        ).toBe(true);
        expect(
          confirmedReplacementLessons.every(
            (lesson) => lesson.status === LessonStatusEnum.SCHEDULED,
          ),
        ).toBe(true);
        expect(
          confirmedReplacementLessons.map((lesson) => ({
            date: dateOnly(lesson.date),
            dueDate: dateOnly(lesson.dueDate),
          })),
        ).toEqual([
          { date: '2026-05-06', dueDate: '2026-04-15' },
          { date: '2026-05-13', dueDate: '2026-04-15' },
        ]);

        const privateLessons = await manager.getRepository(PrivateLesson).find({
          where: confirmedReplacementLessons.map((lesson) => ({
            lessonId: lesson.id,
          })),
          order: { lessonId: 'ASC' },
        });
        expect(privateLessons).toHaveLength(2);
        const oldMayPrivateLessons = await manager
          .getRepository(PrivateLesson)
          .find({
            where: oldMayLessons.map((lesson) => ({ lessonId: lesson.id })),
            order: { lessonId: 'ASC' },
          });
        expect(oldMayPrivateLessons).toHaveLength(2);
        expect(
          privateLessons.map((privateLesson) =>
            dateOnly(privateLesson.expiryDate),
          ),
        ).toEqual(
          oldMayPrivateLessons.map((privateLesson) =>
            dateOnly(privateLesson.expiryDate),
          ),
        );
        expect(
          privateLessons.map((privateLesson) =>
            dateOnly(privateLesson.dueDate),
          ),
        ).toEqual(['2026-04-15', '2026-04-15']);

        const bulkRescheduleLessons = await manager
          .getRepository(BulkRescheduleLesson)
          .find({
            order: { lessonId: 'ASC' },
          });
        expect(bulkRescheduleLessons.map((item) => item.lessonId)).toEqual(
          confirmedReplacementLessons.map((lesson) => lesson.id),
        );

        const hierarchyRows = await manager
          .getRepository(LessonHierarchy)
          .find({
            where: confirmedReplacementLessons.flatMap((lesson) => [
              { lessonId: lesson.id, childLessonId: lesson.id },
              { childLessonId: lesson.id },
            ]),
          });
        expect(
          hierarchyRows
            .map((row) => ({
              lessonId: row.lessonId,
              childLessonId: row.childLessonId,
              depth: row.depth,
            }))
            .sort(
              (a, b) =>
                a.childLessonId - b.childLessonId || a.lessonId - b.lessonId,
            ),
        ).toEqual([
          {
            lessonId: oldMayLessons[0].id,
            childLessonId: confirmedReplacementLessons[0].id,
            depth: 1,
          },
          {
            lessonId: confirmedReplacementLessons[0].id,
            childLessonId: confirmedReplacementLessons[0].id,
            depth: 0,
          },
          {
            lessonId: oldMayLessons[1].id,
            childLessonId: confirmedReplacementLessons[1].id,
            depth: 1,
          },
          {
            lessonId: confirmedReplacementLessons[1].id,
            childLessonId: confirmedReplacementLessons[1].id,
            depth: 0,
          },
        ]);

        const cycles = await manager.getRepository(PaymentCycle).find({
          where: { enrolmentId: enrolment.id },
          order: { startDate: 'ASC' },
        });
        expect(
          cycles.map((cycle) => ({
            startDate: dateOnly(cycle.startDate),
            endDate: dateOnly(cycle.endDate),
          })),
        ).toEqual([
          { startDate: '2026-04-01', endDate: '2026-04-30' },
          { startDate: '2026-05-01', endDate: '2026-05-31' },
        ]);

        const mayCycleLinks = await manager
          .getRepository(PaymentCycleLesson)
          .find({
            where: { paymentCycleId: cycles[1].id },
            order: { lessonId: 'ASC' },
          });
        expect(mayCycleLinks.map((link) => link.lessonId)).toEqual(
          confirmedReplacementLessons.map((lesson) => lesson.id),
        );
        expect(mayCycleLinks.every((link) => link.isDeleted === 0)).toBe(true);

        const courseSchedules = await manager
          .getRepository(CourseSchedule)
          .find({
            where: { courseId: enrolment.courseId },
            order: { id: 'ASC' },
          });
        expect(courseSchedules).toHaveLength(2);
        expect(
          courseSchedules.map((schedule) => ({
            startDate: dateOnly(schedule.startDate),
            endDate: dateOnly(schedule.endDate),
            isRecent: Boolean(schedule.isRecent),
          })),
        ).toEqual([
          { startDate: '2026-04-07', endDate: '2026-04-30', isRecent: false },
          { startDate: '2026-05-01', endDate: '2026-05-13', isRecent: true },
        ]);

        expect(
          await manager.getRepository(EnrolmentPaymentFrequency).count(),
        ).toBe(1);
      });
    }, 120_000);

    it('keeps a cross-month reschedule in its original billing cycle after a frequency reset', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2026, 3, 10, 12, 0, 0)));

      await withRollback(dataSource!, async (manager) => {
        const fixture = await seedHappyPath(manager);
        const createService = studentEnrolmentServiceFor(manager);
        const confirmService = lessonConfirmationServiceFor(manager);

        const dto: CreateStudentEnrolmentDto = {
          programId: fixture.programId,
          programRate: 120,
          duration: '00:45',
          paymentFrequency: 'Monthly',
          paymentFrequencyDiscount: 0,
          multipleEnrolDiscount: 0,
          discountedRatePerMonth: 400,
          lessonsCount: 6,
          autoRenew: false,
          startDate: '2026-04-07',
          paymentCycleEffectiveDate: '2026-04-01',
          isOnline: false,
          teacherId: fixture.teacherId,
          day: 'Tuesday',
          startTime: '15:00',
        };

        await createService.createEnrolment(
          fixture.locationId,
          fixture.locationSlug,
          fixture.studentId,
          dto,
          fixture.adminUserId,
        );

        const enrolment = await manager.getRepository(Enrolment).findOneByOrFail({
          studentId: fixture.studentId,
        });
        await confirmService.confirmLessonsForCourse(
          enrolment.courseId,
          fixture.locationId,
          fixture.adminUserId,
        );

        const lessons = await manager.getRepository(Lesson).find({
          where: { courseId: enrolment.courseId },
          order: { date: 'ASC' },
        });
        const movedLesson = lessons.find(
          (lesson) => dateOnly(lesson.date) === '2026-04-28',
        );
        expect(movedLesson).toBeTruthy();

        const editService = lessonEditScheduleServiceFor(manager);
        const editResult = await editService.editSchedule(
          fixture.locationSlug,
          fixture.locationId,
          movedLesson!.id,
          { date: '2026-05-07 3:00 PM' },
          fixture.adminUserId,
        );

        const fixtureCycles = await manager.getRepository(PaymentCycle).find({
          where: { enrolmentId: enrolment.id },
        });
        const fixtureCycleIds = fixtureCycles.map((cycle) => cycle.id);
        if (fixtureCycleIds.length > 0) {
          // Keep cleanup scoped to this fixture. The controlled schema does not
          // model the unrelated pro-forma tables used by production cleanup.
          await manager
            .getRepository(PaymentCycleLesson)
            .createQueryBuilder()
            .delete()
            .where('paymentCycleId IN (:...fixtureCycleIds)', {
              fixtureCycleIds,
            })
            .execute();
          await manager.getRepository(PaymentCycle).delete({
            enrolmentId: enrolment.id,
          });
        }

        const paymentFrequencyRepository = Object.assign(
          Object.create(EnrolmentPaymentFrequencyRepository.prototype),
          {
            paymentFrequencyRepository:
              manager.getRepository(PaymentFrequency),
          },
        ) as EnrolmentPaymentFrequencyRepository;
        const paymentFrequencyService = new EnrolmentPaymentFrequencyService(
          paymentFrequencyRepository,
          transactionDataSourceFor(manager),
          {} as never,
          { applyForEnrolment: async () => undefined } as never,
          { recalculateAndPersist: async () => undefined } as never,
        );

        await paymentFrequencyService.changePaymentFrequency(
          fixture.locationId,
          enrolment.id,
          { paymentFrequencyId: 2, effectiveDate: 'Apr 01, 2026' },
          fixture.adminUserId,
        );

        const cycles = await manager.getRepository(PaymentCycle).find({
          where: { enrolmentId: enrolment.id, isDeleted: 0 },
          order: { startDate: 'ASC' },
        });
        expect(
          cycles.map((cycle) => ({
            startDate: dateOnly(cycle.startDate),
            endDate: dateOnly(cycle.endDate),
          })),
        ).toEqual([
          { startDate: '2026-04-01', endDate: '2026-04-30' },
          { startDate: '2026-05-01', endDate: '2026-05-31' },
        ]);

        const movedLessonLink = await manager
          .getRepository(PaymentCycleLesson)
          .findOneByOrFail({ lessonId: editResult.lessonId, isDeleted: 0 });
        expect(movedLessonLink.paymentCycleId).toBe(cycles[0].id);

        const refreshedMovedLesson = await manager
          .getRepository(Lesson)
          .findOneByOrFail({ id: editResult.lessonId });
        expect(dateOnly(refreshedMovedLesson.originalDate)).toBe('2026-04-28');
        expect(dateOnly(refreshedMovedLesson.date)).toBe('2026-05-07');
        expect(dateOnly(refreshedMovedLesson.dueDate)).toBe('2026-03-15');

        const receivePaymentRepository = new PrivateLessonDueRepository(
          manager.getRepository(PrivateLesson),
          manager.getRepository(Lesson),
        );
        const aprilDueWindow =
          await receivePaymentRepository.getPrivateLessonDuesByCustomerId(
            fixture.customerId,
            fixture.locationId,
            1,
            20,
            '2026-04-15',
            '2026-04-15',
          );
        expect(
          aprilDueWindow.privateLessonDues.map((lesson) => lesson.id),
        ).not.toContain(editResult.lessonId);

        const marchDueWindow =
          await receivePaymentRepository.getPrivateLessonDuesByCustomerId(
            fixture.customerId,
            fixture.locationId,
            1,
            20,
            '2026-03-15',
            '2026-03-15',
          );
        expect(
          marchDueWindow.privateLessonDues.map((lesson) => lesson.id),
        ).toContain(editResult.lessonId);
      });
    }, 120_000);
  },
);

describe.skipIf(integrationEnabled)(
  'private reschedule integration (disabled)',
  () => {
    it('SKIPS: set TEST_DB_DSN to enable transaction-wrapped reschedule graph tests', () => {
      expect(process.env.TEST_DB_DSN).toBeUndefined();
    });
  },
);

function buildDraftReplacementLesson(
  courseId: number,
  teacherId: number,
  adminUserId: number,
  isoDate: string,
): any {
  return {
    courseId,
    teacherId,
    classroomId: null,
    colorCode: null,
    date: new Date(isoDate),
    duration: '00:45:00',
    status: LessonStatusEnum.SCHEDULED,
    isPresent: true,
    isDeleted: false,
    isConfirmed: false,
    type: 1,
    isExploded: 0,
    isOnline: false,
    createdByUserId: adminUserId,
    updatedByUserId: adminUserId,
    createdOn: new Date(Date.UTC(2026, 3, 10, 12, 0, 0)),
    updatedOn: new Date(Date.UTC(2026, 3, 10, 12, 0, 0)),
    programRate: 120,
    teacherRate: 45,
    teacherRateOld: 45,
    tax: 0,
    paidStatus: 0,
    total: 100,
    dueDate: new Date(isoDate),
    originalDate: new Date(isoDate),
  };
}

function lessonEditScheduleServiceFor(
  manager: EntityManager,
): LessonEditScheduleService {
  return new LessonEditScheduleService(
    {} as never,
    new LessonEditScheduleRepository(),
    { handlePrivateLessonReschedule: async () => undefined } as never,
    { validateTeacherOverlap: async () => undefined } as never,
    { validateStudentOverlap: async () => undefined } as never,
    { validateTeacherEligibility: async () => undefined } as never,
    { recalculateAndPersist: async () => undefined } as never,
    queryRunnerDataSourceFor(manager),
  );
}

function queryRunnerDataSourceFor(manager: EntityManager): DataSource {
  return {
    createQueryRunner: () => ({
      manager,
      isTransactionActive: true,
      connect: async () => undefined,
      startTransaction: async () => undefined,
      commitTransaction: async () => undefined,
      rollbackTransaction: async () => undefined,
      release: async () => undefined,
    }),
  } as unknown as DataSource;
}

function transactionDataSourceFor(manager: EntityManager): DataSource {
  return {
    transaction: async <T>(operation: (manager: EntityManager) => Promise<T>) =>
      operation(manager),
  } as unknown as DataSource;
}

async function seedHappyPath(
  manager: EntityManager,
  options?: { customerDiscountValue?: number },
): Promise<{
  adminUserId: number;
  customerId: number;
  locationId: number;
  locationSlug: string;
  programId: number;
  studentId: number;
  teacherId: number;
}> {
  const locationId = 3;
  const customerId = 501;
  const teacherId = 601;
  const studentId = 801;
  const programId = 901;
  const adminUserId = 999;
  const now = new Date(Date.UTC(2026, 3, 1, 12, 0, 0));

  await manager.getRepository(Location).save({
    id: locationId,
    name: 'Toronto',
    address: '1 Test Street',
    phoneNumber: '555-0100',
    email: 'toronto@example.test',
    cityId: 1,
    provinceId: 1,
    postalCode: 'A1A1A1',
    countryId: 1,
    slug: 'toronto',
    isDeleted: false,
    createdByUserId: adminUserId,
    updatedByUserId: adminUserId,
    isEnabledCron: false,
  });

  await manager.getRepository(User).save([
    {
      id: customerId,
      username: 'customer-501',
      auth_key: 'customer-auth',
      access_token: 'customer-token',
      status: User.STATUS_NOT_ACTIVE,
      canLogin: true,
      canMerge: false,
      isDeleted: false,
    },
    {
      id: teacherId,
      username: 'teacher-601',
      auth_key: 'teacher-auth',
      access_token: 'teacher-token',
      status: User.STATUS_ACTIVE,
      canLogin: true,
      canMerge: false,
      isDeleted: false,
    },
  ]);

  await manager.getRepository(UserProfile).save([
    {
      userId: customerId,
      firstname: 'Cora',
      lastname: 'Customer',
    },
    {
      userId: teacherId,
      firstname: 'Taylor',
      lastname: 'Teacher',
    },
  ]);

  await manager.getRepository(UserLocation).save([
    {
      userId: customerId,
      locationId,
    },
    {
      userId: teacherId,
      locationId,
    },
  ]);

  await manager.getRepository(Student).save({
    id: studentId,
    firstName: 'Mila',
    lastName: 'Student',
    customerId,
    status: 2,
    isDeleted: 0,
    gender: 'female',
    createdOn: now,
    updatedOn: now,
    createdByUserId: adminUserId,
    updatedByUserId: adminUserId,
  });

  await manager.getRepository(Program).save({
    id: programId,
    name: 'Private Piano',
    rate: 120,
    status: Program.STATUS_ACTIVE,
    type: Program.TYPE_PRIVATE_PROGRAM,
    isDeleted: false,
    createdByUserId: adminUserId,
    updatedByUserId: adminUserId,
  });

  await manager.getRepository(PaymentFrequency).save({
    id: 2,
    name: 'Monthly',
    frequencyLength: 1,
  });

  await manager.getRepository(Qualification).save({
    teacherId,
    programId,
    rate: 45,
    type: 1,
    isDeleted: false,
    createdOn: now,
    updatedOn: now,
    createdByUserId: adminUserId,
    updatedByUserId: adminUserId,
  });

  if (options?.customerDiscountValue !== undefined) {
    await manager.getRepository(CustomerDiscount).save({
      customerId,
      value: options.customerDiscountValue,
      isDeleted: false,
    });
  }

  return {
    adminUserId,
    customerId,
    locationId,
    locationSlug: 'toronto',
    programId,
    studentId,
    teacherId,
  };
}

function dateOnly(value: Date | string | null): string {
  return new Date(value as Date | string).toISOString().slice(0, 10);
}
