import { Injectable } from '@nestjs/common';
import { AuditTrailListQueryDto } from '../dto/audit-trail-request.dto';
import {
  AuditTrailActorDto,
  AuditTrailEntryDetailDto,
  AuditTrailEntryListItemDto,
  AuditTrailListResponseDto,
  AuditTrailModelTypeDto,
} from '../dto/audit-trail-response.dto';
import { AuditTrailEntryEntity } from '../entities/audit-trail-entry.entity';
import { AuditTrailListRow, AuditTrailRepository } from '../repositories/audit-trail.repository';

type AuditTrailListSource = {
  id: number;
  happenedAt: number;
  modelType: string;
  foreignPk: string;
  type: string;
  data: string | null;
  actorId: number | null;
  actorUsername: string | null;
  actorFirstname: string | null;
  actorLastname: string | null;
};

@Injectable()
export class AuditTrailQueryService {
  constructor(private readonly auditTrailRepository: AuditTrailRepository) {}

  // Retrieves the paginated audit trail list used by the global report screen.
  async getEntries(query: AuditTrailListQueryDto): Promise<AuditTrailListResponseDto> {
    const { entries, total, page, limit } = await this.auditTrailRepository.findEntries(query);

    return {
      body: entries.map((entry) => this.mapRowToListItem(entry)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  // Retrieves a single audit trail entry together with its raw payload data.
  async getEntryById(id: number): Promise<AuditTrailEntryDetailDto | null> {
    const entry = await this.auditTrailRepository.findEntryById(id);
    if (!entry) {
      return null;
    }

    return this.mapEntryToDetailItem(entry);
  }

  // Returns the model type options and counts used by the filter chips on the UI.
  async getModelTypes(): Promise<AuditTrailModelTypeDto[]> {
    const rows = await this.auditTrailRepository.findModelTypeCounts();

    return rows.map((row) => ({
      value: row.modelType,
      label: this.formatModelTypeLabel(row.modelType),
      count: row.count,
    }));
  }

  // Converts a raw list row into the compact table row used in the report list.
  private mapRowToListItem(entry: AuditTrailListRow): AuditTrailEntryListItemDto {
    return this.mapListSourceToItem({
      id: entry.id,
      happenedAt: entry.happenedAt,
      modelType: entry.modelType,
      foreignPk: entry.foreignPk,
      type: entry.type,
      data: entry.data,
      actorId: entry.actorId,
      actorUsername: entry.actorUsername,
      actorFirstname: entry.actorFirstname,
      actorLastname: entry.actorLastname,
    });
  }

  // Converts a hydrated entity into the compact table row used in the report list.
  private mapEntryToListItem(entry: AuditTrailEntryEntity): AuditTrailEntryListItemDto {
    return this.mapListSourceToItem({
      id: entry.id,
      happenedAt: entry.happenedAt,
      modelType: entry.modelType,
      foreignPk: entry.foreignPk,
      type: entry.type,
      data: entry.data,
      actorId: entry.user?.id ?? null,
      actorUsername: entry.user?.username ?? null,
      actorFirstname: entry.user?.profile?.firstname ?? null,
      actorLastname: entry.user?.profile?.lastname ?? null,
    });
  }

  // Normalizes the row shape before converting it into the shared list DTO.
  private mapListSourceToItem(source: AuditTrailListSource): AuditTrailEntryListItemDto {
    const foreignPk = this.parseJson<Record<string, unknown>>(source.foreignPk, {});
    const parsedData = this.parseJson<Record<string, unknown> | null>(source.data, null);
    const changeKeys = this.resolveChangeKeys(source.type, parsedData);
    const modelName = this.formatModelTypeLabel(source.modelType);
    const recordLabel = this.buildRecordLabel(foreignPk);

    return {
      id: source.id,
      happenedAt: this.toIsoString(source.happenedAt),
      happenedAtEpoch: source.happenedAt,
      action: source.type,
      modelType: source.modelType,
      modelName,
      recordLabel,
      foreignPk,
      changeKeys,
      actor: this.buildActor(source),
      summary: this.buildSummary(source.type, modelName, recordLabel, changeKeys),
    };
  }

  // Converts an entity row into the detail payload shown in the side dialog.
  private mapEntryToDetailItem(entry: AuditTrailEntryEntity): AuditTrailEntryDetailDto {
    const listItem = this.mapEntryToListItem(entry);

    return {
      ...listItem,
      data: this.parseJson<unknown>(entry.data, null),
      rawForeignPk: entry.foreignPk,
      rawData: entry.data,
    };
  }

  // Builds the display actor from either a hydrated entity or a raw list row.
  private buildActor(source: AuditTrailEntryEntity | AuditTrailListSource): AuditTrailActorDto | null {
    if ('actorId' in source) {
      if (!source.actorId) {
        return null;
      }

      const fullName = [source.actorFirstname, source.actorLastname]
        .filter((part): part is string => Boolean(part && part.trim()))
        .join(' ')
        .trim();

      return {
        id: source.actorId,
        username: source.actorUsername ?? null,
        displayName: fullName || source.actorUsername || `User #${source.actorId}`,
      };
    }

    if (!source.user) {
      return null;
    }

    const profile = source.user.profile;
    const fullName = [profile?.firstname, profile?.lastname]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(' ')
      .trim();

    return {
      id: source.user.id,
      username: source.user.username ?? null,
      displayName: fullName || source.user.username || `User #${source.user.id}`,
    };
  }

  // Formats the stored model type into the readable label shown in the UI.
  private formatModelTypeLabel(modelType: string): string {
    const rawLabel = modelType.split(/[\\/]/).pop() || modelType || 'Unknown';
    return rawLabel
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .trim();
  }

  // Converts the foreign key JSON object into a compact human-readable record label.
  private buildRecordLabel(foreignPk: Record<string, unknown>): string {
    const entries = Object.entries(foreignPk);
    if (entries.length === 0) {
      return 'Unknown record';
    }

    if (entries.length === 1) {
      const [key, value] = entries[0];
      if (key.toLowerCase() === 'id') {
        return `#${this.formatPrimitive(value)}`;
      }

      return `${key}=${this.formatPrimitive(value)}`;
    }

    return entries.map(([key, value]) => `${key}=${this.formatPrimitive(value)}`).join(', ');
  }

  // Picks the fields that changed so the list can show a concise diff summary.
  private resolveChangeKeys(
    action: string,
    parsedData: Record<string, unknown> | null,
  ): string[] {
    if (action !== 'update') {
      return [];
    }

    const changeBlock = parsedData?.changes;
    if (!changeBlock || typeof changeBlock !== 'object' || Array.isArray(changeBlock)) {
      return [];
    }

    return Object.keys(changeBlock as Record<string, unknown>);
  }

  // Creates a concise summary string for the list table.
  private buildSummary(
    action: string,
    modelName: string,
    recordLabel: string,
    changeKeys: string[],
  ): string {
    const suffix = recordLabel && recordLabel !== 'Unknown record' ? ` (${recordLabel})` : '';

    if (action === 'create') {
      return `Created ${modelName}${suffix}`;
    }

    if (action === 'delete') {
      return `Deleted ${modelName}${suffix}`;
    }

    if (action === 'update') {
      if (changeKeys.length === 0) {
        return `Updated ${modelName}${suffix}`;
      }

      const fieldSuffix = changeKeys.length === 1 ? 'field' : 'fields';
      return `Updated ${modelName}${suffix} (${changeKeys.length} ${fieldSuffix} changed)`;
    }

    return `${modelName} audit entry${suffix}`;
  }

  // Parses JSON fields stored as text and falls back to the provided default value.
  private parseJson<T>(value: string | null, fallback: T): T {
    if (!value) {
      return fallback;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  // Converts the epoch-second value stored in the database into an ISO string.
  private toIsoString(epochSeconds: number): string {
    return new Date(epochSeconds * 1000).toISOString();
  }

  // Formats primitive values for use in the record label.
  private formatPrimitive(value: unknown): string {
    if (value === null || value === undefined) {
      return 'null';
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
}
