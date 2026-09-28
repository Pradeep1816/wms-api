import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CustomerStatusCronRepository, CustomerStatusSyncCounts } from '../repositories/customer-status-cron.repository';
import { isProd } from 'src/utils/env';
import { CronLockService } from './cron-lock.service';

export interface CustomerStatusCronResult extends CustomerStatusSyncCounts {
  jobName: string;
  triggeredBy: 'scheduler' | 'manual';
  triggeredByUserId: number | null;
  skipped: boolean;
  reason: string | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

@Injectable()
export class CustomerStatusCronService {
  private readonly logger = new Logger(CustomerStatusCronService.name);
  private readonly jobName = 'customer-set-status';
  private readonly cronExpression = '0 0 2 * * *';
  private readonly timeZone = 'America/New_York';

  constructor(
    private readonly customerStatusCronRepository: CustomerStatusCronRepository,
    private readonly cronLockService: CronLockService,
  ) {}

  @Cron('0 0 2 * * *', {
    name: 'customer-set-status',
    timeZone: 'America/New_York',
  })
  async runScheduled(): Promise<CustomerStatusCronResult | null> {
    return this.run('scheduler', null);
  }

  async runManually(triggeredByUserId: number): Promise<CustomerStatusCronResult | null> {
    return this.run('manual', triggeredByUserId);
  }

  getJobMetadata() {
    return {
      name: this.jobName,
      enabled: true,
      expression: this.cronExpression,
      timeZone: this.timeZone,
      manualTriggerAllowed: true,
      allowedRoles: ['administrator'],
    };
  }

  private async run(
    triggeredBy: 'scheduler' | 'manual',
    triggeredByUserId: number | null,
  ): Promise<CustomerStatusCronResult | null> {
    return this.cronLockService.runWithLock(
      `cron:${this.jobName}`,
      this.jobName,
      this.logger,
      () => this.executeRun(triggeredBy, triggeredByUserId),
    );
  }

  private async executeRun(
    triggeredBy: 'scheduler' | 'manual',
    triggeredByUserId: number | null,
  ): Promise<CustomerStatusCronResult | null> {
    // if(isProd()){
    //   return null;
    // }
    const startedAtDate = new Date();

    try {
      this.logger.log(
        `[${this.jobName}] started via ${triggeredBy}${triggeredByUserId ? ` by user ${triggeredByUserId}` : ''}`,
      );

      const counts = await this.customerStatusCronRepository.getTargetCounts();
      await this.customerStatusCronRepository.updateActiveCustomers();
      await this.customerStatusCronRepository.updateInactiveCustomers();

      const result = this.buildResult(
        counts,
        triggeredBy,
        triggeredByUserId,
        startedAtDate,
        false,
        null,
      );

      this.logger.log(
        `[${this.jobName}] completed in ${result.durationMs}ms. Active=${result.activeCustomers}, Inactive=${result.inactiveCustomers}, Total=${result.totalCustomers}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `[${this.jobName}] failed`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private buildResult(
    counts: CustomerStatusSyncCounts,
    triggeredBy: 'scheduler' | 'manual',
    triggeredByUserId: number | null,
    startedAtDate: Date,
    skipped: boolean,
    reason: string | null,
  ): CustomerStatusCronResult {
    const completedAtDate = new Date();

    return {
      jobName: this.jobName,
      triggeredBy,
      triggeredByUserId,
      skipped,
      reason,
      startedAt: startedAtDate.toISOString(),
      completedAt: completedAtDate.toISOString(),
      durationMs: completedAtDate.getTime() - startedAtDate.getTime(),
      ...counts,
    };
  }
}
