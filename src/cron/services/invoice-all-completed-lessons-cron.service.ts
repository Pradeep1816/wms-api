import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BOT_USER_ID } from '../../shared/helpers/system-user.helper';
import { GeneratePrivateInvoiceDto } from '../../lesson/dto/generate-private-invoice.dto';
import { GroupLessonInvoiceService } from '../../lesson/services/group-lesson-invoice.service';
import { PrivateLessonInvoiceService } from '../../lesson/services/generate-invoice.service';
import {
  InvoiceAllCompletedLessonsCronLocation,
  InvoiceAllCompletedLessonsCronRepository,
} from '../repositories/invoice-all-completed-lessons-cron.repository';
import { CronLockService } from './cron-lock.service';

export interface InvoiceAllCompletedLessonsCronResult {
  jobName: string;
  triggeredBy: 'scheduler' | 'manual';
  triggeredByUserId: number | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  locationsProcessed: number;
  groupLessonsProcessed: number;
  groupInvoicesCreated: number;
  groupInvoicesAlreadyExisting: number;
  groupEnrolmentsTotal: number;
  groupLessonsFailed: number;
  privateLessonsProcessed: number;
  privateInvoicesCreated: number;
  privateLessonsSkippedZeroRate: number;
  privateLessonsFailed: number;
}

@Injectable()
export class InvoiceAllCompletedLessonsCronService {
  private readonly logger = new Logger(InvoiceAllCompletedLessonsCronService.name);
  private readonly jobName = 'invoice-all-completed-lessons';
  private readonly cronExpression = '0 0 23 * * *';
  private readonly timeZone = 'America/New_York';

  constructor(
    private readonly repository: InvoiceAllCompletedLessonsCronRepository,
    private readonly privateLessonInvoiceService: PrivateLessonInvoiceService,
    private readonly groupLessonInvoiceService: GroupLessonInvoiceService,
    private readonly cronLockService: CronLockService,
  ) {}

  @Cron('0 0 23 * * *', {
    name: 'invoice-all-completed-lessons',
    timeZone: 'America/New_York',
  })
  async runScheduled(): Promise<InvoiceAllCompletedLessonsCronResult | null> {
    return await this.run('scheduler', null);
  }

  async runManually(
    triggeredByUserId: number,
  ): Promise<InvoiceAllCompletedLessonsCronResult | null> {
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
  ): Promise<InvoiceAllCompletedLessonsCronResult | null> {
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
  ): Promise<InvoiceAllCompletedLessonsCronResult | null> {
    const startedAtDate = new Date();

    this.logger.log(
      `[${this.jobName}] started via ${triggeredBy}${triggeredByUserId ? ` by user ${triggeredByUserId}` : ''}`,
    );

    const counts: Omit<
      InvoiceAllCompletedLessonsCronResult,
      'jobName' | 'triggeredBy' | 'triggeredByUserId' | 'startedAt' | 'completedAt' | 'durationMs'
    > = {
      locationsProcessed: 0,
      groupLessonsProcessed: 0,
      groupInvoicesCreated: 0,
      groupInvoicesAlreadyExisting: 0,
      groupEnrolmentsTotal: 0,
      groupLessonsFailed: 0,
      privateLessonsProcessed: 0,
      privateInvoicesCreated: 0,
      privateLessonsSkippedZeroRate: 0,
      privateLessonsFailed: 0,
    };

    try {
      const locations = await this.repository.getCronEnabledLocations();

      for (const location of locations) {
        await this.processLocation(location, counts);
      }

      const completedAtDate = new Date();
      const result: InvoiceAllCompletedLessonsCronResult = {
        jobName: this.jobName,
        triggeredBy,
        triggeredByUserId,
        startedAt: startedAtDate.toISOString(),
        completedAt: completedAtDate.toISOString(),
        durationMs: completedAtDate.getTime() - startedAtDate.getTime(),
        ...counts,
      };

      this.logger.log(
        `[${this.jobName}] completed in ${result.durationMs}ms. Locations=${result.locationsProcessed}, GroupLessons=${result.groupLessonsProcessed}, GroupCreated=${result.groupInvoicesCreated}, GroupExisting=${result.groupInvoicesAlreadyExisting}, GroupFailed=${result.groupLessonsFailed}, PrivateLessons=${result.privateLessonsProcessed}, PrivateCreated=${result.privateInvoicesCreated}, PrivateZeroRateSkipped=${result.privateLessonsSkippedZeroRate}, PrivateFailed=${result.privateLessonsFailed}`,
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
    location: InvoiceAllCompletedLessonsCronLocation,
    counts: Omit<
      InvoiceAllCompletedLessonsCronResult,
      'jobName' | 'triggeredBy' | 'triggeredByUserId' | 'startedAt' | 'completedAt' | 'durationMs'
    >,
  ): Promise<void> {
    let groupLessonsFailedForLocation = 0;
    let privateLessonsFailedForLocation = 0;

    const groupLessonIds = await this.repository.getCompletedGroupLessonIds(location.id);
    for (const lessonId of groupLessonIds) {
      try {
        const result = await this.groupLessonInvoiceService.createGroupLessonInvoice(
          location.id,
          location.slug,
          lessonId,
          undefined,
          BOT_USER_ID,
        );

        counts.groupLessonsProcessed += 1;
        if ('createdCount' in result) {
          counts.groupInvoicesCreated += result.createdCount;
          counts.groupInvoicesAlreadyExisting += result.alreadyExistsCount;
          counts.groupEnrolmentsTotal += result.totalEnrolments;
        } else {
          counts.groupEnrolmentsTotal += 1;
          if (result.alreadyExists) {
            counts.groupInvoicesAlreadyExisting += 1;
          } else {
            counts.groupInvoicesCreated += 1;
          }
        }
      } catch (error) {
        counts.groupLessonsFailed += 1;
        groupLessonsFailedForLocation += 1;
        this.logger.error(
          `[${this.jobName}:${location.id}] failed to process group lesson ${lessonId}`,
          error instanceof Error ? error.stack : undefined,
        );
        continue;
      }
    }

    const privateLessons =
      await this.repository.getCompletedUninvoicedPrivateLessons(location.id);
    const privateLessonIds: number[] = [];

    for (const lesson of privateLessons) {
      if (lesson.programRate > 0) {
        privateLessonIds.push(lesson.id);
      } else {
        counts.privateLessonsSkippedZeroRate += 1;
      }
    }

    for (const lessonId of privateLessonIds) {
      const dto: GeneratePrivateInvoiceDto = { lessonIds: [lessonId] };
      try {
        await this.privateLessonInvoiceService.generateInvoicesForLessons(
          location.id,
          dto,
          BOT_USER_ID,
        );
        counts.privateLessonsProcessed += 1;
        counts.privateInvoicesCreated += 1;
      } catch (error) {
        if (
          error instanceof BadRequestException &&
          this.isAlreadyInvoicedPrivateLessonError(error)
        ) {
          this.logger.warn(
            `[${this.jobName}:${location.id}] skipped private lesson ${lessonId} because an invoice already exists`,
          );
          continue;
        }
        counts.privateLessonsFailed += 1;
        privateLessonsFailedForLocation += 1;
        this.logger.error(
          `[${this.jobName}:${location.id}] failed to process private lesson ${lessonId}`,
          error instanceof Error ? error.stack : undefined,
        );
        continue;
      }
    }

    counts.locationsProcessed += 1;

    this.logger.log(
      `[${this.jobName}:${location.id}] processed location "${location.name}" (${location.slug}). GroupLessons=${groupLessonIds.length}, GroupFailed=${groupLessonsFailedForLocation}, PrivateLessons=${privateLessonIds.length}, PrivateFailed=${privateLessonsFailedForLocation}, PrivateZeroRateSkipped=${privateLessons.length - privateLessonIds.length}`,
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
