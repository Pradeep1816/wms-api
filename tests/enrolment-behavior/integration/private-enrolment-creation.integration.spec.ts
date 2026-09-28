/**
 * Integration: private enrolment draft -> review -> confirmation
 *
 * Activation:
 *   TEST_DB_ALLOW_SYNC=1 \
 *   TEST_DB_DSN=mysql://user:pass@host:port/smw_api_test \
 *     yarn vitest run tests/enrolment-behavior/integration/private-enrolment-creation.integration.spec.ts --config vitest.config.mts
 *
 * Safety:
 *   - refuses protected database names such as smw_full;
 *   - synchronizes only the small enrolment-behavior fixture schema;
 *   - seeds every case inside a transaction and rolls back after assertions.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';
import { Course } from '../../../src/course/entities/course.entity';
import { CourseSchedule } from '../../../src/course/entities/course-schedule.entity';
import { closeCourseScheduleHistory } from '../../../src/course/course-schedule-history';
import { CustomerDiscount } from '../../../src/customer/entities/customer-discount.entity';
import { Enrolment } from '../../../src/enrolment/entities/enrolment.entity';
import { EnrolmentDiscount } from '../../../src/enrolment/entities/enrolment-discount.entity';
import { EnrolmentPaymentFrequency } from '../../../src/enrolment/entities/enrolment-payment-frequency.entity';
import { PaymentCycleLesson } from '../../../src/enrolment/entities/payment-cycle-lesson.entity';
import { LessonDiscount } from '../../../src/lesson/entities/lesson-discount.entity';
import { LessonHierarchy } from '../../../src/lesson/entities/lesson-hierarchy.entity';
import { Lesson } from '../../../src/lesson/entities/lesson.entity';
import { PrivateLessonEmailStatus } from '../../../src/lesson/entities/private-lesson-email-status.entity';
import { PrivateLesson } from '../../../src/lesson/entities/private-lesson.entity';
import { LessonStatusEnum } from '../../../src/lesson/enums/lesson-status';
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
  lessonReviewServiceFor,
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
  'private enrolment creation integration (controlled schema)',
  () => {
    it('creates, reviews, and confirms a private monthly enrolment through the real services', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2026, 3, 10, 12, 0, 0)));

      await withRollback(dataSource!, async (manager) => {
        const fixture = await seedHappyPath(manager);
        const createService = studentEnrolmentServiceFor(manager);
        const reviewService = lessonReviewServiceFor(manager);
        const confirmService = lessonConfirmationServiceFor(manager);

        const dto: CreateStudentEnrolmentDto = {
          programId: fixture.programId,
          programRate: 120,
          duration: '00:45',
          paymentFrequency: 'Monthly',
          paymentFrequencyDiscount: 10,
          multipleEnrolDiscount: 20,
          discountedRatePerMonth: 400,
          lessonsCount: 4,
          autoRenew: false,
          startDate: '2026-04-07',
          paymentCycleEffectiveDate: '2026-04-01',
          isOnline: false,
          teacherId: fixture.teacherId,
          day: 'Tuesday',
          startTime: '15:00',
        };

        const created = await createService.createEnrolment(
          fixture.locationId,
          fixture.locationSlug,
          fixture.studentId,
          dto,
          fixture.adminUserId,
        );

        expect(created).toMatchObject({
          courseId: expect.any(Number),
          programName: 'Private Piano',
          teacherName: 'Taylor Teacher',
          day: 'Tuesday',
        });

        const enrolment = await manager.getRepository(Enrolment).findOne({
          where: { studentId: fixture.studentId },
        });
        expect(enrolment).toBeTruthy();

        const review = await reviewService.getLessonReview(enrolment!.courseId, fixture.locationId);
        expect(review.summary).toEqual({
          holidayConflicted: 0,
          conflicted: 0,
          unscheduled: 0,
          scheduled: 4,
          total: 4,
        });
        expect(review.teacherName).toBe('Taylor Teacher');
        expect(review.studentName).toBe('Mila Student');

        const returnedEnrolmentId = await confirmService.confirmLessonsForCourse(
          enrolment!.courseId,
          fixture.locationId,
          fixture.adminUserId,
        );

        expect(returnedEnrolmentId).toBe(enrolment!.id);

        const course = await manager.getRepository(Course).findOneByOrFail({ id: enrolment!.courseId });
        expect(course.isConfirmed).toBe(1);

        const confirmedEnrolment = await manager.getRepository(Enrolment).findOneByOrFail({ id: enrolment!.id });
        expect(confirmedEnrolment.isConfirmed).toBe(1);
        expect(Boolean(confirmedEnrolment.isEnableInfo)).toBe(true);
        expect(dateOnly(confirmedEnrolment.endDateTime)).toBe('2026-04-28');

        const student = await manager.getRepository(Student).findOneByOrFail({ id: fixture.studentId });
        const customer = await manager.getRepository(User).findOneByOrFail({ id: fixture.customerId });
        expect(student.status).toBe(1);
        expect(customer.status).toBe(2);

        const lessons = await manager.getRepository(Lesson).find({
          where: { courseId: enrolment!.courseId },
          order: { date: 'ASC' },
        });
        expect(lessons).toHaveLength(4);
        expect(lessons.map((lesson) => dateOnly(lesson.date))).toEqual([
          '2026-04-07',
          '2026-04-14',
          '2026-04-21',
          '2026-04-28',
        ]);
        expect(lessons.every((lesson) => lesson.isConfirmed)).toBe(true);
        expect(lessons.every((lesson) => lesson.status === LessonStatusEnum.SCHEDULED)).toBe(true);
        expect(lessons.every((lesson) => dateOnly(lesson.dueDate) === '2026-03-15')).toBe(true);
        expect(lessons.every((lesson) => Number(lesson.teacherRate) === 45)).toBe(true);
        expect(lessons.every((lesson) => Number(lesson.total) === 100)).toBe(true);

        expect(await manager.getRepository(EnrolmentPaymentFrequency).count()).toBe(1);

        const enrolmentDiscounts = await manager.getRepository(EnrolmentDiscount).find({
          where: { enrolmentId: enrolment!.id },
          order: { type: 'ASC' },
        });
        expect(
          enrolmentDiscounts.map((discount) => ({
            type: discount.type,
            discount: Number(discount.discount),
            discountType: discount.discountType,
          })),
        ).toEqual([
          { type: EnrolmentDiscount.TYPE_PAYMENT_FREQUENCY, discount: 10, discountType: EnrolmentDiscount.VALUE_TYPE_PERCENTAGE },
          { type: EnrolmentDiscount.TYPE_MULTIPLE_ENROLMENT, discount: 20, discountType: EnrolmentDiscount.VALUE_TYPE_DOLLAR },
        ]);

        expect(await manager.getRepository(PrivateLesson).count()).toBe(4);
        expect(await manager.getRepository(PrivateLessonEmailStatus).count()).toBe(16);
        expect(await manager.getRepository(LessonHierarchy).count()).toBe(4);

        const lessonDiscounts = await manager.getRepository(LessonDiscount).find({
          where: lessons.map((lesson) => ({ lessonId: lesson.id })),
        });
        expect(lessonDiscounts).toHaveLength(12);
        expect(
          summarizeLessonDiscounts(lessonDiscounts).sort((a, b) => a.lessonId - b.lessonId || a.type - b.type),
        ).toEqual(
          lessons.flatMap((lesson) => [
            { lessonId: lesson.id, type: 1, valueType: 1, value: 7.5 },
            { lessonId: lesson.id, type: 2, valueType: 1, value: 10 },
            // Lesson discounts use 0 for dollars (the enrolment enum is separate).
            { lessonId: lesson.id, type: LessonDiscount.TYPE_MULTIPLE_ENROLMENT, valueType: 0, value: 5 },
          ]),
        );

        const paymentCycles = await manager.getRepository(PaymentCycle).find({
          where: { enrolmentId: enrolment!.id },
          order: { startDate: 'ASC' },
        });
        expect(paymentCycles).toHaveLength(1);
        expect(paymentCycles.map((cycle) => ({
          startDate: dateOnly(cycle.startDate),
          endDate: dateOnly(cycle.endDate),
        }))).toEqual([{ startDate: '2026-04-01', endDate: '2026-04-30' }]);

        const cycleLinks = await manager.getRepository(PaymentCycleLesson).find({
          where: { paymentCycleId: paymentCycles[0].id },
          order: { lessonId: 'ASC' },
        });
        expect(cycleLinks).toHaveLength(4);
        expect(cycleLinks.every((link) => link.isDeleted === 0)).toBe(true);
        expect(cycleLinks.map((link) => link.lessonId)).toEqual(lessons.map((lesson) => lesson.id).sort((a, b) => a - b));

        const scheduleRepo = manager.getRepository(CourseSchedule);
        const schedule = await scheduleRepo.findOneByOrFail({ courseId: enrolment!.courseId });
        await scheduleRepo.save({ ...schedule, endDate: new Date('2026-04-30T00:00:00Z') });
        await scheduleRepo.save({ ...schedule, id: undefined,
          startDate: new Date('2026-05-01T00:00:00Z'), endDate: new Date('2026-05-31T00:00:00Z') });
        await scheduleRepo.save({ ...schedule, id: undefined,
          startDate: new Date('2026-06-01T00:00:00Z'), endDate: new Date('2026-06-30T00:00:00Z') });
        // A change inside May retains April, closes May, and supersedes June.
        await closeCourseScheduleHistory(scheduleRepo, enrolment!.courseId, new Date('2026-05-15T00:00:00Z'));
        const history = await scheduleRepo.find({ where: { courseId: enrolment!.courseId }, order: { startDate: 'ASC' } });
        expect(history.map((row) => [dateOnly(row.startDate), dateOnly(row.endDate)])).toEqual([
          [dateOnly(schedule.startDate), '2026-04-30'], ['2026-05-01', '2026-05-14'],
        ]);
        // Changes on or before a period's start never leave a reversed interval.
        await closeCourseScheduleHistory(scheduleRepo, enrolment!.courseId, new Date('2026-05-01T00:00:00Z'));
        expect(await scheduleRepo.countBy({ courseId: enrolment!.courseId })).toBe(1);
        await closeCourseScheduleHistory(scheduleRepo, enrolment!.courseId, new Date('2026-04-01T00:00:00Z'));
        expect(await scheduleRepo.countBy({ courseId: enrolment!.courseId })).toBe(0);
      });
    }, 120_000);

    it('creates an initial partial cycle before the regular monthly cycle when payment-cycle effective date starts next month', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2026, 3, 10, 12, 0, 0)));

      await withRollback(dataSource!, async (manager) => {
        const fixture = await seedHappyPath(manager, { customerDiscountValue: undefined });
        const createService = studentEnrolmentServiceFor(manager);
        const reviewService = lessonReviewServiceFor(manager);
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
          paymentCycleEffectiveDate: '2026-05-01',
          isOnline: false,
          teacherId: fixture.teacherId,
          day: 'Tuesday',
          startTime: '15:00',
        };

        const created = await createService.createEnrolment(
          fixture.locationId,
          fixture.locationSlug,
          fixture.studentId,
          dto,
          fixture.adminUserId,
        );

        expect(created).toMatchObject({
          courseId: expect.any(Number),
          programName: 'Private Piano',
          teacherName: 'Taylor Teacher',
          day: 'Tuesday',
        });

        const enrolment = await manager.getRepository(Enrolment).findOne({
          where: { studentId: fixture.studentId },
        });
        expect(enrolment).toBeTruthy();

        const review = await reviewService.getLessonReview(enrolment!.courseId, fixture.locationId);
        expect(review.summary).toEqual({
          holidayConflicted: 0,
          conflicted: 0,
          unscheduled: 0,
          scheduled: 6,
          total: 6,
        });

        const returnedEnrolmentId = await confirmService.confirmLessonsForCourse(
          enrolment!.courseId,
          fixture.locationId,
          fixture.adminUserId,
        );

        expect(returnedEnrolmentId).toBe(enrolment!.id);

        const confirmedEnrolment = await manager.getRepository(Enrolment).findOneByOrFail({ id: enrolment!.id });
        expect(confirmedEnrolment.isConfirmed).toBe(1);
        expect(dateOnly(confirmedEnrolment.endDateTime)).toBe('2026-05-12');

        const lessons = await manager.getRepository(Lesson).find({
          where: { courseId: enrolment!.courseId },
          order: { date: 'ASC' },
        });
        expect(lessons).toHaveLength(6);
        expect(lessons.map((lesson) => dateOnly(lesson.date))).toEqual([
          '2026-04-07',
          '2026-04-14',
          '2026-04-21',
          '2026-04-28',
          '2026-05-05',
          '2026-05-12',
        ]);
        expect(lessons.map((lesson) => ({
          date: dateOnly(lesson.date),
          dueDate: dateOnly(lesson.dueDate),
        }))).toEqual([
          { date: '2026-04-07', dueDate: '2026-03-15' },
          { date: '2026-04-14', dueDate: '2026-03-15' },
          { date: '2026-04-21', dueDate: '2026-03-15' },
          { date: '2026-04-28', dueDate: '2026-03-15' },
          { date: '2026-05-05', dueDate: '2026-04-15' },
          { date: '2026-05-12', dueDate: '2026-04-15' },
        ]);

        expect(await manager.getRepository(EnrolmentDiscount).count()).toBe(0);
        expect(await manager.getRepository(LessonDiscount).count()).toBe(0);

        const paymentCycles = await manager.getRepository(PaymentCycle).find({
          where: { enrolmentId: enrolment!.id },
          order: { startDate: 'ASC' },
        });
        expect(paymentCycles.map((cycle) => ({
          startDate: dateOnly(cycle.startDate),
          endDate: dateOnly(cycle.endDate),
        }))).toEqual([
          { startDate: '2026-04-01', endDate: '2026-04-30' },
          { startDate: '2026-05-01', endDate: '2026-05-31' },
        ]);

        const firstCycleLinks = await manager.getRepository(PaymentCycleLesson).find({
          where: { paymentCycleId: paymentCycles[0].id },
          order: { lessonId: 'ASC' },
        });
        const secondCycleLinks = await manager.getRepository(PaymentCycleLesson).find({
          where: { paymentCycleId: paymentCycles[1].id },
          order: { lessonId: 'ASC' },
        });

        expect(firstCycleLinks).toHaveLength(4);
        expect(secondCycleLinks).toHaveLength(2);
        expect(firstCycleLinks.every((link) => link.isDeleted === 0)).toBe(true);
        expect(secondCycleLinks.every((link) => link.isDeleted === 0)).toBe(true);
        expect(firstCycleLinks.map((link) => link.lessonId)).toEqual(lessons.slice(0, 4).map((lesson) => lesson.id));
        expect(secondCycleLinks.map((link) => link.lessonId)).toEqual(lessons.slice(4).map((lesson) => lesson.id));
      });
    }, 120_000);

    it('keeps month-edge lessons in the correct cycles when the first lesson starts just after midnight', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2026, 3, 20, 12, 0, 0)));

      await withRollback(dataSource!, async (manager) => {
        const fixture = await seedHappyPath(manager, { customerDiscountValue: undefined });
        const createService = studentEnrolmentServiceFor(manager);
        const reviewService = lessonReviewServiceFor(manager);
        const confirmService = lessonConfirmationServiceFor(manager);

        const dto: CreateStudentEnrolmentDto = {
          programId: fixture.programId,
          programRate: 120,
          duration: '00:45',
          paymentFrequency: 'Monthly',
          paymentFrequencyDiscount: 0,
          multipleEnrolDiscount: 0,
          discountedRatePerMonth: 400,
          lessonsCount: 3,
          autoRenew: false,
          startDate: '2026-04-29',
          paymentCycleEffectiveDate: '2026-05-01',
          isOnline: false,
          teacherId: fixture.teacherId,
          day: 'Wednesday',
          startTime: '00:30',
        };

        const created = await createService.createEnrolment(
          fixture.locationId,
          fixture.locationSlug,
          fixture.studentId,
          dto,
          fixture.adminUserId,
        );

        expect(created).toMatchObject({
          courseId: expect.any(Number),
          programName: 'Private Piano',
          teacherName: 'Taylor Teacher',
          day: 'Wednesday',
        });

        const enrolment = await manager.getRepository(Enrolment).findOne({
          where: { studentId: fixture.studentId },
        });
        expect(enrolment).toBeTruthy();

        const review = await reviewService.getLessonReview(enrolment!.courseId, fixture.locationId);
        expect(review.summary).toEqual({
          holidayConflicted: 0,
          conflicted: 0,
          unscheduled: 0,
          scheduled: 3,
          total: 3,
        });

        const returnedEnrolmentId = await confirmService.confirmLessonsForCourse(
          enrolment!.courseId,
          fixture.locationId,
          fixture.adminUserId,
        );

        expect(returnedEnrolmentId).toBe(enrolment!.id);

        const confirmedEnrolment = await manager.getRepository(Enrolment).findOneByOrFail({ id: enrolment!.id });
        expect(confirmedEnrolment.isConfirmed).toBe(1);
        expect(dateOnly(confirmedEnrolment.endDateTime)).toBe('2026-05-13');

        const lessons = await manager.getRepository(Lesson).find({
          where: { courseId: enrolment!.courseId },
          order: { date: 'ASC' },
        });
        expect(lessons).toHaveLength(3);
        expect(lessons.map((lesson) => lesson.date.toISOString())).toEqual([
          '2026-04-29T00:30:00.000Z',
          '2026-05-06T00:30:00.000Z',
          '2026-05-13T00:30:00.000Z',
        ]);
        expect(lessons.map((lesson) => new Date(lesson.dueDate).toISOString())).toEqual([
          '2026-03-15T00:00:00.000Z',
          '2026-04-15T00:00:00.000Z',
          '2026-04-15T00:00:00.000Z',
        ]);

        const paymentCycles = await manager.getRepository(PaymentCycle).find({
          where: { enrolmentId: enrolment!.id },
          order: { startDate: 'ASC' },
        });
        expect(paymentCycles.map((cycle) => ({
          startDate: dateOnly(cycle.startDate),
          endDate: dateOnly(cycle.endDate),
        }))).toEqual([
          { startDate: '2026-04-01', endDate: '2026-04-30' },
          { startDate: '2026-05-01', endDate: '2026-05-31' },
        ]);

        const firstCycleLinks = await manager.getRepository(PaymentCycleLesson).find({
          where: { paymentCycleId: paymentCycles[0].id },
          order: { lessonId: 'ASC' },
        });
        const secondCycleLinks = await manager.getRepository(PaymentCycleLesson).find({
          where: { paymentCycleId: paymentCycles[1].id },
          order: { lessonId: 'ASC' },
        });

        expect(firstCycleLinks).toHaveLength(1);
        expect(secondCycleLinks).toHaveLength(2);
        expect(firstCycleLinks.map((link) => link.lessonId)).toEqual([lessons[0].id]);
        expect(secondCycleLinks.map((link) => link.lessonId)).toEqual(lessons.slice(1).map((lesson) => lesson.id));
      });
    }, 120_000);
  },
);

describe.skipIf(integrationEnabled)('private enrolment creation integration (disabled)', () => {
  it('SKIPS: set TEST_DB_DSN to enable transaction-wrapped enrolment graph tests', () => {
    expect(process.env.TEST_DB_DSN).toBeUndefined();
  });
});

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
  } else if (!options) {
    await manager.getRepository(CustomerDiscount).save({
      customerId,
      value: 7.5,
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

function dateOnly(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function summarizeLessonDiscounts(
  discounts: LessonDiscount[],
): Array<{ lessonId: number; type: number; valueType: number; value: number }> {
  return discounts.map((discount) => ({
    lessonId: discount.lessonId,
    type: discount.type,
    valueType: discount.valueType,
    value: Number(discount.value),
  }));
}
