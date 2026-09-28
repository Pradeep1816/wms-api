import { CronLockService } from './cron-lock.service';

describe('CronLockService', () => {
  function createLogger() {
    return {
      warn: vi.fn(),
      error: vi.fn(),
    };
  }

  it('reuses an in-flight run for the same lock in the same process', async () => {
    const service = new CronLockService({
      options: { type: 'sqlite' },
    } as any);
    const logger = createLogger();
    let releaseRun: (() => void) | null = null;
    const runGate = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });
    const run = vi.fn(async () => {
      await runGate;
      return { completed: true };
    });

    const firstRun = service.runWithLock('cron:test-job', 'test-job', logger as any, run);
    const secondRun = service.runWithLock('cron:test-job', 'test-job', logger as any, run);

    expect(run).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      '[test-job] trigger ignored because a run is already in progress',
    );

    releaseRun?.();
    const [firstResult, secondResult] = await Promise.all([firstRun, secondRun]);

    expect(firstResult).toEqual({ completed: true });
    expect(secondResult).toEqual(firstResult);
  });

  it('skips the run when another MySQL connection holds the advisory lock', async () => {
    const queryRunner = {
      isReleased: false,
      connect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([{ lockStatus: 0 }]),
      release: vi.fn().mockImplementation(async () => {
        queryRunner.isReleased = true;
      }),
    };
    const service = new CronLockService({
      options: { type: 'mysql' },
      createQueryRunner: vi.fn(() => queryRunner),
    } as any);
    const logger = createLogger();
    const run = vi.fn();

    const result = await service.runWithLock('cron:test-job', 'test-job', logger as any, run);

    expect(result).toBeNull();
    expect(run).not.toHaveBeenCalled();
    expect(queryRunner.query).toHaveBeenCalledWith('SELECT GET_LOCK(?, 0) AS lockStatus', [
      'cron:test-job',
    ]);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      '[test-job] trigger ignored because another instance already holds the distributed lock',
    );
  });

  it('releases the MySQL advisory lock after a completed run', async () => {
    const queryRunner = {
      isReleased: false,
      connect: vi.fn().mockResolvedValue(undefined),
      query: vi
        .fn()
        .mockResolvedValueOnce([{ lockStatus: 1 }])
        .mockResolvedValueOnce([{ releaseStatus: 1 }]),
      release: vi.fn().mockImplementation(async () => {
        queryRunner.isReleased = true;
      }),
    };
    const service = new CronLockService({
      options: { type: 'mysql' },
      createQueryRunner: vi.fn(() => queryRunner),
    } as any);
    const logger = createLogger();

    const result = await service.runWithLock('cron:test-job', 'test-job', logger as any, async () => ({
      completed: true,
    }));

    expect(result).toEqual({ completed: true });
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      'SELECT GET_LOCK(?, 0) AS lockStatus',
      ['cron:test-job'],
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(2, 'SELECT RELEASE_LOCK(?)', [
      'cron:test-job',
    ]);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });
});
