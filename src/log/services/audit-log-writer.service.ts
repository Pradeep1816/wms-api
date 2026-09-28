import { Injectable } from '@nestjs/common';
import { LogRepository } from '../repositories/log.repository';
import { LogObjectRepository } from '../repositories/log-object.repository';
import { LogActivityRepository } from '../repositories/log-activity.repository';
import { LogActivityType } from '../enums/log-activity.enum';
import { LogObjectType } from '../enums/log-object-type.enum';

export interface AuditLogLinkInput {
  index: string;
  path: string;
  baseUrl?: string;
}

export interface AuditLogHistoryInput {
  instanceId: number;
  instanceType: LogObjectType;
}

export interface AuditLogWriterInput {
  objectType: LogObjectType;
  activityType: LogActivityType | string;
  message: string;
  data?: string | Record<string, unknown> | null;
  locationId: number;
  createdUserId: number;
  mainLink?: AuditLogLinkInput;
  mainHistory: AuditLogHistoryInput;
  createdOn?: Date;
  extraLinks?: AuditLogLinkInput[];
  extraHistories?: AuditLogHistoryInput[];
}

@Injectable()
export class AuditLogWriterService {
  private readonly baseUrl = process.env.BASE_URL || '';

  constructor(
    private readonly logRepository: LogRepository,
    private readonly logObjectRepository: LogObjectRepository,
    private readonly logActivityRepository: LogActivityRepository,
  ) {}

  async writeAuditLog(input: AuditLogWriterInput): Promise<void> {
    try {
      const [logObject, logActivity] = await Promise.all([
        this.logObjectRepository.findLogObjectByName(String(input.objectType)),
        this.logActivityRepository.findLogActivityByName(String(input.activityType)),
      ]);

      if (!logObject || !logActivity) {
        return;
      }

      const logData = {
        logObjectId: logObject.id,
        logActivityId: logActivity.id,
        message: input.message,
        data: this.serializeData(input.data),
        locationId: input.locationId,
        createdOn: input.createdOn ?? new Date(),
        createdUserId: input.createdUserId,
      };

      const { log } = await this.logRepository.createLog(
        logData,
        input.mainLink ? this.normalizeLink(input.mainLink) : undefined,
        input.mainHistory,
      );

      if (input.extraLinks?.length) {
        for (const link of input.extraLinks) {
          await this.logRepository.createLogLink({
            logId: log.id,
            ...this.normalizeLink(link),
          });
        }
      }

      if (input.extraHistories?.length) {
        for (const history of input.extraHistories) {
          await this.logRepository.createLogHistory({
            logId: log.id,
            ...history,
          });
        }
      }
    } catch (error) {
      console.error('Error writing audit log:', error);
    }
  }

  private serializeData(data?: string | Record<string, unknown> | null): string {
    if (typeof data === 'string') {
      return data;
    }

    return JSON.stringify(data ?? {});
  }

  private normalizeLink(link: AuditLogLinkInput): { index: string; baseUrl: string; path: string } {
    return {
      index: link.index,
      baseUrl: link.baseUrl || this.baseUrl,
      path: link.path,
    };
  }
}
