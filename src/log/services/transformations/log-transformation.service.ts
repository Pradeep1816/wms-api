import { Injectable } from '@nestjs/common';
import { LogHistory } from '../../entities/log-history.entity';
import { LogHistoryItemDto, LogHistoryDataDto } from '../../dto/log-response.dto';
import { plainToInstance } from 'class-transformer';
import { LogMessageFormatterService } from '../log-message-formatter.service';
import { formatLegacyDateWithTime } from '../../../utils/formatters';

@Injectable()
export class LogTransformationService {
  constructor(
    private readonly logMessageFormatterService: LogMessageFormatterService,
  ) {}

  /**
   * Format a log-history message via shared formatter.
   * @param logHistory - LogHistory entity with log + logLinks relation
   * @returns Formatted log message string with HTML links
   */
  private async formatLogMessage(logHistory: LogHistory, locationSlug?: string): Promise<string> {
    if (!logHistory?.log?.message) {
      return 'No log message available';
    }

    return this.logMessageFormatterService.formatMessage(
      logHistory.log.message,
      logHistory.log.logLinks || [],
      locationSlug,
    );
  }

  /**
   * Transform a single LogHistory entity to DTO format
   * @param logHistory - LogHistory entity with relations
   * @returns LogHistoryItemDto
   */
  async transformLogHistoryItem(logHistory: LogHistory, locationSlug?: string): Promise<LogHistoryItemDto> {
    const formattedMessage = await this.formatLogMessage(logHistory, locationSlug);
    const createdOn = logHistory.log?.createdOn
      ? formatLegacyDateWithTime(logHistory.log.createdOn)
      : null;

    const dtoData = {
      id: logHistory?.log?.id,
      createdOn: createdOn,
      message: formattedMessage,
    };

    return plainToInstance(LogHistoryItemDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform multiple LogHistory entities to DTO format
   * @param logHistoryList - Array of LogHistory entities
   * @param locationSlug - Optional location slug for URL transformation
   * @returns Array of LogHistoryItemDto
   */
  async transformLogHistoryList(logHistoryList: LogHistory[], locationSlug?: string): Promise<LogHistoryItemDto[]> {
    return Promise.all(
      logHistoryList.map(logHistory =>
        this.transformLogHistoryItem(logHistory, locationSlug),
      ),
    );
  }

  // Transform log history data to DTO format

  async transformLogHistoryData(
    logHistoryList: LogHistory[],
    total: number,
    page: number,
    limit: number,
    locationSlug?: string,
  ): Promise<LogHistoryDataDto> {
    const formattedHistory = await this.transformLogHistoryList(logHistoryList, locationSlug);
    const totalPages = Math.ceil(total / limit);

    const dtoData = {
      body: formattedHistory,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };

    return plainToInstance(LogHistoryDataDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }
}
