import { describe, expect, it, vi } from 'vitest';
import {
  ensureGroupLessonEmailStatuses,
  ensurePrivateLessonEmailStatuses,
} from './ensure-lesson-email-statuses';

export function statusStore(initial: Array<Record<string, number>> = []) {
  const rows = initial.map((row) => ({ ...row }));
  const repository = {
    find: vi.fn(async () => rows.map((row) => ({ ...row }))),
    insert: vi.fn(async (inserts: Array<Record<string, number>>) => {
      rows.push(...inserts.map((row) => ({ ...row })));
      return { identifiers: [] };
    }),
  };
  return { rows, repository };
}

describe('lesson notification initialization', () => {
  it('fills a partial private set and preserves sent flags across repeat calls', async () => {
    const { rows, repository } = statusStore([
      { lessonId: 10, notificationType: 1, status: 0 },
      { lessonId: 10, notificationType: 4, status: 1 },
    ]);
    await ensurePrivateLessonEmailStatuses(repository as any, [10, 10, 11]);
    await ensurePrivateLessonEmailStatuses(repository as any, [10, 11]);
    expect(rows).toHaveLength(8);
    expect(repository.insert).toHaveBeenCalledTimes(1);
    expect(
      rows.find((row) => row.lessonId === 10 && row.notificationType === 4)
        ?.status,
    ).toBe(1);
    expect(rows.filter((row) => row.lessonId === 11)).toEqual(
      [1, 2, 3, 4].map((notificationType) => ({
        lessonId: 11,
        notificationType,
        status: 0,
      })),
    );
  });

  it('keeps group students independent and does not reset a recipient already sent', async () => {
    const { rows, repository } = statusStore([
      { lessonId: 20, studentId: 100, notificationType: 4, status: 1 },
    ]);
    await ensureGroupLessonEmailStatuses(
      repository as any,
      20,
      [100, 101, 101],
    );
    await ensureGroupLessonEmailStatuses(repository as any, 20, [100, 101]);
    expect(rows).toHaveLength(8);
    expect(repository.insert).toHaveBeenCalledTimes(1);
    expect(
      rows.find((row) => row.studentId === 100 && row.notificationType === 4)
        ?.status,
    ).toBe(1);
    expect(
      rows.find((row) => row.studentId === 101 && row.notificationType === 4)
        ?.status,
    ).toBe(0);
  });

  it('does no database work for empty lesson or student lists', async () => {
    const { repository } = statusStore();
    await ensurePrivateLessonEmailStatuses(repository as any, []);
    await ensureGroupLessonEmailStatuses(repository as any, 10, []);
    expect(repository.find).not.toHaveBeenCalled();
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('propagates insertion failures so the owning transaction can roll back', async () => {
    const { repository } = statusStore();
    repository.insert.mockRejectedValueOnce(new Error('write failed'));
    await expect(
      ensurePrivateLessonEmailStatuses(repository as any, [10]),
    ).rejects.toThrow('write failed');
  });
});
