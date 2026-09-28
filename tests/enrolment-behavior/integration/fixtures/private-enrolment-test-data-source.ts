import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DataSource, EntityManager } from 'typeorm';
import { Course } from '../../../../src/course/entities/course.entity';
import { CourseExtra } from '../../../../src/course/entities/course-extra.entity';
import { CourseProgramRate } from '../../../../src/course/entities/course-program-rate.entity';
import { CourseSchedule } from '../../../../src/course/entities/course-schedule.entity';
import { CustomerDiscount } from '../../../../src/customer/entities/customer-discount.entity';
import { Enrolment } from '../../../../src/enrolment/entities/enrolment.entity';
import { EnrolmentDiscount } from '../../../../src/enrolment/entities/enrolment-discount.entity';
import { EnrolmentPaymentFrequency } from '../../../../src/enrolment/entities/enrolment-payment-frequency.entity';
import { PaymentCycleLesson } from '../../../../src/enrolment/entities/payment-cycle-lesson.entity';
import { PermanentScheduleChangeReviewRepository } from '../../../../src/enrolment/repositories/permanent-schedule-change/permanent-schedule-change-review.repository';
import { PermanentScheduleChangeReviewService } from '../../../../src/enrolment/permanent-schedule-change/permanent-schedule-change-review.service';
import { PermanentScheduleChangeConfirmationRepository } from '../../../../src/enrolment/repositories/permanent-schedule-change/permanent-schedule-change-confirmation.repository';
import { PermanentScheduleChangeConfirmationService } from '../../../../src/enrolment/permanent-schedule-change/permanent-schedule-change-confirmation.service';
import { Holiday } from '../../../../src/holiday/entities/holiday.entity';
import { BulkRescheduleLesson } from '../../../../src/lesson/entities/bulk-reschedule-lesson.entity';
import { LessonDiscount } from '../../../../src/lesson/entities/lesson-discount.entity';
import { LessonHierarchy } from '../../../../src/lesson/entities/lesson-hierarchy.entity';
import { Lesson } from '../../../../src/lesson/entities/lesson.entity';
import { LessonPayment } from '../../../../src/lesson/entities/lesson-payment.entity';
import { PrivateLessonEmailStatus } from '../../../../src/lesson/entities/private-lesson-email-status.entity';
import { PrivateLesson } from '../../../../src/lesson/entities/private-lesson.entity';
import { LessonConfirmationService } from '../../../../src/lesson/services/lesson-confirmation.service';
import { LessonReviewService } from '../../../../src/lesson/services/lesson-review.service';
import { LessonRepository } from '../../../../src/lesson/repositories/lesson.repository';
import { Location } from '../../../../src/location/entities/location.entity';
import { PaymentCycle } from '../../../../src/payment/entities/payment-cycle.entity';
import { PaymentFrequency } from '../../../../src/payment/entities/payment-frequency.entity';
import { Program } from '../../../../src/program/entities/program.entity';
import { Qualification } from '../../../../src/qualification/entities/qualification.entity';
import { Student } from '../../../../src/student/entities/student.entity';
import { StudentEnrolmentService } from '../../../../src/student/services/student-enrolment.service';
import { StudentEnrolmentTransformationService } from '../../../../src/student/services/transformations/student-enrolment-transformation.service';
import { StudentRepository } from '../../../../src/student/repositories/student.repository';
import { ProgramPresentationService } from '../../../../src/pricing/services/program-presentation.service';
import { CourseRateResolverService } from '../../../../src/pricing/services/course-rate-resolver.service';
import { PricingRolloutService } from '../../../../src/pricing/services/pricing-rollout.service';
import { UserProfile } from '../../../../src/user/entities/user-profile.entity';
import { User } from '../../../../src/user/entities/user.entity';
import { assertControlledTestDatabaseTarget } from '../../../support/controlled-test-database.js';
import { privateEnrolmentEntitySchemas } from './private-enrolment-entity-schemas.js';

const TEST_DB_LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const TEST_DB_LOCK_RETRY_MS = 250;

export function createPrivateEnrolmentTestDataSource(dsn: string): DataSource {
  assertControlledTestDatabaseTarget(dsn);
  return new DataSource({
    type: 'mysql',
    url: dsn,
    entities: privateEnrolmentEntitySchemas,
    timezone: 'Z',
    synchronize: true,
    dropSchema: true,
    logging: false,
  });
}

export async function acquireControlledTestDbLock(
  dsn: string,
): Promise<string> {
  const { database } = assertControlledTestDatabaseTarget(dsn);
  const lockPath = join(tmpdir(), `smw-api-test-db-${database}.lock`);
  const deadline = Date.now() + TEST_DB_LOCK_TIMEOUT_MS;
  const payload = JSON.stringify({
    pid: process.pid,
    database,
    createdAt: new Date().toISOString(),
  });

  for (;;) {
    try {
      await fs.writeFile(lockPath, payload, { flag: 'wx' });
      return lockPath;
    } catch (error: unknown) {
      if (getErrorCode(error) !== 'EEXIST') {
        throw error;
      }

      if (await isStaleLock(lockPath)) {
        await fs.unlink(lockPath).catch(() => undefined);
        continue;
      }

      if (Date.now() >= deadline) {
        throw new Error(
          `Timed out waiting for controlled test database lock for schema ${database}.`,
        );
      }

      await delay(TEST_DB_LOCK_RETRY_MS);
    }
  }
}

export async function releaseControlledTestDbLock(
  lockPath: string | null,
): Promise<void> {
  if (!lockPath) return;
  await fs.unlink(lockPath).catch((error: unknown) => {
    if (getErrorCode(error) !== 'ENOENT') {
      throw error;
    }
  });
}

export async function withRollback<T>(
  dataSource: DataSource,
  fn: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    const value = await fn(queryRunner.manager);
    await queryRunner.rollbackTransaction();
    return value;
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

export function studentEnrolmentServiceFor(
  manager: EntityManager,
): StudentEnrolmentService {
  const studentRepository = new StudentRepository(
    manager.getRepository(Student),
    manager.getRepository(User),
    manager.getRepository(Location),
  );

  return new StudentEnrolmentService(
    studentRepository,
    failOnUse('enrolmentStudentRepository'),
    new StudentEnrolmentTransformationService(),
    manager.getRepository(Course),
    manager.getRepository(CourseSchedule),
    manager.getRepository(Enrolment),
    manager.getRepository(PaymentFrequency),
    manager.getRepository(EnrolmentPaymentFrequency),
    manager.getRepository(CourseProgramRate),
    manager.getRepository(EnrolmentDiscount),
    manager.getRepository(Lesson),
    manager.getRepository(Holiday),
    lessonRepositoryFor(manager),
    manager.getRepository(Program),
    // The catalogue is never reached from these fixtures: no program here
    // carries a pricingCategory, so `isClassified` is false and
    // `resolveCatalogueRate` returns null before it asks for a price. Wiring a
    // real resolver would need the tuition tables in the schema for no gain,
    // and a stub that answered would quietly change what these tests assert.
    failOnUse('pricingResolver'),
    new ProgramPresentationService(),
    // Real, and genuinely used: `planNewCourseRateRows` runs on every create.
    // With a null catalogue rate it plans the single full-span row these tests
    // have always expected.
    new CourseRateResolverService(),
    // Only called when a tier is supplied, which no legacy fixture does.
    failOnUse('enrolmentTier'),
    // Real. Tests do not run with NODE_ENV=production, so it answers true for
    // every location without reaching the repository - which is the same
    // answer these fixtures had before the gate existed.
    new PricingRolloutService(manager.getRepository(Location)),
  );
}

export function lessonReviewServiceFor(
  manager: EntityManager,
): LessonReviewService {
  return new LessonReviewService(
    manager.getRepository(Lesson),
    manager.getRepository(Course),
    manager.getRepository(Enrolment),
    manager.getRepository(CourseSchedule),
    manager.getRepository(Holiday),
    manager.getRepository(User),
    manager.getRepository(UserProfile),
    manager.getRepository(Student),
    failOnUse('lessonRepository'),
    failOnUse('teacherSubstituteRepository'),
  );
}

export function permanentScheduleChangeReviewServiceFor(
  manager: EntityManager,
): PermanentScheduleChangeReviewService {
  return new PermanentScheduleChangeReviewService(
    new PermanentScheduleChangeReviewRepository(
      manager.getRepository(Lesson),
      manager.getRepository(Course),
      manager.getRepository(Enrolment),
      manager.getRepository(CourseSchedule),
      manager.getRepository(Holiday),
    ),
  );
}

export function lessonConfirmationServiceFor(
  manager: EntityManager,
): LessonConfirmationService {
  return new LessonConfirmationService(
    manager.getRepository(Course),
    manager.getRepository(Lesson),
    manager.getRepository(PrivateLesson),
    manager.getRepository(LessonHierarchy),
    manager.getRepository(Program),
    manager.getRepository(PrivateLessonEmailStatus),
    manager.getRepository(Enrolment),
    manager.getRepository(Student),
    manager.getRepository(User),
    manager.getRepository(LessonDiscount),
    manager.getRepository(CustomerDiscount),
    manager.getRepository(EnrolmentDiscount),
    manager.getRepository(PaymentCycle),
    manager.getRepository(EnrolmentPaymentFrequency),
    failOnUse('courseProgramRateRepository'),
    manager.getRepository(BulkRescheduleLesson),
    manager.getRepository(CourseSchedule),
    manager.getRepository(PaymentCycleLesson),
    manager.getRepository(Qualification),
    manager.getRepository(LessonPayment),
    { recalculateAndPersist: () => Promise.resolve() } as never,
  );
}

export function permanentScheduleChangeConfirmationServiceFor(
  manager: EntityManager,
): PermanentScheduleChangeConfirmationService {
  return new PermanentScheduleChangeConfirmationService(
    new PermanentScheduleChangeConfirmationRepository(
      manager.getRepository(Lesson),
    ),
    { recalculateAndPersist: () => Promise.resolve(0) } as never,
    { applyForEnrolment: () => Promise.resolve() } as never,
  );
}

function lessonRepositoryFor(manager: EntityManager): LessonRepository {
  return new LessonRepository(
    manager.getRepository(Lesson),
    manager.getRepository(Location),
    manager.getRepository(Enrolment),
    manager.getRepository(Course),
    manager.getRepository(Student),
    manager.getRepository(CourseProgramRate),
    manager.getRepository(PrivateLesson),
    manager.getRepository(LessonHierarchy),
    manager.getRepository(CourseSchedule),
    manager.getRepository(Qualification),
    manager.getRepository(Program),
    failOnUse('paymentRepository'),
    manager.getRepository(CourseExtra),
  );
}

async function isStaleLock(lockPath: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(lockPath, 'utf8');
    const parsed = JSON.parse(raw) as { pid?: number };
    if (!parsed.pid) {
      return true;
    }
    return !processExists(parsed.pid);
  } catch {
    return true;
  }
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return getErrorCode(error) === 'EPERM';
  }
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  return typeof error.code === 'string' ? error.code : undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function failOnUse(label: string): never {
  return new Proxy(
    {},
    {
      get(_target, property) {
        throw new Error(
          `Enrolment behavior integration harness touched unstubbed dependency ${label}.${String(property)}`,
        );
      },
    },
  ) as never;
}
