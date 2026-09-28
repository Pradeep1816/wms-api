import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { AuditTrailEntryEntity } from '../entities/audit-trail-entry.entity';
import { AuditTrailListQueryDto } from '../dto/audit-trail-request.dto';

const USER_AUDIT_MODEL_TYPE = 'common\\models\\User';

export interface AuditTrailModelTypeCountRow {
  modelType: string;
  count: number;
}

export interface AuditTrailListRow {
  id: number;
  happenedAt: number;
  modelType: string;
  foreignPk: string;
  userId: number | null;
  type: string;
  data: string | null;
  actorId: number | null;
  actorUsername: string | null;
  actorFirstname: string | null;
  actorLastname: string | null;
}

@Injectable()
export class AuditTrailRepository {
  constructor(
    @InjectRepository(AuditTrailEntryEntity)
    private readonly auditTrailEntryRepository: Repository<AuditTrailEntryEntity>,
  ) {}

  // Builds the detail query used by the single-entry screen.
  private createDetailQuery() {
    return this.auditTrailEntryRepository
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.user', 'user')
      .leftJoinAndSelect('user.profile', 'profile');
  }

  // Builds the lightweight list query used to collect ordered entry ids.
  private createListIdQuery(includeActorSearchJoins: boolean) {
    const queryBuilder = this.auditTrailEntryRepository.createQueryBuilder('entry');

    if (includeActorSearchJoins) {
      queryBuilder.leftJoin('entry.user', 'user').leftJoin('user.profile', 'profile');
    }

    return queryBuilder;
  }

  // Builds the post-pagination fetch query for the selected entries.
  private createListRowQuery(entryIds: number[]) {
    return this.auditTrailEntryRepository
      .createQueryBuilder('entry')
      .leftJoin('entry.user', 'user')
      .leftJoin('user.profile', 'profile')
      .select([
        'entry.id AS id',
        'entry.happenedAt AS happenedAt',
        'entry.modelType AS modelType',
        'entry.foreignPk AS foreignPk',
        'entry.userId AS userId',
        'entry.type AS type',
        'entry.data AS data',
        'user.id AS actorId',
        'user.username AS actorUsername',
        'profile.firstname AS actorFirstname',
        'profile.lastname AS actorLastname',
      ])
      .where('entry.id IN (:...entryIds)', { entryIds })
      .orderBy('entry.id', 'DESC');
  }

  // Applies the shared filters used by both the count query and the list query.
  private applyFilters(
    queryBuilder: ReturnType<AuditTrailRepository['createDetailQuery']>,
    query: AuditTrailListQueryDto,
    options: { includeActorSearchJoins?: boolean } = {},
  ) {
    queryBuilder.andWhere('entry.modelType <> :excludedUserModelType', {
      excludedUserModelType: USER_AUDIT_MODEL_TYPE,
    });

    const search = query.q?.trim();
    if (search) {
      const likeSearch = `%${search}%`;
      queryBuilder.andWhere(
        new Brackets((searchQuery) => {
          searchQuery
            .where('entry.modelType LIKE :search', { search: likeSearch })
            .orWhere('entry.foreignPk LIKE :search', { search: likeSearch })
            .orWhere('entry.data LIKE :search', { search: likeSearch })
            .orWhere('entry.type LIKE :search', { search: likeSearch });

          if (options.includeActorSearchJoins) {
            searchQuery
              .orWhere('user.username LIKE :search', { search: likeSearch })
              .orWhere("CONCAT_WS(' ', profile.firstname, profile.lastname) LIKE :search", {
                search: likeSearch,
              });
          }
        }),
      );
    }

    if (query.modelType) {
      queryBuilder.andWhere('entry.modelType = :modelType', {
        modelType: query.modelType,
      });
    }

    if (query.action && query.action !== 'all') {
      queryBuilder.andWhere('entry.type = :action', {
        action: query.action,
      });
    }

    if (query.userId) {
      queryBuilder.andWhere('entry.userId = :userId', {
        userId: query.userId,
      });
    }

    const normalizedRange = this.resolveEpochRange(query.fromDate, query.toDate);
    if (normalizedRange) {
      queryBuilder.andWhere('entry.happenedAt BETWEEN :startEpoch AND :endEpoch', normalizedRange);
    }

    return queryBuilder;
  }

  // Normalizes raw database values into the compact row shape used by the list response.
  private normalizeListRow(row: Record<string, unknown>): AuditTrailListRow {
    return {
      id: Number(row.id ?? 0),
      happenedAt: Number(row.happenedAt ?? 0),
      modelType: String(row.modelType ?? ''),
      foreignPk: String(row.foreignPk ?? '{}'),
      userId: row.userId === null || row.userId === undefined ? null : Number(row.userId),
      type: String(row.type ?? ''),
      data: row.data === null || row.data === undefined ? null : String(row.data),
      actorId: row.actorId === null || row.actorId === undefined ? null : Number(row.actorId),
      actorUsername: row.actorUsername === null || row.actorUsername === undefined ? null : String(row.actorUsername),
      actorFirstname: row.actorFirstname === null || row.actorFirstname === undefined ? null : String(row.actorFirstname),
      actorLastname: row.actorLastname === null || row.actorLastname === undefined ? null : String(row.actorLastname),
    };
  }

  // Converts a frontend date range into inclusive epoch-second boundaries.
  private resolveEpochRange(fromDate?: string, toDate?: string): { startEpoch: number; endEpoch: number } | null {
    const from = this.parseDateValue(fromDate) ?? this.parseDateValue(toDate);
    const to = this.parseDateValue(toDate) ?? this.parseDateValue(fromDate) ?? from;

    if (!from && !to) {
      return null;
    }

    const start = this.startOfDay(from ?? to ?? new Date());
    const end = this.endOfDay(to ?? from ?? new Date());
    let startEpoch = Math.floor(start.getTime() / 1000);
    let endEpoch = Math.floor(end.getTime() / 1000);

    if (startEpoch > endEpoch) {
      [startEpoch, endEpoch] = [endEpoch, startEpoch];
    }

    return { startEpoch, endEpoch };
  }

  // Parses a query date with the same semantics as the rest of the reports.
  private parseDateValue(value?: string): Date | null {
    if (!value) {
      return null;
    }

    const { parseFlexibleDate } = require('../../utils/date-utils');
    return parseFlexibleDate(value);
  }

  // Normalizes a Date to the start of the local day.
  private startOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  // Normalizes a Date to the end of the local day.
  private endOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  // Returns the filtered page of audit trail entries and the total count.
  async findEntries(query: AuditTrailListQueryDto): Promise<{
    entries: AuditTrailListRow[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const search = query.q?.trim();
    const includeActorSearchJoins = Boolean(search);

    const countQuery = this.applyFilters(
      this.createListIdQuery(includeActorSearchJoins),
      query,
      { includeActorSearchJoins },
    ).select('COUNT(*)', 'count');

    const listIdQuery = this.applyFilters(
      this.createListIdQuery(includeActorSearchJoins),
      query,
      { includeActorSearchJoins },
    )
      .select(['entry.id AS id', 'entry.happenedAt AS happenedAt'])
      .orderBy('entry.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [countRow, idRows] = await Promise.all([
      countQuery.getRawOne<{ count: string }>(),
      listIdQuery.getRawMany<{ id: number; happenedAt: number }>(),
    ]);

    const total = Number(countRow?.count || 0);
    if (idRows.length === 0) {
      return { entries: [], total, page, limit };
    }

    const entryIds = idRows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
    const rawEntries = await this.createListRowQuery(entryIds).getRawMany<Record<string, unknown>>();
    const entries = rawEntries.map((row) => this.normalizeListRow(row));

    return { entries, total, page, limit };
  }

  // Loads a single audit trail entry by primary key.
  async findEntryById(id: number): Promise<AuditTrailEntryEntity | null> {
    return this.createDetailQuery()
      .andWhere('entry.id = :id', { id })
      .andWhere('entry.modelType <> :excludedUserModelType', {
        excludedUserModelType: USER_AUDIT_MODEL_TYPE,
      })
      .getOne();
  }

  // Returns the distinct model type values together with their counts.
  async findModelTypeCounts(): Promise<AuditTrailModelTypeCountRow[]> {
    const rows = await this.auditTrailEntryRepository
      .createQueryBuilder('entry')
      .select('entry.modelType', 'modelType')
      .addSelect('COUNT(entry.id)', 'count')
      .where('entry.modelType <> :excludedUserModelType', {
        excludedUserModelType: USER_AUDIT_MODEL_TYPE,
      })
      .groupBy('entry.modelType')
      .orderBy('count', 'DESC')
      .addOrderBy('entry.modelType', 'ASC')
      .getRawMany<{ modelType: string; count: string }>();

    return rows.map((row) => ({
      modelType: row.modelType,
      count: Number(row.count || 0),
    }));
  }
}
