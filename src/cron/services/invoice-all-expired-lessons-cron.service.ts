import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BOT_USER_ID } from '../../shared/helpers/system-user.helper';
import { GeneratePrivateInvoiceDto } from '../../lesson/dto/generate-private-invoice.dto';
import { PrivateLessonInvoiceService } from '../../lesson/services/generate-invoice.service';
import {
  InvoiceAllExpiredLessonsCronLocation,
  InvoiceAllExpiredLessonsCronRepository,
} from '../repositories/invoice-all-expired-lessons-cron.repository';
import { CronLockService } from './cron-lock.service';

export interface InvoiceAllExpiredLessonsCronResult {
  jobName: string;
  triggeredBy: 'scheduler' | 'manual';
  triggeredByUserId: number | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  locationsProcessed: number;
  expiredLessonsMatched: number;
  expiredInvoicesCreated: number;
  expiredInvoicesAlreadyExisting: number;
}

@Injectable()
export class InvoiceAllExpiredLessonsCronService {
  private readonly logger = new Logger(InvoiceAllExpiredLessonsCronService.name);
  private readonly jobName = 'invoice-all-expired-lessons';
  private readonly cronExpression = '0 20 23 * * *';
  private readonly timeZone = 'America/New_York';

  constructor(
    private readonly repository: InvoiceAllExpiredLessonsCronRepository,
    private readonly privateLessonInvoiceService: PrivateLessonInvoiceService,
    private readonly cronLockService: CronLockService,
  ) {}

  @Cron('0 20 23 * * *', {
    name: 'invoice-all-expired-lessons',
    timeZone: 'America/New_York',
  })
  async runScheduled(): Promise<InvoiceAllExpiredLessonsCronResult | null> {
    return await this.run('scheduler', null);
  }

  async runManually(
    triggeredByUserId: number,
  ): Promise<InvoiceAllExpiredLessonsCronResult | null> {
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
  ): Promise<InvoiceAllExpiredLessonsCronResult | null> {
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
  ): Promise<InvoiceAllExpiredLessonsCronResult | null> {
    const startedAtDate = new Date();

    this.logger.log(
      `[${this.jobName}] started via ${triggeredBy}${triggeredByUserId ? ` by user ${triggeredByUserId}` : ''}`,
    );

    const counts: Omit<
      InvoiceAllExpiredLessonsCronResult,
      'jobName' | 'triggeredBy' | 'triggeredByUserId' | 'startedAt' | 'completedAt' | 'durationMs'
    > = {
      locationsProcessed: 0,
      expiredLessonsMatched: 0,
      expiredInvoicesCreated: 0,
      expiredInvoicesAlreadyExisting: 0,
    };

    try {
      const locations = await this.repository.getCronEnabledLocations();

      for (const location of locations) {
        await this.processLocation(location, counts);
      }

      const completedAtDate = new Date();
      const result: InvoiceAllExpiredLessonsCronResult = {
        jobName: this.jobName,
        triggeredBy,
        triggeredByUserId,
        startedAt: startedAtDate.toISOString(),
        completedAt: completedAtDate.toISOString(),
        durationMs: completedAtDate.getTime() - startedAtDate.getTime(),
        ...counts,
      };

      this.logger.log(
        `[${this.jobName}] completed in ${result.durationMs}ms. Locations=${result.locationsProcessed}, Matched=${result.expiredLessonsMatched}, Created=${result.expiredInvoicesCreated}, Existing=${result.expiredInvoicesAlreadyExisting}`,
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
    location: InvoiceAllExpiredLessonsCronLocation,
    counts: Omit<
      InvoiceAllExpiredLessonsCronResult,
      'jobName' | 'triggeredBy' | 'triggeredByUserId' | 'startedAt' | 'completedAt' | 'durationMs'
    >,
  ): Promise<void> {
    const lessonIds = await this.repository.getExpiredPrivateLessonIds(location.id);

    for (const lessonId of lessonIds) {
      counts.expiredLessonsMatched += 1;

      const dto: GeneratePrivateInvoiceDto = { lessonIds: [lessonId] };
      try {
        await this.privateLessonInvoiceService.generateInvoicesForLessons(
          location.id,
          dto,
          BOT_USER_ID,
        );
        counts.expiredInvoicesCreated += 1;
      } catch (error) {
        if (
          error instanceof BadRequestException &&
          this.isAlreadyInvoicedPrivateLessonError(error)
        ) {
          counts.expiredInvoicesAlreadyExisting += 1;
          this.logger.warn(
            `[${this.jobName}:${location.id}] skipped expired private lesson ${lessonId} because an invoice already exists`,
          );
          continue;
        }
        this.logger.error(
          `[${this.jobName}:${location.id}] failed to process expired private lesson ${lessonId}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    counts.locationsProcessed += 1;

    this.logger.log(
      `[${this.jobName}:${location.id}] processed location "${location.name}" (${location.slug}). ExpiredLessons=${lessonIds.length}`,
    );
  }

  private isAlreadyInvoicedPrivateLessonError(error: BadRequestException): boolean {
    const response = error.getResponse();
    if (typeof response === 'string') {
      return response === "Lesson's already invoiced";
    }
    if (response && typeof response === 'object' && 'message' in response) {
      const message = (response as { message?: string | string[] }).message;
      if (typeof message === 'string') {
        return message === "Lesson's already invoiced";
      }
      if (Array.isArray(message)) {
        return message.includes("Lesson's already invoiced");
      }
    }
    return false;
  }
}
