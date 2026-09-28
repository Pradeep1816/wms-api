import { Injectable, BadRequestException } from '@nestjs/common';
import { LogRepository } from '../repositories/log.repository';
import { LogHistoryDataDto, TimelineDataDto } from '../dto/log-response.dto';
import { LogTransformationService } from './transformations/log-transformation.service';
import { LogObjectType } from '../enums/log-object-type.enum';
import { LogMessageFormatterService } from './log-message-formatter.service';
import { formatEasternDisplayIso } from '../../utils/date-utils';
import { getDisplayName } from '../../shared/helpers/display-name.helper';

@Injectable()
export class LogService {
  constructor(
    private readonly logRepository: LogRepository,
    private readonly logTransformationService: LogTransformationService,
    private readonly logMessageFormatterService: LogMessageFormatterService,
  ) {}

  async getLogHistory(instanceType: LogObjectType, instanceId: number, page: number, limit: number, locationSlug?: string): Promise<LogHistoryDataDto> {
    try {
      const { logHistory, total } = await this.logRepository.findLogHistory(instanceType, instanceId, page, limit);

      return await this.logTransformationService.transformLogHistoryData(
        logHistory,
        total,
        page,
        limit,
        locationSlug,
      );
    } catch (error) {
      console.error('Error in getLogHistory service:', error);
      throw new BadRequestException(`Failed to retrieve log history: ${error.message}`);
    }
  }

  async getTimeline(
    locationId: number,
    locationSlug: string,
    filters: { fromDate?: string; toDate?: string; createdUserId?: number; message?: string },
    page: number,
    limit: number,
  ): Promise<TimelineDataDto> {
    try {
      const { logs, total } = await this.logRepository.findTimeline(locationId, filters, page, limit);

      const body = await Promise.all(logs.map(async logHistory => ({
        id: logHistory.id,
        date: formatEasternDisplayIso(logHistory.log.createdOn),
        createdUser: getDisplayName(logHistory.log.createdUser),
        message: await this.logMessageFormatterService.formatMessage(
          logHistory.log.message,
          logHistory.log.logLinks,
          locationSlug,
        ),
      })));

      return {
        body,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('Error in getTimeline service:', error);
      throw new BadRequestException(`Failed to retrieve timeline: ${error.message}`);
    }
  }

}
