import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { BOT_USER_ID } from '../../shared/helpers/system-user.helper';
import { CustomerBalanceRecalculatorService } from '../../shared/services/customer-balance-recalculator.service';
import {
  addMonthsNoOverflow,
  calculateNextPaymentDate,
  getCurrentESTDate,
} from '../../utils/date-utils';
import {
  RecurringPaymentCreateCandidate,
  RecurringPaymentCreateCronLocation,
  RecurringPaymentCreateCronRepository,
} from '../repositories/recurring-payment-create-cron.repository';
import { CronLockService } from './cron-lock.service';
import { RoyaltyLedgerService } from '../../payment/services/royalty-ledger.service';
import { resolveCategoryRoyaltySnapshot } from '../../utils/royality/royalty-calculation.util';
import { RoundingUtils } from '../../utils/rounding.utils';
import { ItemCategory } from '../../item/entities/item-category.entity';
import {
  RoyaltyTransactionEventType,
  RoyaltyTransactionSourceType,
} from '../../payment/enums/royalty-transaction.enum';
import { isRoyaltyEligiblePaymentMethod } from '../../payment/utils/royalty-payment-method.util';

export interface RecurringPaymentCreateCronResult {
  jobName: string;
  triggeredBy: 'scheduler' | 'manual';
  triggeredByUserId: number | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  locationsProcessed: number;
  recurringPaymentsMatched: number;
  paymentsCreated: number;
  recurringPaymentsSkippedExisting: number;
  recurringPaymentsSkippedExpired: number;
  lessonPaymentsCreated: number;
  lessonsPaid: number;
  amountApplied: number;
  unappliedPaymentAmount: number;
  recurringPaymentsFailed: number;
}

type RecurringPaymentCreateCronCounts = Omit<
  RecurringPaymentCreateCronResult,
  | 'jobName'
  | 'triggeredBy'
  | 'triggeredByUserId'
  | 'startedAt'
  | 'completedAt'
  | 'durationMs'
>;

@Injectable()
export class RecurringPaymentCreateCronService {
  private readonly logger = new Logger(RecurringPaymentCreateCronService.name);
  private readonly jobName = 'recurring-payment-create';
  private readonly cronExpression = '0 10 3 * * *';
  private readonly timeZone = 'America/New_York';

  constructor(
    private readonly dataSource: DataSource,
    private readonly repository: RecurringPaymentCreateCronRepository,
    private readonly customerBalanceRecalculatorService: CustomerBalanceRecalculatorService,
    private readonly cronLockService: CronLockService,
    private readonly royaltyLedgerService: RoyaltyLedgerService,
  ) {}

  @Cron('0 10 3 * * *', {
    name: 'recurring-payment-create',
    timeZone: 'America/New_York',
  })
  async runScheduled(): Promise<RecurringPaymentCreateCronResult | null> {
    return await this.run('scheduler', null);
  }

  async runManually(
    triggeredByUserId: number,
  ): Promise<RecurringPaymentCreateCronResult | null> {
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
  ): Promise<RecurringPaymentCreateCronResult | null> {
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
  ): Promise<RecurringPaymentCreateCronResult | null> {
    const startedAtDate = new Date();

    this.logger.log(
      `[${this.jobName}] started via ${triggeredBy}${triggeredByUserId ? ` by user ${triggeredByUserId}` : ''}`,
    );

    const counts: RecurringPaymentCreateCronCounts = {
      locationsProcessed: 0,
      recurringPaymentsMatched: 0,
      paymentsCreated: 0,
      recurringPaymentsSkippedExisting: 0,
      recurringPaymentsSkippedExpired: 0,
      lessonPaymentsCreated: 0,
      lessonsPaid: 0,
      amountApplied: 0,
      unappliedPaymentAmount: 0,
      recurringPaymentsFailed: 0,
    };

    try {
      const currentDate = this.getCurrentDateKey();
      const locations = await this.repository.getCronEnabledLocations();

      for (const location of locations) {
        await this.processLocation(location, currentDate, counts);
      }

      const completedAtDate = new Date();
      const result: RecurringPaymentCreateCronResult = {
        jobName: this.jobName,
        triggeredBy,
        triggeredByUserId,
        startedAt: startedAtDate.toISOString(),
        completedAt: completedAtDate.toISOString(),
        durationMs: completedAtDate.getTime() - startedAtDate.getTime(),
        ...counts,
        amountApplied: this.roundToTwo(counts.amountApplied),
        unappliedPaymentAmount: this.roundToTwo(counts.unappliedPaymentAmount),
      };

      this.logger.log(
        `[${this.jobName}] completed in ${result.durationMs}ms. Locations=${result.locationsProcessed}, Matched=${result.recurringPaymentsMatched}, PaymentsCreated=${result.paymentsCreated}, LessonPayments=${result.lessonPaymentsCreated}, AmountApplied=${result.amountApplied}, Unapplied=${result.unappliedPaymentAmount}, Failed=${result.recurringPaymentsFailed}`,
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
    location: RecurringPaymentCreateCronLocation,
    currentDate: string,
    counts: RecurringPaymentCreateCronCounts,
  ): Promise<void> {
    const recurringPayments = await this.repository.getDueRecurringPayments(
      location.id,
      currentDate,
    );
    counts.recurringPaymentsMatched += recurringPayments.length;
    let recurringPaymentsFailedForLocation = 0;

    for (const recurringPayment of recurringPayments) {
      try {
        await this.processRecurringPayment(
          location,
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
    location: RecurringPaymentCreateCronLocation,
    recurringPayment: RecurringPaymentCreateCandidate,
    currentDate: string,
    counts: RecurringPaymentCreateCronCounts,
  ): Promise<void> {
    const nextPaymentDate = calculateNextPaymentDate(
      recurringPayment.paymentDay,
      recurringPayment.nextEntryDay,
    );
    const startDate = this.getPreviousRecordedPaymentWindowStart(
      currentDate,
      recurringPayment.paymentFrequencyId,
    );
    const endDate = currentDate;

    const result = await this.dataSource.transaction(async (manager) => {
      const processResult = await this.repository.processRecurringPayment(
        recurringPayment,
        currentDate,
        nextPaymentDate,
        startDate,
        endDate,
        BOT_USER_ID,
        manager,
      );

      if (
        processResult.paymentCreated &&
        processResult.paymentId &&
        isRoyaltyEligiblePaymentMethod(recurringPayment.paymentMethodId)
      ) {
        const lessonRoyalty = await resolveCategoryRoyaltySnapshot(
          manager,
          location.id,
          ItemCategory.CATEGORY_LESSON,
        );
        const recognition =
          await this.royaltyLedgerService.recordPaymentRecognition(manager, {
            paymentId: processResult.paymentId,
            locationId: location.id,
            customerId: recurringPayment.customerId,
            itemCategoryId: lessonRoyalty.categoryId,
            categoryName: lessonRoyalty.categoryName,
            rateApplied: lessonRoyalty.rate,
            advertisementRateApplied: lessonRoyalty.advertisementRate,
            paymentAmount: recurringPayment.amount,
            revenueAmount: recurringPayment.amount,
            taxAmount: 0,
            effectiveDate: new Date(`${nextPaymentDate}T00:00:00.000Z`),
            sourceType: RoyaltyTransactionSourceType.RECURRING_PAYMENT,
            sourceId: recurringPayment.id,
            purposeKey: `recurring:${recurringPayment.id}`,
            createdByUserId: BOT_USER_ID,
          });
        if (processResult.amountApplied > 0) {
          await this.royaltyLedgerService.recordEvent(manager, {
            paymentId: processResult.paymentId,
            originalPaymentId: processResult.paymentId,
            locationId: location.id,
            customerId: recurringPayment.customerId,
            itemCategoryId: lessonRoyalty.categoryId,
            categoryName: lessonRoyalty.categoryName,
            rateApplied: lessonRoyalty.rate,
            advertisementRateApplied: lessonRoyalty.advertisementRate,
            paymentAmount: -processResult.amountApplied,
            revenueAmount: -processResult.amountApplied,
            taxAmount: 0,
            royaltyAmount: 0,
            eventType: RoyaltyTransactionEventType.ALLOCATION,
            effectiveDate: new Date(`${nextPaymentDate}T00:00:00.000Z`),
            sourceType: RoyaltyTransactionSourceType.RECURRING_PAYMENT,
            sourceId: recurringPayment.id,
            relatedRoyaltyTransactionId: recognition.id,
            eventGroupId: `recurring-allocation:${recurringPayment.id}:${processResult.paymentId}`,
            idempotencyKey: `royalty:recurring:${recurringPayment.id}:payment:${processResult.paymentId}:initial-allocation`,
            reason: 'Recurring payment applied to lessons when received',
            createdByUserId: BOT_USER_ID,
          });
        }
      }

      return processResult;
    });

    if (!result.paymentCreated) {
      if (recurringPayment.expiryDate < nextPaymentDate) {
        counts.recurringPaymentsSkippedExpired += 1;
      } else {
        counts.recurringPaymentsSkippedExisting += 1;
      }
      return;
    }

    counts.paymentsCreated += 1;
    counts.lessonsPaid += result.lessonsPaid;
    counts.lessonPaymentsCreated += result.lessonPaymentsCreated;
    counts.amountApplied = this.roundToTwo(
      counts.amountApplied + result.amountApplied,
    );
    counts.unappliedPaymentAmount = this.roundToTwo(
      counts.unappliedPaymentAmount + result.remainingPaymentAmount,
    );

    await this.customerBalanceRecalculatorService.recalculateAndPersist(
      recurringPayment.customerId,
      {
        locationSlug: location.slug,
        updatedByUserId: BOT_USER_ID,
      },
    );
  }

  private getCurrentDateKey(): string {
    return (
      process.env.SMW_TEST_CURRENT_DATE ||
      this.formatDateKey(getCurrentESTDate())
    ).slice(0, 10);
  }

  private getPreviousRecordedPaymentWindowStart(
    currentDate: string,
    paymentFrequencyId: number,
  ): string {
    const monthsToSubtract = Math.max(paymentFrequencyId - 1, 0);
    const shiftedDate = addMonthsNoOverflow(currentDate, -monthsToSubtract);
    return `${shiftedDate.slice(0, 7)}-01`;
  }

  private formatDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private roundToTwo(value: number): number {
    return RoundingUtils.roundDecimal(value || 0, 2);
  }
}
