import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';
import { CalendarEventColor } from '../../../src/color-code/entities/calendar-event-color.entity';
import { CustomerAccount } from '../../../src/customer/entities/customer-account.entity';
import { CustomerDiscount } from '../../../src/customer/entities/customer-discount.entity';
import { NotificationEmailType } from '../../../src/customer/entities/notification-email-type.entity';
import { Enrolment } from '../../../src/enrolment/entities/enrolment.entity';
import { LessonDiscount } from '../../../src/lesson/entities/lesson-discount.entity';
import { LessonHierarchy } from '../../../src/lesson/entities/lesson-hierarchy.entity';
import { Lesson } from '../../../src/lesson/entities/lesson.entity';
import { PrivateLessonEmailStatus } from '../../../src/lesson/entities/private-lesson-email-status.entity';
import { PrivateLesson } from '../../../src/lesson/entities/private-lesson.entity';
import { LessonStatusEnum } from '../../../src/lesson/enums/lesson-status';
import { LessonEditScheduleRepository } from '../../../src/lesson/repositories/lesson-edit-schedule.repository';
import { LessonEditScheduleService } from '../../../src/lesson/services/lesson-edit-schedule.service';
import { Location } from '../../../src/location/entities/location.entity';
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
  releaseControlledTestDbLock,
  studentEnrolmentServiceFor,
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
  'private lesson edit schedule integration (controlled schema)',
  () => {
    it('cancels the original confirmed private lesson and creates a rescheduled replacement', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2026, 3, 10, 12, 0, 0)));

      const manager = dataSource!.manager;
      const fixture = await seedEditScheduleFixture(manager);
      const createService = studentEnrolmentServiceFor(manager);
      const confirmService = lessonConfirmationServiceFor(manager);
      const editService = lessonEditScheduleServiceFor(dataSource!);

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

      const originalLesson = await manager.getRepository(Lesson).findOneOrFail({
        where: { courseId: enrolment.courseId, status: LessonStatusEnum.SCHEDULED },
        order: { date: 'ASC' },
      });

      const originalPrivateLesson = await manager.getRepository(PrivateLesson).findOneByOrFail({
        lessonId: originalLesson.id,
      });
      const originalDiscounts = await manager.getRepository(LessonDiscount).find({
        where: { lessonId: originalLesson.id },
      });

      const result = await editService.editSchedule(
        fixture.locationSlug,
        fixture.locationId,
        originalLesson.id,
        {
          teacherId: fixture.substituteTeacherId,
          date: '2026-04-08 3:00 PM',
          duration: '01:00:00',
        },
        fixture.adminUserId,
      );

      const allLessons = await manager.getRepository(Lesson).find({
        where: { courseId: enrolment.courseId },
        order: { id: 'ASC' },
      });
      const canceledLesson = allLessons.find((lesson) => lesson.id === originalLesson.id);
      const replacementLesson = allLessons.find((lesson) => lesson.id === result.lessonId);

      expect(canceledLesson?.status).toBe(LessonStatusEnum.CANCELED);
      expect(replacementLesson).toBeTruthy();
      expect(replacementLesson?.status).toBe(LessonStatusEnum.RESCHEDULED);
      expect(replacementLesson?.teacherId).toBe(fixture.substituteTeacherId);
      expect(dateOnly(replacementLesson!.date)).toBe('2026-04-08');
      expect(replacementLesson?.duration).toBe('01:00:00');
      expect(Number(replacementLesson?.teacherRate)).toBe(62);

      const replacementPrivateLesson = await manager.getRepository(PrivateLesson).findOneByOrFail({
        lessonId: replacementLesson!.id,
      });
      // The first edit has no ancestor: legacy expiry is the new date + 90 days.
      // Subsequent edits inherit the root expiry unless the new date exceeds it.
      expect(dateOnly(originalPrivateLesson.expiryDate)).toBe('2026-07-06');
      expect(dateOnly(replacementPrivateLesson.expiryDate)).toBe('2026-07-07');

      const replacementDiscounts = await manager.getRepository(LessonDiscount).find({
        where: { lessonId: replacementLesson!.id },
      });
      expect(replacementDiscounts).toHaveLength(originalDiscounts.length);

      const hierarchyRows = await manager.getRepository(LessonHierarchy).find({
        where: [
          { lessonId: originalLesson.id, childLessonId: replacementLesson!.id },
          { lessonId: replacementLesson!.id, childLessonId: replacementLesson!.id },
        ],
      });
      expect(hierarchyRows).toHaveLength(2);

      const replacementEmailStatuses = await manager.getRepository(PrivateLessonEmailStatus).find({
        where: { lessonId: replacementLesson!.id },
        order: { id: 'ASC' },
      });
      expect(replacementEmailStatuses).toHaveLength(2);

      expect(result).toMatchObject({
        lessonId: replacementLesson!.id,
        isPrivateLesson: true,
        resourceId: fixture.substituteTeacherId,
        url: `admin/v2/${fixture.locationSlug}/private-lesson/${replacementLesson!.id}`,
        className: 'lesson-rescheduled',
        backgroundColor: '#ff6600',
      });

      // A later edit has an ancestor and therefore inherits the original root expiry.
      const secondEdit = await editService.editSchedule(
        fixture.locationSlug, fixture.locationId, replacementLesson!.id,
        { date: '2026-04-09 3:00 PM' }, fixture.adminUserId,
      );
      const secondPrivate = await manager.getRepository(PrivateLesson).findOneByOrFail({
        lessonId: secondEdit.lessonId,
      });
      expect(dateOnly(secondPrivate.expiryDate)).toBe('2026-07-06');
    }, 180_000);
  },
);

describe.skipIf(integrationEnabled)('private lesson edit schedule integration (disabled)', () => {
  it('SKIPS: set TEST_DB_DSN to enable transaction-wrapped lesson edit schedule tests', () => {
    expect(true).toBe(true);
  });
});

function lessonEditScheduleServiceFor(dataSource: DataSource): LessonEditScheduleService {
  return new LessonEditScheduleService(
    {} as never,
    new LessonEditScheduleRepository(),
    { handlePrivateLessonReschedule: async () => undefined } as never,
    { validateTeacherOverlap: async () => undefined } as never,
    { validateStudentOverlap: async () => undefined } as never,
    { validateTeacherEligibility: async () => undefined } as never,
    { recalculateAndPersist: async () => undefined } as never,
    dataSource,
  );
}

async function seedEditScheduleFixture(
  manager: EntityManager,
): Promise<{
  adminUserId: number;
  customerId: number;
  locationId: number;
  locationSlug: string;
  programId: number;
  studentId: number;
  teacherId: number;
  substituteTeacherId: number;
}> {
  const locationId = 3;
  const customerId = 501;
  const teacherId = 601;
  const substituteTeacherId = 602;
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
    {
      id: substituteTeacherId,
      username: 'teacher-602',
      auth_key: 'teacher-auth-2',
      access_token: 'teacher-token-2',
      status: User.STATUS_ACTIVE,
      canLogin: true,
      canMerge: false,
      isDeleted: false,
    },
  ]);

  await manager.getRepository(UserProfile).save([
    { userId: customerId, firstname: 'Cora', lastname: 'Customer' },
    { userId: teacherId, firstname: 'Taylor', lastname: 'Teacher' },
    { userId: substituteTeacherId, firstname: 'Sam', lastname: 'Substitute' },
  ]);

  await manager.getRepository(UserLocation).save([
    { userId: customerId, locationId },
    { userId: teacherId, locationId },
    { userId: substituteTeacherId, locationId },
  ]);

  await manager.getRepository(CustomerAccount).save({
    customerId,
    balance: 0,
    createdOn: now,
    updatedOn: now,
    createdByUserId: adminUserId,
    updatedByUserId: adminUserId,
  });

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

  await manager.getRepository(Qualification).save([
    {
      teacherId,
      programId,
      rate: 45,
      type: 1,
      isDeleted: false,
      createdOn: now,
      updatedOn: now,
      createdByUserId: adminUserId,
      updatedByUserId: adminUserId,
    },
    {
      teacherId: substituteTeacherId,
      programId,
      rate: 62,
      type: 1,
      isDeleted: false,
      createdOn: now,
      updatedOn: now,
      createdByUserId: adminUserId,
      updatedByUserId: adminUserId,
    },
  ]);

  await manager.getRepository(CustomerDiscount).save({
    customerId,
    value: 7.5,
    isDeleted: false,
  });

  await manager.getRepository(CalendarEventColor).save([
    { name: 'Rescheduled', code: '#ff6600', cssClass: 'lesson-rescheduled' },
    { name: 'Private Lesson', code: '#3366ff', cssClass: 'private-lesson' },
    { name: 'Teacher Substituted', code: '#00aa66', cssClass: 'teacher-substituted' },
  ]);

  await manager.getRepository(NotificationEmailType).save([
    {
      emailNotifyType: 'teacher',
      createdOn: now,
      updatedOn: now,
      createdByUserId: adminUserId,
      updatedByUserId: adminUserId,
      isDeleted: 0,
    },
    {
      emailNotifyType: 'student',
      createdOn: now,
      updatedOn: now,
      createdByUserId: adminUserId,
      updatedByUserId: adminUserId,
      isDeleted: 0,
    },
  ]);

  return {
    adminUserId,
    customerId,
    locationId,
    locationSlug: 'toronto',
    programId,
    studentId,
    teacherId,
    substituteTeacherId,
  };
}

function dateOnly(value: Date | string | null): string {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}
