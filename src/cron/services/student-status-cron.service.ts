import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BOT_USER_ID } from '../../shared/helpers/system-user.helper';
import { isProd } from 'src/utils/env';
import {
  StudentStatusCronCounts,
  StudentStatusCronLocation,
  StudentStatusCronRepository,
} from '../repositories/student-status-cron.repository';
import { CronLockService } from './cron-lock.service';

type StudentStatusCronTarget = 'production' | 'non-production';
type StudentStatusTriggeredBy = 'scheduler' | 'manual';

export interface StudentStatusCronResult extends StudentStatusCronCounts {
  jobName: string;
  target: StudentStatusCronTarget;
  triggeredBy: StudentStatusTriggeredBy;
  triggeredByUserId: number | null;
  skipped: boolean;
  reason: string | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

@Injectable()
export class StudentStatusCronService {
  private readonly logger = new Logger(StudentStatusCronService.name);
  private readonly timeZone = 'America/New_York';
  private readonly productionJobName = 'student-set-status-production';
  private readonly nonProductionJobName = 'student-set-status-non-production';
  private readonly productionCronExpression = '0 0 1 * * *';
  private readonly nonProductionCronExpression = '0 30 1 * * *';

  constructor(
    private readonly studentStatusCronRepository: StudentStatusCronRepository,
    private readonly cronLockService: CronLockService,
  ) {}

  @Cron('0 0 1 * * *', {
    name: 'student-set-status-production',
    timeZone: 'America/New_York',
  })
  async runProductionScheduled(): Promise<StudentStatusCronResult | null> {
    return this.run('production', 'scheduler', null);
  }

  @Cron('0 30 1 * * *', {
    name: 'student-set-status-non-production',
    timeZone: 'America/New_York',
  })
  async runNonProductionScheduled(): Promise<StudentStatusCronResult | null> {
    return this.run('non-production', 'scheduler', null);
  }

  async runProductionManually(
    triggeredByUserId: number,
  ): Promise<StudentStatusCronResult | null> {
    return this.run('production', 'manual', triggeredByUserId);
  }

  async runNonProductionManually(
    triggeredByUserId: number,
  ): Promise<StudentStatusCronResult | null> {
    return this.run('non-production', 'manual', triggeredByUserId);
  }

  getJobMetadata() {
    return [
      {
        name: this.productionJobName,
        enabled: true,
        expression: this.productionCronExpression,
        timeZone: this.timeZone,
        manualTriggerAllowed: true,
        allowedRoles: ['administrator'],
      },
      {
        name: this.nonProductionJobName,
        enabled: true,
        expression: this.nonProductionCronExpression,
        timeZone: this.timeZone,
        manualTriggerAllowed: true,
        allowedRoles: ['administrator'],
      },
    ];
  }

  private async run(
    target: StudentStatusCronTarget,
    triggeredBy: StudentStatusTriggeredBy,
    triggeredByUserId: number | null,
  ): Promise<StudentStatusCronResult | null> {
    const jobName = this.getJobName(target);
    return this.cronLockService.runWithLock(
      `cron:${jobName}`,
      jobName,
      this.logger,
      () => this.executeRun(target, triggeredBy, triggeredByUserId),
    );
  }

  private async executeRun(
    target: StudentStatusCronTarget,
    triggeredBy: StudentStatusTriggeredBy,
    triggeredByUserId: number | null,
  ): Promise<StudentStatusCronResult | null> {
    // if (isProd()) {
    //   return null;
    // }

    const startedAtDate = new Date();
    const jobName = this.getJobName(target);

    try {
      this.logger.log(
        `[${jobName}] started via ${triggeredBy}${triggeredByUserId ? ` by user ${triggeredByUserId}` : ''}`,
      );

      const currentDateTime = this.getNewYorkDateTimeString(new Date());
      const locations =
        await this.studentStatusCronRepository.getLocationsByCronEnabled(
          target === 'production',
        );

      const counts = await this.processLocations(
        target,
        locations,
        BOT_USER_ID,
        currentDateTime,
      );
      const result = this.buildResult(
        jobName,
        target,
        counts,
        triggeredBy,
        triggeredByUserId,
        startedAtDate,
        false,
        null,
      );

      this.logger.log(
        `[${jobName}] completed in ${result.durationMs}ms. Locations=${result.locationsProcessed}, Failed=${result.locationsFailed}, Active=${result.activeStudents}, Inactive=${result.inactiveStudents}, Total=${result.totalStudentsUpdated}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `[${jobName}] failed`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async processLocations(
    target: StudentStatusCronTarget,
    locations: StudentStatusCronLocation[],
    botUserId: number,
    currentDateTime: string,
  ): Promise<StudentStatusCronCounts> {
    const counts: StudentStatusCronCounts = {
      locationsProcessed: 0,
      activeStudents: 0,
      inactiveStudents: 0,
      totalStudentsUpdated: 0,
      locationsFailed: 0,
    };

    for (const location of locations) {
      try {
        const initialActiveStudentIds =
          await this.studentStatusCronRepository.getActiveStudentIdsForLocation(
            location.id,
            currentDateTime,
          );
        const inactiveStudentIds =
          await this.studentStatusCronRepository.getInactiveStudentIdsForLocation(
            location.id,
            initialActiveStudentIds,
          );

        await this.studentStatusCronRepository.updateStudentsStatus(
          inactiveStudentIds,
          this.studentStatusCronRepository.getInactiveStatusValue(),
          botUserId,
          currentDateTime,
        );

        const activeStudentIds =
          await this.studentStatusCronRepository.getActiveStudentIdsForLocation(
            location.id,
            currentDateTime,
          );

        await this.studentStatusCronRepository.updateStudentsStatus(
          activeStudentIds,
          this.studentStatusCronRepository.getActiveStatusValue(),
          botUserId,
          currentDateTime,
        );

        counts.locationsProcessed += 1;
        counts.activeStudents += activeStudentIds.length;
        counts.inactiveStudents += inactiveStudentIds.length;
        counts.totalStudentsUpdated +=
          activeStudentIds.length + inactiveStudentIds.length;

        this.logger.log(
          `[${this.getJobNameForLocationRun(target, location.id)}] processed location "${location.name}" (${location.id}). Active=${activeStudentIds.length}, Inactive=${inactiveStudentIds.length}`,
        );
      } catch (error) {
        counts.locationsFailed += 1;
        this.logger.error(
          `[${this.getJobNameForLocationRun(target, location.id)}] failed to process location "${location.name}" (${location.id})`,
          error instanceof Error ? error.stack : undefined,
        );
        continue;
      }
    }

    return counts;
  }

  private buildResult(
    jobName: string,
    target: StudentStatusCronTarget,
    counts: StudentStatusCronCounts,
    triggeredBy: StudentStatusTriggeredBy,
    triggeredByUserId: number | null,
    startedAtDate: Date,
    skipped: boolean,
    reason: string | null,
  ): StudentStatusCronResult {
    const completedAtDate = new Date();

    return {
      jobName,
      target,
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

  private getJobName(target: StudentStatusCronTarget): string {
    return target === 'production'
      ? this.productionJobName
      : this.nonProductionJobName;
  }

  private getJobNameForLocationRun(
    target: StudentStatusCronTarget,
    locationId: number,
  ): string {
    return `${this.getJobName(target)}:${locationId}`;
  }

  private getNewYorkDateTimeString(date: Date): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const getValue = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '';

    return `${getValue('year')}-${getValue('month')}-${getValue('day')} ${getValue('hour')}:${getValue('minute')}:${getValue('second')}`;
  }
}
