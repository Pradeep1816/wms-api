/* eslint-disable @typescript-eslint/no-unsafe-assignment,
  @typescript-eslint/no-unsafe-call,
  @typescript-eslint/no-unsafe-member-access,
  @typescript-eslint/no-unsafe-return,
  @typescript-eslint/require-await */
import { describe, expect, it, vi } from 'vitest';
import { PermanentScheduleChangeDraftService } from './permanent-schedule-change-draft.service';

describe('PermanentScheduleChangeDraftService transaction', () => {
  const draftArguments = [
    { id: 20 },
    { id: 10 },
    new Date('2026-02-01T00:00:00.000Z'),
    601,
    1,
    '16:00:00',
    '00:30',
    new Date('2026-02-02T00:00:00.000Z'),
    7001,
  ] as const;

  it('runs draft deletion and regeneration in one transaction', async () => {
    const service: any = Object.create(
      PermanentScheduleChangeDraftService.prototype,
    );
    const persistence = { id: 'transaction-persistence' };
    const repository = {
      transaction: vi.fn(async (callback: (value: object) => unknown) =>
        callback(persistence),
      ),
      updateStudentAndUserStatus: vi.fn(),
    };
    const expectedDate = new Date('2026-06-01T00:00:00.000Z');

    service.repository = repository;
    service.regenerateLessonsForReschedule = vi
      .fn()
      .mockResolvedValue(expectedDate);
    await expect(service.replaceDraft(...draftArguments)).resolves.toBe(
      expectedDate,
    );
    expect(repository.transaction).toHaveBeenCalledTimes(1);
    expect(service.regenerateLessonsForReschedule).toHaveBeenCalledWith(
      ...draftArguments,
      persistence,
    );
    expect(repository.updateStudentAndUserStatus).toHaveBeenCalledWith(
      draftArguments[0],
    );
  });

  it('propagates draft-generation failure so TypeORM rolls back', async () => {
    const service: any = Object.create(
      PermanentScheduleChangeDraftService.prototype,
    );
    const failure = new Error('private lesson insert failed');
    service.repository = {
      transaction: vi.fn(async (callback: (value: object) => unknown) =>
        callback({ id: 'transaction-persistence' }),
      ),
    };
    service.regenerateLessonsForReschedule = vi.fn().mockRejectedValue(failure);

    await expect(service.replaceDraft(...draftArguments)).rejects.toBe(failure);
  });

  it('locks and revalidates before deleting the previous draft', async () => {
    const service: any = Object.create(
      PermanentScheduleChangeDraftService.prototype,
    );
    const order: string[] = [];
    const persistence = {
      lockCourse: vi.fn(async () => {
        order.push('lock');
      }),
      getMonthConstraintCounts: vi.fn().mockResolvedValue({
        lessonsToChange: 1,
        invoicedLessons: 0,
      }),
      deleteUnconfirmedLessons: vi.fn(async () => {
        order.push('delete');
      }),
      findRescheduledLessons: vi.fn().mockResolvedValue([]),
      findEligibleLessons: vi.fn().mockResolvedValue([]),
      findLastLessonBefore: vi.fn().mockResolvedValue({
        date: new Date('2026-01-26T00:00:00.000Z'),
      }),
      createLesson: vi.fn((value) => value),
    };
    const endDate = new Date('2026-06-01T00:00:00.000Z');

    service.validator = {
      validateMonthConstraints: vi.fn(async (_courseId, _date, reader) => {
        await reader.getMonthConstraintCounts(10, draftArguments[2]);
        order.push('revalidate');
      }),
    };
    service.generateLessonsForReschedule = vi.fn().mockResolvedValue(endDate);

    await expect(
      service.regenerateLessonsForReschedule(
        { courseId: 10 },
        { id: 10, endDate },
        draftArguments[2],
        draftArguments[3],
        draftArguments[4],
        draftArguments[5],
        draftArguments[6],
        draftArguments[7],
        draftArguments[8],
        persistence,
      ),
    ).resolves.toEqual(endDate);

    expect(persistence.lockCourse).toHaveBeenCalledWith(10);
    expect(order.slice(0, 3)).toEqual(['lock', 'revalidate', 'delete']);
    expect(service.validator.validateMonthConstraints).toHaveBeenCalledWith(
      10,
      draftArguments[2],
      expect.objectContaining({
        getMonthConstraintCounts: expect.any(Function),
      }),
    );
    expect(persistence.getMonthConstraintCounts).toHaveBeenCalledWith(
      10,
      draftArguments[2],
    );
  });
});
