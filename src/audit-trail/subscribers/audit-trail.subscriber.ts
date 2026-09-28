import { EventSubscriber, EntitySubscriberInterface, InsertEvent, RemoveEvent, UpdateEvent } from 'typeorm';
import {
  AuditTrailService,
  resolveAuditUpdateAction,
} from '../services/audit-trail.service';

type AuditTrailSource = Record<string, unknown>;

const AUDITED_MODEL_TYPES: Record<string, string> = {
  UserAddress: 'common\\models\\UserAddress',
  CustomerPaymentPreference: 'common\\models\\CustomerPaymentPreference',
  Lesson: 'common\\models\\Lesson',
  CustomerRecurringPaymentEnrolment: 'common\\models\\CustomerRecurringPaymentEnrolment',
  Enrolment: 'common\\models\\Enrolment',
  GroupLesson: 'common\\models\\GroupLesson',
  EquipmentRentalInvoice: 'common\\models\\EquipmentRentalInvoice',
  UserPhone: 'common\\models\\UserPhone',
  CustomerRecurringPayment: 'common\\models\\CustomerRecurringPayment',
  RecurringPayment: 'common\\models\\RecurringPayment',
  User: 'common\\models\\User',
  Student: 'common\\models\\Student',
  Course: 'common\\models\\Course',
  EnrolmentPaymentFrequency: 'common\\models\\EnrolmentPaymentFrequency',
  Invoice: 'common\\models\\Invoice',
  Payment: 'common\\models\\Payment',
  PosTransaction: 'common\\models\\PosTransaction',
  InvoiceLineItemDiscount: 'common\\models\\InvoiceLineItemDiscount',
  EquipmentRentalInstrument: 'common\\models\\EquipmentRentalInstruments',
  InvoiceLineItem: 'common\\models\\InvoiceLineItem',
  ItemCategory: 'common\\models\\ItemCategory',
  LocationDebt: 'common\\models\\LocationDebt',
  LocationCategoryRoyalty: 'common\\models\\LocationCategoryRoyalty',
  RoyaltyTransaction: 'common\\models\\RoyaltyTransaction',
  EnrolmentDiscount: 'common\\models\\EnrolmentDiscount',
  CustomerDiscount: 'common\\models\\CustomerDiscount',
  LessonDiscount: 'common\\models\\LessonDiscount',
  EquipmentRental: 'common\\models\\EquipmentRentals',
  LessonPayment: 'common\\models\\LessonPayment',
  InvoicePayment: 'common\\models\\InvoicePayment',
  UserEmail: 'common\\models\\UserEmail',
  CustomerAccount: 'common\\models\\CustomerAccount',
};

const IGNORED_UPDATE_COLUMNS = new Set(['createdOn', 'updatedOn']);
const QUERY_RUNNER_USER_ID_KEYS = ['currentUserId', 'auditTrailUserId', 'actorUserId'] as const;
const ENTITY_USER_ID_KEYS = ['updatedByUserId', 'updatedUserId', 'createdByUserId', 'createdUserId'] as const;
const CONSOLE_USER_ID = 727;

@EventSubscriber()
export class AuditTrailSubscriber implements EntitySubscriberInterface {
  private readonly auditTrailService = new AuditTrailService();

  async afterInsert(event: InsertEvent<AuditTrailSource>): Promise<void> {
    const modelType = this.resolveModelType(event.metadata.targetName);
    if (!modelType) {
      return;
    }

    const source = this.normalizeSource(event.entity);
    const foreignPk = this.resolveForeignPk(event.metadata.primaryColumns, source, event.entityId);
    if (!foreignPk) {
      return;
    }

    await this.auditTrailService.writeEntry(event.manager, {
      modelType,
      foreignPk,
      userId: this.resolveActorUserId(event.queryRunner?.data, source),
      type: 'create',
      data: this.buildSnapshot(event.metadata.columns, source),
    });
  }

  async afterUpdate(event: UpdateEvent<AuditTrailSource>): Promise<void> {
    const modelType = this.resolveModelType(event.metadata.targetName);
    if (!modelType) {
      return;
    }

    const beforeSource = this.normalizeSource(event.databaseEntity);
    const afterSource = this.mergeSources(beforeSource, event.entity);
    const changes = this.buildChanges(event.metadata.columns, beforeSource, afterSource);
    if (Object.keys(changes).length === 0) {
      return;
    }

    const foreignPk = this.resolveForeignPk(
      event.metadata.primaryColumns,
      afterSource ?? beforeSource,
      event.databaseEntity,
    );
    if (!foreignPk) {
      return;
    }

    await this.auditTrailService.writeEntry(event.manager, {
      modelType,
      foreignPk,
      userId: this.resolveActorUserId(event.queryRunner?.data, afterSource, beforeSource),
      type: resolveAuditUpdateAction(changes),
      data: {
        before: this.buildSnapshot(event.metadata.columns, beforeSource),
        after: this.buildSnapshot(event.metadata.columns, afterSource),
        changes,
      },
    });
  }

  async afterRemove(event: RemoveEvent<AuditTrailSource>): Promise<void> {
    const modelType = this.resolveModelType(event.metadata.targetName);
    if (!modelType) {
      return;
    }

    const source = this.normalizeSource(event.entity ?? event.databaseEntity);
    const foreignPk = this.resolveForeignPk(event.metadata.primaryColumns, source, event.entityId);
    if (!foreignPk) {
      return;
    }

    await this.auditTrailService.writeEntry(event.manager, {
      modelType,
      foreignPk,
      userId: this.resolveActorUserId(event.queryRunner?.data, source),
      type: 'delete',
      data: this.buildSnapshot(event.metadata.columns, source),
    });
  }

  private resolveModelType(targetName: string | undefined): string | null {
    if (!targetName) {
      return null;
    }

    return AUDITED_MODEL_TYPES[targetName] ?? null;
  }

  private resolveForeignPk(
    primaryColumns: Array<{ propertyName: string}>,
    source: AuditTrailSource | null,
    entityId: unknown,
  ): Record<string, unknown> | null {
    const primaryKey = this.extractPrimaryKey(primaryColumns, source);

    if (primaryKey) {
      return primaryKey;
    }

    if (entityId === null || entityId === undefined) {
      return null;
    }

    if (typeof entityId === 'object' && !Array.isArray(entityId)) {
      return this.buildSnapshotFromObject(entityId as AuditTrailSource);
    }

    if (primaryColumns.length === 0) {
      return null;
    }

    return {
      [primaryColumns[0].propertyName]: this.normalizeValue(entityId),
    };
  }


  private extractPrimaryKey(
    primaryColumns: Array<{ propertyName: string }>,
    source: AuditTrailSource | null,
  ): Record<string, unknown> | null {
    if (!source || primaryColumns.length === 0) {
      return null;
    }

    const primaryKey: Record<string, unknown> = {};

    for (const column of primaryColumns) {
      if (!Object.prototype.hasOwnProperty.call(source, column.propertyName)) {
        return null;
      }

      primaryKey[column.propertyName] = this.normalizeValue(source[column.propertyName]);
    }

    return primaryKey;
  }

  private buildSnapshot(
    columns: Array<{ propertyName: string }>,
    source: AuditTrailSource | null,
  ): Record<string, unknown> {
    if (!source) {
      return {};
    }

    const snapshot: Record<string, unknown> = {};

    for (const column of columns) {
      snapshot[column.propertyName] = this.normalizeValue(source[column.propertyName]);
    }

    return snapshot;
  }


  private buildSnapshotFromObject(source: AuditTrailSource): Record<string, unknown> {
    const snapshot: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      snapshot[key] = this.normalizeValue(value);
    }
    return snapshot;
  }

  private buildChanges(
    columns: Array<{ propertyName: string }>,
    beforeSource: AuditTrailSource | null,
    afterSource: AuditTrailSource | null,
  ): Record<string, { before: unknown; after: unknown }> {
    const changes: Record<string, { before: unknown; after: unknown }> = {};

    if (!beforeSource || !afterSource) {
      return changes;
    }

    for (const column of columns) {
      if (IGNORED_UPDATE_COLUMNS.has(column.propertyName)) {
        continue;
      }

      const beforeValue = this.normalizeValue(beforeSource[column.propertyName]);
      const afterValue = this.normalizeValue(afterSource[column.propertyName]);

      if (!this.valuesEqual(beforeValue, afterValue)) {
        changes[column.propertyName] = {
          before: beforeValue,
          after: afterValue,
        };
      }
    }

    return changes;
  }

  private resolveActorUserId(
    queryRunnerData: AuditTrailSource | undefined,
    entitySource?: AuditTrailSource | null,
    fallbackSource?: AuditTrailSource | null,
  ): number {
    for (const key of QUERY_RUNNER_USER_ID_KEYS) {
      const candidate = queryRunnerData?.[key];
      const userId = this.toPositiveInteger(candidate);
      if (userId) {
        return userId;
      }
    }

    for (const source of [entitySource, fallbackSource]) {
      if (!source) {
        continue;
      }

      for (const key of ENTITY_USER_ID_KEYS) {
        const userId = this.toPositiveInteger(source[key]);
        if (userId) {
          return userId;
        }
      }
    }

    return CONSOLE_USER_ID;
  }

  private mergeSources(
    baseSource: AuditTrailSource | null,
    updateSource: AuditTrailSource | undefined,
  ): AuditTrailSource | null {
    if (!baseSource && !updateSource) {
      return null;
    }

    const merged = { ...(baseSource ?? {}) } as AuditTrailSource;
    for (const [key, value] of Object.entries(updateSource ?? {})) {
      if (value !== undefined) {
        merged[key] = value;
      }
    }

    return merged;
  }

  private normalizeSource(source: unknown): AuditTrailSource | null {
    if (!source || typeof source !== 'object') {
      return null;
    }

    return source as AuditTrailSource;
  }

  private normalizeValue(value: unknown): unknown {
    if (value === undefined) {
      return null;
    }

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        return null;
      }

      return value.toISOString();
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    return value;
  }

  private toPositiveInteger(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsedValue = Number(value);
    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
      return null;
    }

    return parsedValue;
  }

  private valuesEqual(beforeValue: unknown, afterValue: unknown): boolean {
    return JSON.stringify(beforeValue) === JSON.stringify(afterValue);
  }
}
