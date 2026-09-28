import { RepairOptedInFutureLessonNotifications1789128000000 } from '../../src/migrations/1789128000000-RepairOptedInFutureLessonNotifications';
import { FutureLessonNotificationRepair } from '../../src/lesson/helpers/future-lesson-notification-repair';
import { CustomerListRepository } from '../../src/customer/repositories/customers.repository';
import { CustomerEmailNotification } from '../../src/customer/entities/customer-email-notification.entity';
import { NotificationEmailType } from '../../src/customer/entities/notification-email-type.entity';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataSource, EntitySchema, QueryRunner } from 'typeorm';
import { PrivateLessonEmailStatus } from '../../src/lesson/entities/private-lesson-email-status.entity';
import { GroupLessonEmailStatus } from '../../src/lesson/entities/group-lesson-email-status.entity';
import { ensurePrivateLessonEmailStatuses } from '../../src/lesson/helpers/ensure-lesson-email-statuses';
import { assertControlledTestDatabaseTarget } from '../support/controlled-test-database';
import { BackfillFutureLessonNotificationStatuses1788800000000 } from '../../src/migrations/1788800000000-BackfillFutureLessonNotificationStatuses';

const dsn = process.env.SMW_NOTIFICATION_TEST_DSN;
let source: DataSource;
let runner: QueryRunner;

// Connection-local temporary tables only: no schema sync/drop, migrations, or application boot.
describe.skipIf(!dsn)(
  'SMW-1642 isolated MySQL notification persistence',
  () => {
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
            name: 'CustomerEmailNotification',
            target: CustomerEmailNotification,
            tableName: 'customer_email_notification',
            columns: {
              id: { type: Number, primary: true, generated: true },
              userId: { type: Number },
              emailNotificationTypeId: { type: Number },
              isChecked: { type: Number },
            },
          }),
          new EntitySchema({
            name: 'NotificationEmailType',
            target: NotificationEmailType,
            tableName: 'notification_email_type',
            columns: {
              id: { type: Number, primary: true },
              isDeleted: { type: Number },
            },
          }),

          new EntitySchema({
            name: 'PrivateLessonEmailStatus',
            target: PrivateLessonEmailStatus,
            tableName: 'private_lesson_email_status',
            columns: {
              id: { type: Number, primary: true, generated: true },
              lessonId: { type: Number },
              notificationType: { type: Number },
              status: { type: Number },
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
      const schemas = {
        user: 'id INT PRIMARY KEY',
        notification_email_type: 'id INT PRIMARY KEY, isDeleted INT',
        private_lesson_email_status:
          'id INT AUTO_INCREMENT PRIMARY KEY, lessonId INT, notificationType INT, status INT',
        group_lesson_email_status:
          'id INT AUTO_INCREMENT PRIMARY KEY, lessonId INT, studentId INT, notificationType INT, status INT',
        location: 'id INT PRIMARY KEY, isDeleted INT',
        program: 'id INT PRIMARY KEY, type INT',
        course:
          'id INT PRIMARY KEY, locationId INT, programId INT, type INT, isDeleted INT, isConfirmed INT',
        student: 'id INT PRIMARY KEY, customer_id INT, isDeleted INT',
        enrolment:
          'id INT PRIMARY KEY, courseId INT, studentId INT, isDeleted INT, isConfirmed INT, endDateTime DATETIME',
        lesson:
          'id INT PRIMARY KEY, courseId INT, date DATETIME, status INT, type INT, isDeleted INT, isConfirmed INT',
        customer_email_notification:
          'id INT AUTO_INCREMENT PRIMARY KEY, userId INT, emailNotificationTypeId INT, isChecked INT',
      };
      for (const [name, columns] of Object.entries(schemas)) {
        await runner.query(
          `CREATE TEMPORARY TABLE ${name} (${columns}) ENGINE=InnoDB`,
        );
      }
    });

    afterEach(async () => {
      vi.useRealTimers();
      vi.restoreAllMocks();
      if (runner?.isTransactionActive) await runner.rollbackTransaction();
      if (runner && !runner.isReleased) await runner.release();
      if (source?.isInitialized) await source.destroy();
    });

    it('persists only missing private statuses, preserves sent flags, and rolls back with the lesson transaction', async () => {
      await runner.query(
        'INSERT INTO private_lesson_email_status (lessonId,notificationType,status) VALUES (1,4,1)',
      );
      await runner.startTransaction();
      const repo = runner.manager.getRepository(PrivateLessonEmailStatus);
      await ensurePrivateLessonEmailStatuses(repo, [1, 2]);
      await ensurePrivateLessonEmailStatuses(repo, [1, 2]);
      expect(await repo.count()).toBe(8);
      expect(
        (await repo.findOneByOrFail({ lessonId: 1, notificationType: 4 }))
          ?.status,
      ).toBe(1);
      await runner.rollbackTransaction();
      expect(await repo.count()).toBe(1);
    });

    async function seedMigration() {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-08T16:00:00Z'));
      await runner.query('INSERT INTO location VALUES (20,0),(21,0),(22,1)');
      await runner.query('INSERT INTO program VALUES (1,1),(2,2)');
      await runner.query(
        'INSERT INTO course VALUES (10,20,1,1,0,1),(11,21,1,1,0,1),(12,20,1,1,0,1),(13,22,1,1,0,1),(20,20,2,1,0,1)',
      );
      await runner.query(
        'INSERT INTO student VALUES (100,1000,0),(101,1001,0),(102,1002,0),(103,1003,0)',
      );
      await runner.query(
        "INSERT INTO enrolment VALUES (1,10,100,0,1,'2099-12-31'),(2,11,100,0,1,'2099-12-31'),(3,12,101,0,1,'2099-12-31'),(4,20,100,0,1,'2099-12-31'),(5,20,102,0,1,'2099-12-31'),(6,20,103,0,1,'2000-01-01'),(7,13,100,0,1,'2099-12-31')",
      );
      await runner.query(
        'INSERT INTO customer_email_notification (userId,emailNotificationTypeId,isChecked) VALUES (1000,4,1),(1001,4,0),(1002,1,1),(1003,4,1)',
      );
      await runner.query(`INSERT INTO lesson VALUES
        (1,10,'2026-09-09 12:00:01',2,1,0,1),(2,10,'2026-09-10 12:00:00',1,1,0,1),
        (3,10,'2000-01-01',2,1,0,1),(4,10,'2026-09-08 20:00:00',2,1,0,1),
        (5,10,'2026-09-09 12:00:00',2,1,0,1),(6,10,'2099-01-01',2,1,0,0),
        (7,10,'2099-01-01',4,1,0,1),(8,10,'2099-01-01',2,1,1,1),
        (9,10,'2099-01-01',2,2,0,1),(10,20,'2099-01-01',2,1,0,1),
        (11,12,'2099-01-01',2,1,0,1),(12,11,'2099-01-01',2,1,0,1),
        (13,13,'2099-01-01',2,1,0,1)`);
      await runner.query(
        'INSERT INTO private_lesson_email_status (lessonId,notificationType,status) VALUES (2,1,0),(2,4,1)',
      );
      await runner.query(
        'INSERT INTO group_lesson_email_status (lessonId,studentId,notificationType,status) VALUES (10,100,4,1)',
      );
    }

    describe.each([
      [
        'original migration',
        () => new BackfillFutureLessonNotificationStatuses1788800000000(),
      ],
      [
        'opt-in repair migration',
        () => {
          const migration =
            new RepairOptedInFutureLessonNotifications1789128000000();
          return {
            up: (r: QueryRunner) => migration.up(r),
            down: () => migration.down(),
            preview: (r: QueryRunner) =>
              new FutureLessonNotificationRepair().preview(r),
          };
        },
      ],
    ] as const)('%s', (_name, makeMigration) => {
      it('backfills strictly beyond the 24-hour window, preserves pending/sent flags, and is repeat-safe', async () => {
        await seedMigration();
        const migration = makeMigration();
        const preview = await migration.preview(runner);
        expect(preview.cutoffEasternExclusive).toBe('2026-09-09 12:00:00');
        expect(preview.missingRecords).toBe(17);
        const privateRepo = runner.manager.getRepository(
          PrivateLessonEmailStatus,
        );
        const groupRepo = runner.manager.getRepository(GroupLessonEmailStatus);
        expect(await privateRepo.count()).toBe(2); // preview did not insert
        await runner.startTransaction();
        await migration.up(runner);
        await migration.up(runner);
        await runner.commitTransaction();
        const privateRows = await privateRepo.find();
        expect(privateRows).toHaveLength(12);
        expect(
          [...new Set(privateRows.map((row) => row.lessonId))].sort(
            (a, b) => a - b,
          ),
        ).toEqual([1, 2, 12]);
        expect(
          privateRows.find(
            (row) => row.lessonId === 2 && row.notificationType === 1,
          )?.status,
        ).toBe(0);
        expect(
          privateRows.find(
            (row) => row.lessonId === 2 && row.notificationType === 4,
          )?.status,
        ).toBe(1);
        const groupRows = await groupRepo.find();
        expect(groupRows).toHaveLength(8);
        expect(
          [...new Set(groupRows.map((row) => row.studentId))].sort(),
        ).toEqual([100, 102]);
        expect(
          groupRows.find(
            (row) => row.studentId === 100 && row.notificationType === 4,
          )?.status,
        ).toBe(1);
        expect((await migration.preview(runner)).missingRecords).toBe(0);
        await migration.down();
        expect(await privateRepo.count()).toBe(12);
        expect(await groupRepo.count()).toBe(8);
      });

      it('allows the migration transaction to roll back all inserts after a later failure', async () => {
        await seedMigration();
        await runner.startTransaction();
        const originalQuery = runner.query.bind(runner) as (
          sql: string,
          params?: unknown[],
          structured?: boolean,
        ) => Promise<unknown>;
        vi.spyOn(runner, 'query').mockImplementation(
          async (sql: string, params?: unknown[], structured?: boolean) => {
            if (sql.startsWith('INSERT INTO group_lesson_email_status'))
              throw new Error('simulated group failure');
            return await originalQuery(sql, params, structured);
          },
        );
        await expect(makeMigration().up(runner)).rejects.toThrow(
          'simulated group failure',
        );
        await runner.rollbackTransaction();
        expect(
          await runner.manager.getRepository(PrivateLessonEmailStatus).count(),
        ).toBe(2);
        expect(
          await runner.manager.getRepository(GroupLessonEmailStatus).count(),
        ).toBe(1);
      });
    });

    async function preferenceRepository() {
      await runner.query('INSERT INTO user VALUES (1000),(1001)');
      await runner.query(
        'INSERT INTO notification_email_type VALUES (1,0),(2,0),(3,0),(4,0),(5,0)',
      );
      // Real transaction and repositories on the same connection as the temporary tables.
      vi.spyOn(runner, 'release').mockResolvedValue();
      const repository = Object.create(
        CustomerListRepository.prototype,
      ) as CustomerListRepository;
      Object.assign(repository, {
        userRepository: {
          manager: { connection: { createQueryRunner: () => runner } },
        },
      });
      return repository;
    }

    it('repairs opt-in after the old migration, scopes by customer, and is safe to re-save', async () => {
      await seedMigration();
      await runner.query(
        'UPDATE customer_email_notification SET isChecked=0 WHERE userId=1000',
      );
      await runner.startTransaction();
      await new BackfillFutureLessonNotificationStatuses1788800000000().up(
        runner,
      );
      await runner.commitTransaction();
      const repository = await preferenceRepository();
      await repository.updateNotificationEmailSettings(1000, [4]);
      await repository.updateNotificationEmailSettings(1000, [4]);
      const rows = (await runner.query(
        'SELECT lessonId,notificationType,status FROM private_lesson_email_status ORDER BY lessonId,notificationType',
      )) as Array<{
        lessonId: number;
        notificationType: number;
        status: number;
      }>;
      expect(rows).toHaveLength(12);
      expect([...new Set(rows.map((r) => r.lessonId))]).toEqual([1, 2, 12]);
      expect(
        rows.find((r) => r.lessonId === 2 && r.notificationType === 4)?.status,
      ).toBe(1);
      expect(
        rows.some((r) => [3, 4, 5, 6, 7, 8, 9, 11, 13].includes(r.lessonId)),
      ).toBe(false);
      const group = (await runner.query(
        'SELECT studentId,notificationType,status FROM group_lesson_email_status ORDER BY studentId,notificationType',
      )) as Array<{
        studentId: number;
        notificationType: number;
        status: number;
      }>;
      expect(group).toHaveLength(8);
      expect(
        group.find((r) => r.studentId === 100 && r.notificationType === 4)
          ?.status,
      ).toBe(1);
      const prefs = (await runner.query(
        'SELECT emailNotificationTypeId,isChecked FROM customer_email_notification WHERE userId=1000 ORDER BY emailNotificationTypeId',
      )) as Array<{ emailNotificationTypeId: number; isChecked: number }>;
      expect(prefs.map((r) => r.isChecked)).toEqual([0, 0, 0, 1, 0]);
    });

    it('repairs only the selected customer even when another group student is opted in', async () => {
      await seedMigration();
      const repository = await preferenceRepository();
      await repository.updateNotificationEmailSettings(1000, [4]);
      const group = (await runner.query(
        'SELECT DISTINCT studentId FROM group_lesson_email_status ORDER BY studentId',
      )) as Array<{
        studentId: number;
        notificationType: number;
        status: number;
      }>;
      expect(group).toEqual([{ studentId: 100 }]);
      expect(
        await runner.query(
          'SELECT COUNT(*) n FROM private_lesson_email_status WHERE lessonId=11',
        ),
      ).toEqual([{ n: '0' }]);
      expect(
        await runner.query(
          'SELECT COUNT(*) n FROM private_lesson_email_status WHERE lessonId=12',
        ),
      ).toEqual([{ n: '4' }]);
    });

    it('does not create lesson records when disabled or only an unsupported type is selected', async () => {
      await seedMigration();
      const repository = await preferenceRepository();
      await repository.updateNotificationEmailSettings(1000, []);
      await repository.updateNotificationEmailSettings(1000, [5]);
      expect(
        await runner.manager.getRepository(PrivateLessonEmailStatus).count(),
      ).toBe(2);
      expect(
        await runner.manager.getRepository(GroupLessonEmailStatus).count(),
      ).toBe(1);
    });

    it('rolls back preferences and private repair when group repair fails', async () => {
      await seedMigration();
      await runner.query(
        'UPDATE customer_email_notification SET isChecked=0 WHERE userId=1000',
      );
      const repository = await preferenceRepository();
      const query = runner.query.bind(runner) as (
        sql: string,
        params?: unknown[],
        structured?: boolean,
      ) => Promise<unknown>;
      vi.spyOn(runner, 'query').mockImplementation(
        async (sql: string, params?: unknown[], structured?: boolean) => {
          if (sql.startsWith('INSERT INTO group_lesson_email_status'))
            throw new Error('group repair failed');
          return await query(sql, params, structured);
        },
      );
      await expect(
        repository.updateNotificationEmailSettings(1000, [4]),
      ).rejects.toThrow('group repair failed');
      expect(
        await runner.manager.getRepository(PrivateLessonEmailStatus).count(),
      ).toBe(2);
      expect(
        await runner.manager.getRepository(GroupLessonEmailStatus).count(),
      ).toBe(1);
      expect(
        await runner.query(
          'SELECT isChecked FROM customer_email_notification WHERE userId=1000',
        ),
      ).toEqual([{ isChecked: 0 }]);
    });
  },
);
