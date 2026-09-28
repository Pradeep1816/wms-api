import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CustomerBalanceRecalculatorService } from '../../shared/services/customer-balance-recalculator.service';
import { BOT_USER_ID } from '../../shared/helpers/system-user.helper';
import { isProd } from 'src/utils/env';
import {
  CustomerBalanceCronCounts,
  CustomerBalanceCronRepository,
} from '../repositories/customer-balance-cron.repository';
import { CronLockService } from './cron-lock.service';

export interface CustomerBalanceCronResult extends CustomerBalanceCronCounts {
  jobName: string;
  triggeredBy: 'scheduler' | 'manual';
  triggeredByUserId: number | null;
  skipped: boolean;
  reason: string | null;
  processedCustomers: number;
  failedCustomers: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

@Injectable()
export class CustomerBalanceCronService {
  private readonly logger = new Logger(CustomerBalanceCronService.name);
  private readonly jobName = 'customer-update-balance';
  private readonly cronExpression = '0 0 8 * * *';
  private readonly timeZone = 'America/New_York';
  private readonly batchSize = 100;

  constructor(
    private readonly customerBalanceCronRepository: CustomerBalanceCronRepository,
    private readonly customerBalanceRecalculatorService: CustomerBalanceRecalculatorService,
    private readonly cronLockService: CronLockService,
  ) {}

  @Cron('0 0 8 * * *', {
    name: 'customer-update-balance',
    timeZone: 'America/New_York',
  })
  async runScheduled(): Promise<CustomerBalanceCronResult | null> {
    return this.run('scheduler', null);
  }

  async runManually(
    triggeredByUserId: number,
  ): Promise<CustomerBalanceCronResult | null> {
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
  ): Promise<CustomerBalanceCronResult | null> {
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
  ): Promise<CustomerBalanceCronResult | null> {
    // if (isProd()) {
    //   return null;
    // }

    const startedAtDate = new Date();

    try {
      this.logger.log(
        `[${this.jobName}] started via ${triggeredBy}${triggeredByUserId ? ` by user ${triggeredByUserId}` : ''}`,
      );

      const counts = await this.customerBalanceCronRepository.getTargetCounts();
      const { processedCustomers, failedCustomers } =
        await this.recalculateInBatches(BOT_USER_ID);

      const result = this.buildResult(
        counts,
        processedCustomers,
        failedCustomers,
        triggeredBy,
        triggeredByUserId,
        startedAtDate,
        false,
        null,
      );

      this.logger.log(
        `[${this.jobName}] completed in ${result.durationMs}ms. Processed=${result.processedCustomers}, Failed=${result.failedCustomers}, Total=${result.totalCustomers}, WithAccounts=${result.customersWithAccounts}, WithoutAccounts=${result.customersWithoutAccounts}`,
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

  private async recalculateInBatches(
    botUserId: number,
  ): Promise<{ processedCustomers: number; failedCustomers: number }> {
    let processedCustomers = 0;
    let failedCustomers = 0;
    let lastProcessedId: number | null = null;

    while (true) {
      const customerIds =
        await this.customerBalanceCronRepository.getTargetCustomerIds(
          lastProcessedId,
          this.batchSize,
        );

      if (customerIds.length === 0) {
        break;
      }

      for (const customerId of customerIds) {
        try {
          await this.customerBalanceRecalculatorService.recalculateAndPersist(
            customerId,
            {
              updatedByUserId: botUserId,
            },
          );
          processedCustomers++;
        } catch (error) {
          failedCustomers++;
          this.logger.error(
            `[${this.jobName}] failed to recalculate balance for customer ${customerId}`,
            error instanceof Error ? error.stack : undefined,
          );
        }
        lastProcessedId = customerId;
      }
    }

    return { processedCustomers, failedCustomers };
  }

  private buildResult(
    counts: CustomerBalanceCronCounts,
    processedCustomers: number,
    failedCustomers: number,
    triggeredBy: 'scheduler' | 'manual',
    triggeredByUserId: number | null,
    startedAtDate: Date,
    skipped: boolean,
    reason: string | null,
  ): CustomerBalanceCronResult {
    const completedAtDate = new Date();

    return {
      jobName: this.jobName,
      triggeredBy,
      triggeredByUserId,
      skipped,
      reason,
      processedCustomers,
      failedCustomers,
      startedAt: startedAtDate.toISOString(),
      completedAt: completedAtDate.toISOString(),
      durationMs: completedAtDate.getTime() - startedAtDate.getTime(),
      ...counts,
    };
  }
}
