import { Injectable, Logger } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

type CronRun<T> = () => Promise<T | null>;

@Injectable()
export class CronLockService {
  private readonly internalLogger = new Logger(CronLockService.name);
  private readonly activeRuns = new Map<string, Promise<unknown>>();

  constructor(private readonly dataSource: DataSource) {}

  async runWithLock<T>(
    lockName: string,
    jobName: string,
    logger: Logger,
    run: CronRun<T>,
  ): Promise<T | null> {
    const activeRun = this.activeRuns.get(lockName) as Promise<T | null> | undefined;

    if (activeRun) {
      logger.warn(`[${jobName}] trigger ignored because a run is already in progress`);
      return activeRun;
    }

    const runPromise = this.runWithDistributedLock(lockName, jobName, logger, run).finally(() => {
      if (this.activeRuns.get(lockName) === runPromise) {
        this.activeRuns.delete(lockName);
      }
    });

    this.activeRuns.set(lockName, runPromise);
    return runPromise;
  }

  private async runWithDistributedLock<T>(
    lockName: string,
    jobName: string,
    logger: Logger,
    run: CronRun<T>,
  ): Promise<T | null> {
    const connectionType = this.dataSource.options.type;

    if (connectionType !== 'mysql' && connectionType !== 'mariadb') {
      return run();
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const rows = await queryRunner.query(`SELECT GET_LOCK(?, 0) AS lockStatus`, [lockName]);
      const lockStatus = Number(rows?.[0]?.lockStatus ?? 0);

      if (lockStatus !== 1) {
        await queryRunner.release();
        logger.warn(
          `[${jobName}] trigger ignored because another instance already holds the distributed lock`,
        );
        return null;
      }

      try {
        return await run();
      } finally {
        await this.releaseDistributedLock(queryRunner, lockName, jobName, logger);
      }
    } catch (error) {
      if (!queryRunner.isReleased) {
        await queryRunner.release();
      }
      throw error;
    }
  }

  private async releaseDistributedLock(
    queryRunner: QueryRunner,
    lockName: string,
    jobName: string,
    logger: Logger,
  ): Promise<void> {
    try {
      await queryRunner.query(`SELECT RELEASE_LOCK(?)`, [lockName]);
    } catch (error) {
      logger.error(
        `[${jobName}] failed to release distributed lock: ${this.getErrorMessage(error)}`,
      );
      this.internalLogger.error(
        `[${jobName}] failed to release distributed lock ${lockName}`,
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      if (!queryRunner.isReleased) {
        await queryRunner.release();
      }
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
