import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CustomerBalanceRecalculatorService } from '../../shared/services/customer-balance-recalculator.service';
import {
  EquipmentRentalCronCandidate,
  InvoiceEquipmentRentalsCronRepository,
} from '../repositories/invoice-equipment-rentals-cron.repository';
import { CronLockService } from './cron-lock.service';

export interface InvoiceEquipmentRentalsCronResult {
  jobName: string;
  triggeredBy: 'scheduler' | 'manual';
  triggeredByUserId: number | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  cronEnabledLocationsFound: number;
  rentalsScanned: number;
  ongoingRentalsMatched: number;
  ongoingInvoicesCreated: number;
  fixedRentalsMatched: number;
  fixedInvoicesCreated: number;
  lineItemsCreated: number;
  rentalsFailed: number;
}

@Injectable()
export class InvoiceEquipmentRentalsCronService {
  private readonly logger = new Logger(InvoiceEquipmentRentalsCronService.name);
  private readonly jobName = 'invoice-equipment-rentals';
  private readonly cronExpression = '0 * * * * *';
  private readonly timeZone = 'America/New_York';

  constructor(
    private readonly repository: InvoiceEquipmentRentalsCronRepository,
    private readonly customerBalanceRecalculatorService: CustomerBalanceRecalculatorService,
    private readonly cronLockService: CronLockService,
  ) {}

  @Cron('0 * * * * *', {
    name: 'invoice-equipment-rentals',
    timeZone: 'America/New_York',
  })
  async runScheduled(): Promise<InvoiceEquipmentRentalsCronResult | null> {
    return this.run('scheduler', null);
  }

  async runManually(
    triggeredByUserId: number,
  ): Promise<InvoiceEquipmentRentalsCronResult | null> {
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
  ): Promise<InvoiceEquipmentRentalsCronResult | null> {
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
  ): Promise<InvoiceEquipmentRentalsCronResult | null> {
    const startedAtDate = new Date();

    this.logger.log(
      `[${this.jobName}] started via ${triggeredBy}${triggeredByUserId ? ` by user ${triggeredByUserId}` : ''}`,
    );

    const counts: Omit<
      InvoiceEquipmentRentalsCronResult,
      | 'jobName'
      | 'triggeredBy'
      | 'triggeredByUserId'
      | 'startedAt'
      | 'completedAt'
      | 'durationMs'
    > = {
      cronEnabledLocationsFound: 0,
      rentalsScanned: 0,
      ongoingRentalsMatched: 0,
      ongoingInvoicesCreated: 0,
      fixedRentalsMatched: 0,
      fixedInvoicesCreated: 0,
      lineItemsCreated: 0,
      rentalsFailed: 0,
    };

    try {
      const [cronEnabledLocations, rentals] = await Promise.all([
        this.repository.getCronEnabledLocations(),
        this.repository.getEquipmentRentalsForCron(),
      ]);

      counts.cronEnabledLocationsFound = cronEnabledLocations.length;

      const currentDateYmd = this.getCurrentEasternYmd();

      for (const rental of rentals) {
        counts.rentalsScanned += 1;
        try {
          await this.processRental(rental, currentDateYmd, counts);
        } catch (error) {
          counts.rentalsFailed += 1;
          this.logger.error(
            `[${this.jobName}] failed to process equipment rental ${rental.id} for customer ${rental.customerId}`,
            error instanceof Error ? error.stack : undefined,
          );
          continue;
        }
      }

      const completedAtDate = new Date();
      const result: InvoiceEquipmentRentalsCronResult = {
        jobName: this.jobName,
        triggeredBy,
        triggeredByUserId,
        startedAt: startedAtDate.toISOString(),
        completedAt: completedAtDate.toISOString(),
        durationMs: completedAtDate.getTime() - startedAtDate.getTime(),
        ...counts,
      };

      this.logger.log(
        `[${this.jobName}] completed in ${result.durationMs}ms. CronEnabledLocations=${result.cronEnabledLocationsFound}, RentalsScanned=${result.rentalsScanned}, OngoingCreated=${result.ongoingInvoicesCreated}, FixedCreated=${result.fixedInvoicesCreated}, LineItemsCreated=${result.lineItemsCreated}, Failed=${result.rentalsFailed}`,
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

  private async processRental(
    rental: EquipmentRentalCronCandidate,
    currentDateYmd: string,
    counts: Omit<
      InvoiceEquipmentRentalsCronResult,
      | 'jobName'
      | 'triggeredBy'
      | 'triggeredByUserId'
      | 'startedAt'
      | 'completedAt'
      | 'durationMs'
    >,
  ): Promise<void> {
    const startDateYmd = this.toUtcYmd(rental.startDate);
    const returnDateYmd = this.toUtcYmd(rental.returnDate);

    if (rental.isOnGoing && returnDateYmd === null && startDateYmd) {
      const firstRentalInvoiceDate =
        await this.repository.getFirstRentalInvoiceDate(rental.id);
      const startDatePreviousMidMonth = firstRentalInvoiceDate
        ? this.getCurrentMonthMidpointYmd(currentDateYmd)
        : this.getStartDatePreviousMidMonthYmd(startDateYmd);

      if (startDatePreviousMidMonth <= currentDateYmd) {
        counts.ongoingRentalsMatched += 1;

        let invoiceDateYmd = startDateYmd;

        if (
          firstRentalInvoiceDate &&
          this.getMonthYear(firstRentalInvoiceDate) !==
            this.getMonthYearFromYmd(currentDateYmd)
        ) {
          invoiceDateYmd = this.getFirstDayOfNextMonthYmd(currentDateYmd);
        }

        const alreadyExists = await this.repository.hasRentalInvoiceOnDate(
          rental.id,
          invoiceDateYmd,
        );

        if (!alreadyExists) {
          const creationResult =
            await this.repository.createOngoingRentalInvoice(
              rental,
              invoiceDateYmd,
              !firstRentalInvoiceDate,
            );
          counts.ongoingInvoicesCreated += 1;
          counts.lineItemsCreated += creationResult.lineItemsCreated;
          await this.customerBalanceRecalculatorService.recalculateAndPersist(
            rental.customerId,
            {
              updatedByUserId: creationResult.botUserId,
            },
          );
        }
      }

      return;
    }

    if (!rental.isOnGoing && startDateYmd) {
      const previousRecordedInvoice = await this.repository.hasAnyRentalInvoice(
        rental.id,
      );
      if (previousRecordedInvoice) {
        return;
      }

      counts.fixedRentalsMatched += 1;

      const rentalStartMonth = this.getMonthNumber(startDateYmd);
      const createInvoiceMonth =
        this.getFixedTermCreateInvoiceMonth(currentDateYmd);

      // Intentionally preserves the legacy month-only comparison, including year-boundary quirks.
      if (rentalStartMonth < createInvoiceMonth) {
        const creationResult =
          await this.repository.createFixedTermRentalInvoice(
            rental,
            currentDateYmd,
          );
        counts.fixedInvoicesCreated += 1;
        counts.lineItemsCreated += creationResult.lineItemsCreated;
        await this.customerBalanceRecalculatorService.recalculateAndPersist(
          rental.customerId,
          {
            updatedByUserId: creationResult.botUserId,
          },
        );
      }
    }
  }

  private getCurrentEasternYmd(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  private toUtcYmd(date: Date | null | undefined): string | null {
    if (!date) {
      return null;
    }
    return new Date(date).toISOString().slice(0, 10);
  }

  private parseYmdAsUtc(ymd: string): Date {
    const [year, month, day] = ymd.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  private formatYmd(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private getStartDatePreviousMidMonthYmd(startDateYmd: string): string {
    const startDate = this.parseYmdAsUtc(startDateYmd);
    const startYear = startDate.getUTCFullYear();
    const startMonth = startDate.getUTCMonth();
    return this.formatYmd(new Date(Date.UTC(startYear, startMonth - 1, 15)));
  }

  private getFirstDayOfNextMonthYmd(currentDateYmd: string): string {
    const currentDate = this.parseYmdAsUtc(currentDateYmd);
    return this.formatYmd(
      new Date(
        Date.UTC(
          currentDate.getUTCFullYear(),
          currentDate.getUTCMonth() + 1,
          1,
        ),
      ),
    );
  }

  private getCurrentMonthMidpointYmd(currentDateYmd: string): string {
    const currentDate = this.parseYmdAsUtc(currentDateYmd);
    return this.formatYmd(
      new Date(
        Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), 15),
      ),
    );
  }

  private getMonthYear(date: Date): string {
    const parsed = new Date(date);
    return `${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${parsed.getUTCFullYear()}`;
  }

  private getMonthYearFromYmd(ymd: string): string {
    const [year, month] = ymd.split('-');
    return `${month}-${year}`;
  }

  private getMonthNumber(ymd: string): number {
    return Number(ymd.split('-')[1]);
  }

  private getFixedTermCreateInvoiceMonth(currentDateYmd: string): number {
    const currentDate = this.parseYmdAsUtc(currentDateYmd);
    const firstDayOfCurrentMonth = new Date(
      Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), 1),
    );
    const fourMonthsLater = new Date(
      Date.UTC(
        firstDayOfCurrentMonth.getUTCFullYear(),
        firstDayOfCurrentMonth.getUTCMonth() + 4,
        1,
      ),
    );
    return fourMonthsLater.getUTCMonth() + 1;
  }
}
