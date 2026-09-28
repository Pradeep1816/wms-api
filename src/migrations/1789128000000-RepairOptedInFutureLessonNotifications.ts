import { MigrationInterface, QueryRunner } from 'typeorm';
import { FutureLessonNotificationRepair } from '../lesson/helpers/future-lesson-notification-repair';

/** A new ledger entry repairs accounts already opted in before the runtime fix. */
export class RepairOptedInFutureLessonNotifications1789128000000 implements MigrationInterface {
  name = 'RepairOptedInFutureLessonNotifications1789128000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await new FutureLessonNotificationRepair().repair(queryRunner);
  }

  async down(): Promise<void> {
    // Keep rows: deleting them could erase sent history or cause duplicate sends.
  }
}
