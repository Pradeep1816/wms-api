import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { BOT_USER_ID } from '../../shared/helpers/system-user.helper';
import { getCurrentESTDate } from '../../utils/date-utils';
import {
  RecurringPaymentUpdateCandidate,
  RecurringPaymentUpdateCronLocation,
  RecurringPaymentUpdateCronRepository,
} from '../repositories/recurring-payment-update-cron.repository';
import { CronLockService } from './cron-lock.service';

export interface RecurringPaymentUpdateCronResult {
  jobName: string;
  triggeredBy: 'scheduler' | 'manual';
  triggeredByUserId: number | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  locationsProcessed: number;
  recurringPaymentsMatched: number;
  recurringPaymentsUpdated: number;
  recurringPaymentsSkippedInvalid: number;
  recurringPaymentsFailed: number;
}

type RecurringPaymentUpdateCronCounts = Omit<
  RecurringPaymentUpdateCronResult,
  | 'jobName'
  | 'triggeredBy'
  | 'triggeredByUserId'
  | 'startedAt'
  | 'completedAt'
  | 'durationMs'
>;

@Injectable()
export class RecurringPaymentUpdateCronService {
  private readonly logger = new Logger(RecurringPaymentUpdateCronService.name);
  private readonly jobName = 'recurring-payment-update-recurring-payments';
  private readonly cronExpression = '0 40 2 * * *';
  private readonly timeZone = 'America/New_York';

  constructor(
    private readonly dataSource: DataSource,
    private readonly repository: RecurringPaymentUpdateCronRepository,
    private readonly cronLockService: CronLockService,
  ) {}

  @Cron('0 40 2 * * *', {
    name: 'recurring-payment-update-recurring-payments',
    timeZone: 'America/New_York',
  })
  async runScheduled(): Promise<RecurringPaymentUpdateCronResult | null> {
    return await this.run('scheduler', null);
  }

  async runManually(
    triggeredByUserId: number,
  ): Promise<RecurringPaymentUpdateCronResult | null> {
    return await this.run('manual', triggeredByUserId);
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
  ): Promise<RecurringPaymentUpdateCronResult | null> {
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
  ): Promise<RecurringPaymentUpdateCronResult | null> {
    const startedAtDate = new Date();

    this.logger.log(
      `[${this.jobName}] started via ${triggeredBy}${triggeredByUserId ? ` by user ${triggeredByUserId}` : ''}`,
    );

    const counts: RecurringPaymentUpdateCronCounts = {
      locationsProcessed: 0,
      recurringPaymentsMatched: 0,
      recurringPaymentsUpdated: 0,
      recurringPaymentsSkippedInvalid: 0,
      recurringPaymentsFailed: 0,
    };

    try {
      const currentDate = this.getCurrentDateKey();
      const locations = await this.repository.getCronEnabledLocations();

      for (const location of locations) {
        await this.processLocation(location, currentDate, counts);
      }

      const completedAtDate = new Date();
      const result: RecurringPaymentUpdateCronResult = {
        jobName: this.jobName,
        triggeredBy,
        triggeredByUserId,
        startedAt: startedAtDate.toISOString(),
        completedAt: completedAtDate.toISOString(),
        durationMs: completedAtDate.getTime() - startedAtDate.getTime(),
        ...counts,
      };

      this.logger.log(
        `[${this.jobName}] completed in ${result.durationMs}ms. Locations=${result.locationsProcessed}, Matched=${result.recurringPaymentsMatched}, Updated=${result.recurringPaymentsUpdated}, SkippedInvalid=${result.recurringPaymentsSkippedInvalid}, Failed=${result.recurringPaymentsFailed}`,
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

  private async processLocation(
    location: RecurringPaymentUpdateCronLocation,
    currentDate: string,
    counts: RecurringPaymentUpdateCronCounts,
  ): Promise<void> {
    const recurringPayments =
      await this.repository.getOutdatedRecurringPayments(
        location.id,
        currentDate,
      );
    counts.recurringPaymentsMatched += recurringPayments.length;
    let recurringPaymentsFailedForLocation = 0;

    for (const recurringPayment of recurringPayments) {
      try {
        await this.processRecurringPayment(
          recurringPayment,
          currentDate,
          counts,
        );
      } catch (error) {
        counts.recurringPaymentsFailed += 1;
        recurringPaymentsFailedForLocation += 1;
        this.logger.error(
          `[${this.jobName}:${location.id}] failed to process recurring payment ${recurringPayment.id} for customer ${recurringPayment.customerId}`,
          error instanceof Error ? error.stack : undefined,
        );
        continue;
      }
    }

    counts.locationsProcessed += 1;
    this.logger.log(
      `[${this.jobName}:${location.id}] processed location "${location.name}" (${location.slug}). RecurringPayments=${recurringPayments.length}, Failed=${recurringPaymentsFailedForLocation}`,
    );
  }

  private async processRecurringPayment(
    recurringPayment: RecurringPaymentUpdateCandidate,
    currentDate: string,
    counts: RecurringPaymentUpdateCronCounts,
  ): Promise<void> {
    const result = await this.dataSource.transaction(async (manager) =>
      this.repository.processRecurringPaymentUpdate(
        recurringPayment,
        currentDate,
        BOT_USER_ID,
        manager,
      ),
    );

    if (result.updated) {
      counts.recurringPaymentsUpdated += 1;
      return;
    }

    if (result.skippedReason === 'invalid-payment-frequency') {
      counts.recurringPaymentsSkippedInvalid += 1;
    }
  }

  private getCurrentDateKey(): string {
    return (
      process.env.SMW_TEST_CURRENT_DATE ||
      this.formatDateKey(getCurrentESTDate())
    ).slice(0, 10);
  }

  private formatDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
