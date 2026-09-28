import { futureNotificationCutoff } from '../shared/helpers/future-notification-cutoff';
import { MigrationInterface, QueryRunner } from 'typeorm';

interface Candidate {
  lessonId: number;
  studentId: number;
  customerId: number;
  locationId: number;
  programType: number;
}

interface MissingStatus extends Candidate {
  notificationType: number;
}

/** Data-only migration: the normal migration transaction owns all inserted rows. */
export class BackfillFutureLessonNotificationStatuses1788800000000 implements MigrationInterface {
  name = 'BackfillFutureLessonNotificationStatuses1788800000000';

  private async candidates(
    queryRunner: QueryRunner,
    cutoff: string,
  ): Promise<Candidate[]> {
    return queryRunner.query(
      `
      SELECT DISTINCT l.id lessonId, s.id studentId, s.customer_id customerId,
        c.locationId, p.type programType
      FROM lesson l
      JOIN course c ON c.id = l.courseId
      JOIN location loc ON loc.id = c.locationId AND loc.isDeleted = 0
      JOIN program p ON p.id = c.programId
      JOIN enrolment e ON e.courseId = c.id
      JOIN student s ON s.id = e.studentId
      WHERE l.date > ? AND l.status IN (1, 2) AND l.type = 1
        AND l.isDeleted = 0 AND l.isConfirmed = 1
        AND c.type = 1 AND c.isDeleted = 0 AND c.isConfirmed = 1
        AND e.isDeleted = 0 AND e.isConfirmed = 1 AND s.isDeleted = 0
        AND p.type IN (1, 2)
        AND (p.type = 1 OR DATE(e.endDateTime) >= DATE(?))
        AND EXISTS (SELECT 1 FROM customer_email_notification n
          WHERE n.userId = s.customer_id AND n.isChecked = 1
            AND n.emailNotificationTypeId IN (1, 2, 3, 4))
      ORDER BY l.id, s.id
    `,
      [cutoff, cutoff],
    ) as Promise<Candidate[]>;
  }

  private async missing(
    queryRunner: QueryRunner,
    candidates: Candidate[],
    locking = false,
  ): Promise<MissingStatus[]> {
    const missing: MissingStatus[] = [];
    for (const programType of [1, 2]) {
      const matching = candidates.filter(
        (row) => Number(row.programType) === programType,
      );
      const ids = [...new Set(matching.map((row) => row.lessonId))];
      if (!ids.length) continue;
      const table =
        programType === 1
          ? 'private_lesson_email_status'
          : 'group_lesson_email_status';
      const rows = (await queryRunner.query(
        `SELECT lessonId, ${programType === 1 ? '0 studentId' : 'studentId'}, notificationType
         FROM ${table} WHERE lessonId IN (${ids.map(() => '?').join(',')})${locking ? ' FOR UPDATE' : ''}`,
        ids,
      )) as Array<{
        lessonId: number;
        studentId: number;
        notificationType: number;
      }>;
      const key = (lessonId: number, studentId: number, type: number) =>
        `${lessonId}:${programType === 1 ? 0 : studentId}:${type}`;
      // Presence is enough: neither pending nor sent records may be overwritten.
      const existing = new Set(
        rows.map((row) =>
          key(row.lessonId, row.studentId, row.notificationType),
        ),
      );
      for (const candidate of matching) {
        for (const notificationType of [1, 2, 3, 4]) {
          const statusKey = key(
            candidate.lessonId,
            candidate.studentId,
            notificationType,
          );
          if (existing.has(statusKey)) continue;
          existing.add(statusKey);
          missing.push({ ...candidate, notificationType });
        }
      }
    }
    return missing;
  }

  /** Read-only preflight; deliberately separate from up() for dump verification. */
  public async preview(queryRunner: QueryRunner, now = new Date()) {
    const cutoff = futureNotificationCutoff(now);
    const candidates = await this.candidates(queryRunner, cutoff);
    const ids = [...new Set(candidates.map((row) => row.lessonId))];
    const missing: MissingStatus[] = [];
    for (let offset = 0; offset < ids.length; offset += 500) {
      const batch = new Set(ids.slice(offset, offset + 500));
      missing.push(
        ...(await this.missing(
          queryRunner,
          candidates.filter((row) => batch.has(row.lessonId)),
        )),
      );
    }
    const customers = new Map<
      string,
      { locationId: number; customerId: number; missingRecords: number }
    >();
    for (const row of missing) {
      const key = `${row.locationId}:${row.customerId}`;
      const group = customers.get(key) ?? {
        locationId: row.locationId,
        customerId: row.customerId,
        missingRecords: 0,
      };
      group.missingRecords++;
      customers.set(key, group);
    }
    return {
      cutoffEasternExclusive: cutoff,
      missingRecords: missing.length,
      customers: [...customers.values()],
    };
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) {
      throw new Error(
        'SMW-1642 notification backfill requires a migration transaction',
      );
    }
    const cutoff = futureNotificationCutoff();
    const candidates = await this.candidates(queryRunner, cutoff);
    const ids = [...new Set(candidates.map((row) => row.lessonId))].sort(
      (a, b) => a - b,
    );
    for (let offset = 0; offset < ids.length; offset += 500) {
      const batch = ids.slice(offset, offset + 500);
      // Creation/confirmation also owns the lesson row. Current reads below
      // preserve any statuses inserted by a concurrent application transaction.
      const eligible = (await queryRunner.query(
        `SELECT id FROM lesson WHERE id IN (${batch.map(() => '?').join(',')})
         AND date > ? AND status IN (1, 2) AND type = 1 AND isDeleted = 0 AND isConfirmed = 1
         ORDER BY id FOR UPDATE`,
        [...batch, cutoff],
      )) as Array<{ id: number }>;
      const locked = new Set(eligible.map((row) => row.id));
      const missing = await this.missing(
        queryRunner,
        candidates.filter((row) => locked.has(row.lessonId)),
        true,
      );
      for (const programType of [1, 2]) {
        const rows = missing.filter(
          (row) => Number(row.programType) === programType,
        );
        if (!rows.length) continue;
        const table =
          programType === 1
            ? 'private_lesson_email_status'
            : 'group_lesson_email_status';
        const columns =
          programType === 1
            ? 'lessonId,notificationType,status'
            : 'lessonId,studentId,notificationType,status';
        const values = rows.map((row) =>
          programType === 1
            ? [row.lessonId, row.notificationType, 0]
            : [row.lessonId, row.studentId, row.notificationType, 0],
        );
        await queryRunner.query(
          `INSERT INTO ${table} (${columns}) VALUES ${values.map((row) => `(${row.map(() => '?').join(',')})`).join(',')}`,
          values.flat(),
        );
      }
    }
  }

  public async down(): Promise<void> {
    // Intentionally retained: deleting these records could erase subsequent
    // sent history or cause reminders to be missed again after an app rollback.
  }
}
