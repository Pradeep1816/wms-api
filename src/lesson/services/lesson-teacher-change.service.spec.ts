import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LessonTeacherChangeService } from './lesson-teacher-change.service';
import { Lesson } from '../entities/lesson.entity';

function createRepositoryMock() {
  return {
    runInTransaction: vi.fn(),
  };
}

describe('LessonTeacherChangeService', () => {
  let service: LessonTeacherChangeService;
  let repository: ReturnType<typeof createRepositoryMock>;

  beforeEach(() => {
    repository = createRepositoryMock();
    service = new LessonTeacherChangeService(repository as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('wraps bulk teacher changes in a single repository transaction', async () => {
    const txManager = {};
    repository.runInTransaction.mockImplementation(async (callback: any) => callback(txManager));

    const confirmSpy = vi
      .spyOn(service as any, 'confirmEnrolmentTeacherChange')
      .mockResolvedValue(undefined);

    await service.confirmTeacherChangeForEnrolments(
      [11, 12],
      77,
      '2026-06-01',
      3,
      7001,
    );

    expect(repository.runInTransaction).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenNthCalledWith(
      1,
      11,
      77,
      '2026-06-01',
      3,
      7001,
      txManager,
    );
    expect(confirmSpy).toHaveBeenNthCalledWith(
      2,
      12,
      77,
      '2026-06-01',
      3,
      7001,
      txManager,
    );
  });

  it('does not open a transaction for an empty enrolment list', async () => {
    await service.confirmTeacherChangeForEnrolments(
      [],
      77,
      '2026-06-01',
      3,
      7001,
    );

    expect(repository.runInTransaction).not.toHaveBeenCalled();
  });

  it('uses lesson entity rounding for private lesson financials', () => {
    const lesson = Object.assign(new Lesson(), {
      duration: '01:00:00',
      programRate: 0.145,
      tax: 0,
    });

    const financials = (service as any).calculatePrivateLessonFinancials(
      lesson,
      [],
      0,
    );

    expect(financials.total).toBe(0.15);
    expect(financials.balance).toBe(0.15);
  });
});
