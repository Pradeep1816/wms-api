import { In, Repository } from 'typeorm';
import { PrivateLessonEmailStatus } from '../entities/private-lesson-email-status.entity';
import { GroupLessonEmailStatus } from '../entities/group-lesson-email-status.entity';

// These are the four types understood by EmailAutoEmailCronService.
export const LESSON_NOTIFICATION_TYPES = [1, 2, 3, 4] as const;

/**
 * Call with the repository from the lesson creation/confirmation transaction.
 * The caller owns the new lesson, or has updated/locked it in that transaction.
 * Never copy a replaced lesson's sent flags or reset an existing status.
 */
export async function ensurePrivateLessonEmailStatuses(
  repository: Repository<PrivateLessonEmailStatus>,
  lessonIds: number[],
): Promise<void> {
  const ids = [...new Set(lessonIds)];
  if (!ids.length) return;

  const existing = await repository.find({
    where: { lessonId: In(ids) },
    select: ['lessonId', 'notificationType'],
  });
  const keys = new Set(
    existing.map((row) => `${row.lessonId}:${row.notificationType}`),
  );
  const missing = ids.flatMap((lessonId) =>
    LESSON_NOTIFICATION_TYPES.filter(
      (notificationType) => !keys.has(`${lessonId}:${notificationType}`),
    ).map((notificationType) => ({ lessonId, notificationType, status: 0 })),
  );
  if (missing.length) await repository.insert(missing);
}

/** Same preservation rule, with a separate status for each group student. */
export async function ensureGroupLessonEmailStatuses(
  repository: Repository<GroupLessonEmailStatus>,
  lessonId: number,
  studentIds: number[],
): Promise<void> {
  const ids = [...new Set(studentIds)];
  if (!ids.length) return;

  const existing = await repository.find({
    where: { lessonId, studentId: In(ids) },
    select: ['studentId', 'notificationType'],
  });
  const keys = new Set(
    existing.map((row) => `${row.studentId}:${row.notificationType}`),
  );
  const missing = ids.flatMap((studentId) =>
    LESSON_NOTIFICATION_TYPES.filter(
      (notificationType) => !keys.has(`${studentId}:${notificationType}`),
    ).map((notificationType) => ({
      lessonId,
      studentId,
      notificationType,
      status: 0,
    })),
  );
  if (missing.length) await repository.insert(missing);
}
