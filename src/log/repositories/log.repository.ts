import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Log } from '../entities/log.entity';
import { LogHistory } from '../entities/log-history.entity';
import { LogObjectType } from '../enums/log-object-type.enum';
import { LogLink } from '../entities/log-link.entity';
import { getEasternDateRangeBounds, getCurrentESTDate } from '../../utils/date-utils';

@Injectable()
export class LogRepository {
  constructor(
    @InjectRepository(Log)
    private readonly logRepository: Repository<Log>,
    @InjectRepository(LogHistory)
    private readonly logHistoryRepository: Repository<LogHistory>,
    @InjectRepository(LogLink)
    private readonly logLinkRepository: Repository<LogLink>,
  ) {}

  async findLogHistory(
    instanceType: LogObjectType, 
    instanceId: number, // customerId, TeacherId, courseId, etc.
    page: number = 1,
    limit: number = 20,
  ): Promise<{ logHistory: LogHistory[]; total: number }> {

    
    const [logHistory, total] = await this.logHistoryRepository.findAndCount({
      where: { instanceId, instanceType },
      relations: ['log', 'log.logLinks', 'user'],
      skip: ((page || 1) - 1) * (limit || 20),
      take: limit || 20,
      order: { id: 'ASC' },
    });

    return { logHistory, total };
  }

  

  /**
   * Creates log entry with optional link and history
   */
  async createLog(
    logData: any,
    logLinkData: any | undefined,
    logHistoryData: any,
  ): Promise<{ log: Log; logLink: LogLink | null; logHistory: LogHistory }> {
    const queryRunner = this.logRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Create log
      const log = queryRunner.manager.create(Log, logData);
      const savedLog = await queryRunner.manager.save(log);

      let savedLogLink: LogLink | null = null;
      if (logLinkData) {
        // 2. Create log link with the log ID when link metadata is provided
        const logLink = queryRunner.manager.create(LogLink, {
          ...logLinkData,
          logId: savedLog.id,
        });
        savedLogLink = await queryRunner.manager.save(logLink);
      }

      // 3. Create log history with the log ID
      const logHistory = queryRunner.manager.create(LogHistory, {
        ...logHistoryData,
        logId: savedLog.id,
      });
      const savedLogHistory = await queryRunner.manager.save(logHistory);

      await queryRunner.commitTransaction();

      return {
        log: savedLog,
        logLink: savedLogLink,
        logHistory: savedLogHistory,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(`Failed to create log entry: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  async createLogHistory(
    historyData: {
      logId: number;
      instanceId: number;
      instanceType: string;
    },
  ): Promise<LogHistory> {
    const logHistory = this.logHistoryRepository.create(historyData);
    return this.logHistoryRepository.save(logHistory);
  }

  async createLogLink(linkData: {
    logId: number;
    index: string;
    baseUrl: string;
    path: string;
  }): Promise<LogLink> {
    const logLink = this.logLinkRepository.create(linkData);
    return this.logLinkRepository.save(logLink);
  }

  async findTimeline(
    locationId: number,
    filters: { fromDate?: string; toDate?: string; createdUserId?: number; message?: string },
    page: number = 1,
    limit: number = 20,
  ): Promise<{ logs: LogHistory[]; total: number }> {
    const query = this.logHistoryRepository
      .createQueryBuilder('logHistory')
      .innerJoinAndSelect('logHistory.log', 'log')
      .leftJoinAndSelect('log.logLinks', 'logLink')
      .leftJoinAndSelect('log.createdUser', 'user')
      .leftJoinAndSelect('user.profile', 'profile')
      .where('log.locationId = :locationId', { locationId })
      .orderBy('log.createdOn', 'DESC');

    // Timeline dates are defined by the Eastern business day, while storage is UTC.
    // Use half-open UTC ranges so we do not lose or duplicate rows around midnight.
    if (!filters.fromDate && !filters.toDate) {
      const today = getCurrentESTDate().toISOString().slice(0, 10);
      const { startUtc, endExclusiveUtc } = getEasternDateRangeBounds(today);
      query.andWhere('log.createdOn >= :startUtc AND log.createdOn < :endExclusiveUtc', {
        startUtc,
        endExclusiveUtc,
      });
    } else if (filters.fromDate && filters.toDate) {
      const { startUtc } = getEasternDateRangeBounds(filters.fromDate);
      const { endExclusiveUtc } = getEasternDateRangeBounds(filters.toDate);
      query.andWhere('log.createdOn >= :startUtc AND log.createdOn < :endExclusiveUtc', {
        startUtc,
        endExclusiveUtc,
      });
    } else if (filters.fromDate) {
      const { startUtc } = getEasternDateRangeBounds(filters.fromDate);
      query.andWhere('log.createdOn >= :startUtc', { startUtc });
    } else if (filters.toDate) {
      const { endExclusiveUtc } = getEasternDateRangeBounds(filters.toDate);
      query.andWhere('log.createdOn < :endExclusiveUtc', { endExclusiveUtc });
    }

    if (filters.createdUserId) {
      query.andWhere('log.createdUserId = :userId', { userId: filters.createdUserId });
    }

    if (filters.message) {
      query.andWhere('log.message LIKE :message', { message: `%${filters.message}%` });
    }

    const [logs, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { logs, total };
  }
}
