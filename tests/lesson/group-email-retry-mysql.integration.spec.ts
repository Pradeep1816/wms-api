import {
  MailerService,
  SendEmailOptions,
} from '../../src/shared/services/mailer.service';
import { CronLockService } from '../../src/cron/services/cron-lock.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataSource, EntitySchema, QueryRunner } from 'typeorm';
import { Student } from '../../src/student/entities/student.entity';
import { Enrolment } from '../../src/enrolment/entities/enrolment.entity';
import { Course } from '../../src/course/entities/course.entity';
import { GroupLessonEmailStatus } from '../../src/lesson/entities/group-lesson-email-status.entity';
import { EmailAutoEmailCronRepository } from '../../src/cron/repositories/email-auto-email-cron.repository';
import { EmailAutoEmailCronService } from '../../src/cron/services/email-auto-email-cron.service';
import { assertControlledTestDatabaseTarget } from '../support/controlled-test-database';

const dsn = process.env.SMW_NOTIFICATION_TEST_DSN;
const now = new Date('2026-09-08T12:00:00Z');

describe.skipIf(!dsn)(
  'group reminder retry with real MySQL recipient filtering',
  () => {
    let source: DataSource;
    let runner: QueryRunner;
    let repository: EmailAutoEmailCronRepository;

    beforeEach(async () => {
      assertControlledTestDatabaseTarget(dsn!);
      source = new DataSource({
        type: 'mysql',
        url: dsn,
        timezone: 'Z',
        synchronize: false,
        logging: false,
        entities: [
          new EntitySchema({
            name: 'Student',
            target: Student,
            tableName: 'student',
            columns: {
              id: { type: Number, primary: true },
              customerId: { type: Number, name: 'customer_id' },
              firstName: { type: String, name: 'first_name' },
              lastName: { type: String, name: 'last_name' },
              isDeleted: { type: Number },
            },
            relations: {
              enrolments: {
                type: 'one-to-many',
                target: 'Enrolment',
                inverseSide: 'student',
              },
            },
          }),
          new EntitySchema({
            name: 'Enrolment',
            target: Enrolment,
            tableName: 'enrolment',
            columns: {
              id: { type: Number, primary: true },
              studentId: { type: Number },
              courseId: { type: Number },
              isDeleted: { type: Number },
              isConfirmed: { type: Number },
              endDateTime: { type: Date },
            },
            relations: {
              student: {
                type: 'many-to-one',
                target: 'Student',
                joinColumn: { name: 'studentId' },
              },
              course: {
                type: 'many-to-one',
                target: 'Course',
                joinColumn: { name: 'courseId' },
              },
            },
          }),
          new EntitySchema({
            name: 'Course',
            target: Course,
            tableName: 'course',
            columns: {
              id: { type: Number, primary: true },
              isDeleted: { type: Number },
              isConfirmed: { type: Number },
            },
          }),
          new EntitySchema({
            name: 'GroupLessonEmailStatus',
            target: GroupLessonEmailStatus,
            tableName: 'group_lesson_email_status',
            columns: {
              id: { type: Number, primary: true, generated: true },
              lessonId: { type: Number },
              studentId: { type: Number },
              notificationType: { type: Number },
              status: { type: Number },
            },
          }),
        ],
      });
      await source.initialize();
      runner = source.createQueryRunner();
      await runner.connect();
      const tables = {
        student:
          'id INT PRIMARY KEY, customer_id INT, first_name VARCHAR(30), last_name VARCHAR(30), isDeleted INT',
        enrolment:
          'id INT PRIMARY KEY, studentId INT, courseId INT, isDeleted INT, isConfirmed INT, endDateTime DATETIME',
        course: 'id INT PRIMARY KEY, isDeleted INT, isConfirmed INT',
        group_lesson_email_status:
          'id INT PRIMARY KEY AUTO_INCREMENT, lessonId INT, studentId INT, notificationType INT, status INT',
      };
      for (const [name, columns] of Object.entries(tables)) {
        await runner.query(
          `CREATE TEMPORARY TABLE ${name} (${columns}) ENGINE=InnoDB`,
        );
      }
      await runner.query('INSERT INTO course VALUES (20,0,1)');
      for (let id = 1; id <= 10; id++) {
        await runner.query('INSERT INTO student VALUES (?,?,?,?,?)', [
          id,
          id === 3 ? 502 : 501,
          `Student${id}`,
          'Test',
          id === 4 ? 1 : 0,
        ]);
        await runner.query('INSERT INTO enrolment VALUES (?,?,20,?,?,?)', [
          id,
          id,
          id === 5 ? 1 : 0,
          id === 9 ? 0 : 1,
          id === 6 ? '2026-09-07' : '2026-12-31',
        ]);
      }
      // Duplicate enrolments must not duplicate an otherwise eligible recipient.
      await runner.query(
        "INSERT INTO enrolment VALUES (11,2,20,0,1,'2026-12-31')",
      );
      repository = new EmailAutoEmailCronRepository(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        runner.manager.getRepository(Student),
        {} as never,
        {} as never,
        runner.manager.getRepository(GroupLessonEmailStatus),
      );
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      if (runner && !runner.isReleased) await runner.release();
      if (source?.isInitialized) await source.destroy();
    });

    it.each([1, 2, 4])(
      'retries only the pending student for notification type %i',
      async (type) => {
        for (let studentId = 1; studentId <= 9; studentId++) {
          await runner.query(
            'INSERT INTO group_lesson_email_status (lessonId,studentId,notificationType,status) VALUES (?,?,?,?)',
            [
              studentId === 8 ? 99 : 80,
              studentId,
              studentId === 7 ? 3 : type,
              studentId === 1 ? 1 : 0,
            ],
          );
        }
        const candidates = await repository.getPendingGroupStudentsForLesson(
          501,
          20,
          80,
          type,
          now,
        );
        expect(candidates.map((row) => row.studentId)).toEqual([2]);
        const mockRepository = {
          getActiveLocations: vi
            .fn()
            .mockResolvedValue([
              { id: 1, email: 'location@example.test', name: 'Test' },
            ]),
          getCheckedCustomerIds: vi.fn().mockResolvedValue([501]),
          getCheckedNotificationTypesForCustomer: vi
            .fn()
            .mockResolvedValue([type]),
          getRecipientEmails: vi
            .fn()
            .mockResolvedValue(['customer@example.test']),
          getEmailTemplateByType: vi
            .fn()
            .mockResolvedValue({ subject: 'Test reminder' }),
          getPrivateFirstLessonIds: vi.fn().mockResolvedValue([]),
          getGroupFirstLessonIds: vi.fn().mockResolvedValue([80]),
          getPrivateLessonsForNotification: vi.fn().mockResolvedValue([]),
          // Keep returning the lesson, as another customer's status remains pending.
          getGroupLessonsForNotification: vi.fn().mockResolvedValue([
            {
              lessonId: 80,
              courseId: 20,
              lessonDate: now,
              courseName: 'Test group',
            },
          ]),
          getPendingGroupStudentsForLesson: (
            ...args: Parameters<
              EmailAutoEmailCronRepository['getPendingGroupStudentsForLesson']
            >
          ) => repository.getPendingGroupStudentsForLesson(...args),
          markGroupStatusSent: (
            ...args: Parameters<
              EmailAutoEmailCronRepository['markGroupStatusSent']
            >
          ) => repository.markGroupStatusSent(...args),
        };
        const mailer = {
          sendEmail: vi
            .fn<(options: SendEmailOptions) => Promise<void>>()
            .mockRejectedValueOnce(new Error('SMTP unavailable'))
            .mockResolvedValue(undefined),
        };
        const service = new EmailAutoEmailCronService(
          mockRepository as unknown as EmailAutoEmailCronRepository,
          mailer as unknown as MailerService,
          {
            runWithLock: (
              _a: string,
              _b: string,
              _c: unknown,
              run: () => Promise<unknown>,
            ) => run(),
          } as unknown as CronLockService,
        );
        vi.spyOn(
          service as unknown as {
            getCurrentEasternStoredDate: () => Date;
            delay: () => Promise<void>;
          },
          'getCurrentEasternStoredDate',
        ).mockReturnValue(now);
        vi.spyOn(
          service as unknown as {
            getCurrentEasternStoredDate: () => Date;
            delay: () => Promise<void>;
          },
          'delay',
        ).mockResolvedValue(undefined);

        expect(await service.runManually(1)).toMatchObject({
          sendFailures: 1,
          groupStatusUpdates: 0,
        });
        expect(
          (
            await repository.getPendingGroupStudentsForLesson(
              501,
              20,
              80,
              type,
              now,
            )
          ).map((row) => row.studentId),
        ).toEqual([2]);
        expect(await service.runManually(1)).toMatchObject({
          groupEmailsSent: 1,
          groupStatusUpdates: 1,
          sendFailures: 0,
        });
        expect(await service.runManually(1)).toMatchObject({
          groupEmailsSent: 0,
          groupStatusUpdates: 0,
        });
        expect(mailer.sendEmail).toHaveBeenCalledTimes(2); // Failed attempt plus successful retry only.
        expect(
          mailer.sendEmail.mock.calls.every(
            ([email]) =>
              email.html.includes('Student2 Test') &&
              !email.html.includes('Student1 Test'),
          ),
        ).toBe(true);
        expect(
          (
            await repository.getPendingGroupStudentsForLesson(
              502,
              20,
              80,
              type,
              now,
            )
          ).map((row) => row.studentId),
        ).toEqual([3]);
      },
    );
  },
);
