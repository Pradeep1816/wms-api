import { Injectable } from '@nestjs/common';
import { EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';
import { AuditTrailEntryEntity } from '../entities/audit-trail-entry.entity';

export type AuditTrailAction = 'create' | 'update' | 'delete';
export type AuditTrailChanges = Record<
  string,
  { before: unknown; after: unknown }
>;

export function resolveAuditUpdateAction(
  changes: AuditTrailChanges,
): AuditTrailAction {
  const isDeletedChange = changes.isDeleted;
  if (!isDeletedChange) {
    return 'update';
  }

  const wasNotDeleted =
    isDeletedChange.before === false ||
    isDeletedChange.before === 0 ||
    isDeletedChange.before === '0';
  const isNowDeleted =
    isDeletedChange.after === true ||
    isDeletedChange.after === 1 ||
    isDeletedChange.after === '1';

  return wasNotDeleted && isNowDeleted ? 'delete' : 'update';
}

export interface AuditTrailEntryInput {
  modelType: string;
  foreignPk: Record<string, unknown>;
  userId: number;
  type: AuditTrailAction;
  data?: unknown;
  happenedAt?: Date;
}

export interface AuditTrailUpdateInput<T extends ObjectLiteral> {
  target: EntityTarget<T>;
  modelType: string;
  userId: number;
  before: T;
  after: T;
  ignoredColumns?: string[];
}

@Injectable()
export class AuditTrailService {
  async writeEntry(manager: EntityManager, input: AuditTrailEntryInput): Promise<void> {
    if (!manager || typeof (manager as any).createQueryBuilder !== 'function') {
      return;
    }

    const happenedAt = input.happenedAt ?? new Date();

    await manager
      .createQueryBuilder()
      .insert()
      .into(AuditTrailEntryEntity)
      .values({
        modelType: input.modelType,
        happenedAt: Math.floor(happenedAt.getTime() / 1000),
        foreignPk: JSON.stringify(input.foreignPk),
        userId: input.userId,
        type: input.type,
        data: this.serializeData(input.data),
      })
      .execute();
  }

  async writeUpdateEntry<T extends ObjectLiteral>(
    manager: EntityManager,
    input: AuditTrailUpdateInput<T>,
  ): Promise<void> {
    const columns = manager.getRepository(input.target).metadata.columns;
    const before = this.buildSnapshot(columns, input.before);
    const after = this.buildSnapshot(columns, input.after);
    const ignoredColumns = new Set(
      input.ignoredColumns ?? ['createdOn', 'updatedOn'],
    );
    const changes: AuditTrailChanges = {};

    for (const column of columns) {
      if (ignoredColumns.has(column.propertyName)) {
        continue;
      }

      const beforeValue = before[column.propertyName];
      const afterValue = after[column.propertyName];
      if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
        changes[column.propertyName] = {
          before: beforeValue,
          after: afterValue,
        };
      }
    }

    if (Object.keys(changes).length === 0) {
      return;
    }

    const primaryColumn = columns.find((column) => column.isPrimary);
    if (!primaryColumn) {
      return;
    }

    await this.writeEntry(manager, {
      modelType: input.modelType,
      foreignPk: {
        [primaryColumn.propertyName]: after[primaryColumn.propertyName],
      },
      userId: input.userId,
      type: resolveAuditUpdateAction(changes),
      data: { before, after, changes },
    });
  }

  private serializeData(data: unknown): string | null {
    if (data === null || data === undefined) {
      return null;
    }

    return JSON.stringify(data);
  }

  private buildSnapshot<T extends ObjectLiteral>(
    columns: Array<{ propertyName: string }>,
    entity: T,
  ): Record<string, unknown> {
    const snapshot: Record<string, unknown> = {};

    for (const column of columns) {
      const value = entity[column.propertyName] as unknown;
      snapshot[column.propertyName] =
        value instanceof Date
          ? Number.isNaN(value.getTime())
            ? null
            : value.toISOString()
          : (value ?? null);
    }

    return snapshot;
  }
}
