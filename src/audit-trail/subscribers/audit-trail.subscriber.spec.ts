import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditTrailSubscriber } from './audit-trail.subscriber';

function createSubscriberEvent(overrides: Record<string, any>) {
  return {
    metadata: {
      targetName: 'Lesson',
      primaryColumns: [{ propertyName: 'id' }],
      columns: [{ propertyName: 'id' }],
    },
    entity: {},
    entityId: undefined,
    queryRunner: { data: {} },
    manager: {},
    ...overrides,
  } as any;
}

describe('AuditTrailSubscriber', () => {
  let subscriber: AuditTrailSubscriber;
  let writeEntryMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    subscriber = new AuditTrailSubscriber();
    writeEntryMock = vi.fn(async () => undefined);
    (subscriber as any).auditTrailService = {
      writeEntry: writeEntryMock,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes create audit rows for audited inserts', async () => {
    const createdOn = new Date('2026-05-27T10:30:00.000Z');
    const updatedOn = new Date('2026-05-27T11:15:00.000Z');
    const event = createSubscriberEvent({
      metadata: {
        targetName: 'Lesson',
        primaryColumns: [{ propertyName: 'id' }],
        columns: [
          { propertyName: 'id' },
          { propertyName: 'createdOn' },
          { propertyName: 'updatedOn' },
          { propertyName: 'createdByUserId' },
        ],
      },
      entity: {
        id: 101,
        createdOn,
        updatedOn,
        createdByUserId: 401,
      },
      entityId: 101,
      queryRunner: { data: { currentUserId: 777 } },
    });

    await subscriber.afterInsert(event);

    expect(writeEntryMock).toHaveBeenCalledTimes(1);
    expect(writeEntryMock).toHaveBeenCalledWith(
      event.manager,
      expect.objectContaining({
        modelType: 'common\\models\\Lesson',
        foreignPk: { id: 101 },
        userId: 777,
        type: 'create',
        data: {
          id: 101,
          createdOn: '2026-05-27T10:30:00.000Z',
          updatedOn: '2026-05-27T11:15:00.000Z',
          createdByUserId: 401,
        },
      }),
    );
  });

  it('normalizes invalid dates to null instead of throwing', async () => {
    const invalidDate = new Date('invalid');
    const validDate = new Date('2026-05-27T10:30:00.000Z');
    const event = createSubscriberEvent({
      metadata: {
        targetName: 'Enrolment',
        primaryColumns: [{ propertyName: 'id' }],
        columns: [
          { propertyName: 'id' },
          { propertyName: 'startDate' },
          { propertyName: 'createdOn' },
        ],
      },
      entity: {
        id: 201,
        startDate: invalidDate,
        createdOn: validDate,
      },
      entityId: 201,
      queryRunner: { data: { currentUserId: 7001 } },
    });

    await expect(subscriber.afterInsert(event)).resolves.toBeUndefined();

    expect(writeEntryMock).toHaveBeenCalledTimes(1);
    expect(writeEntryMock).toHaveBeenCalledWith(
      event.manager,
      expect.objectContaining({
        modelType: 'common\\models\\Enrolment',
        foreignPk: { id: 201 },
        userId: 7001,
        type: 'create',
        data: {
          id: 201,
          startDate: null,
          createdOn: '2026-05-27T10:30:00.000Z',
        },
      }),
    );
  });

  it('writes update diffs for audited updates and ignores timestamp-only changes', async () => {
    const beforeUpdatedOn = new Date('2026-05-27T10:30:00.000Z');
    const afterUpdatedOn = new Date('2026-05-27T11:30:00.000Z');
    const event = createSubscriberEvent({
      metadata: {
        targetName: 'Invoice',
        primaryColumns: [{ propertyName: 'id' }],
        columns: [
          { propertyName: 'id' },
          { propertyName: 'status' },
          { propertyName: 'updatedOn' },
        ],
      },
      databaseEntity: {
        id: 301,
        status: 1,
        updatedOn: beforeUpdatedOn,
      },
      entity: {
        id: 301,
        status: 2,
        updatedOn: afterUpdatedOn,
      },
      entityId: 301,
      queryRunner: { data: { currentUserId: 888 } },
    });

    await subscriber.afterUpdate(event);

    expect(writeEntryMock).toHaveBeenCalledTimes(1);
    expect(writeEntryMock).toHaveBeenCalledWith(
      event.manager,
      expect.objectContaining({
        modelType: 'common\\models\\Invoice',
        foreignPk: { id: 301 },
        userId: 888,
        type: 'update',
        data: {
          before: {
            id: 301,
            status: 1,
            updatedOn: '2026-05-27T10:30:00.000Z',
          },
          after: {
            id: 301,
            status: 2,
            updatedOn: '2026-05-27T11:30:00.000Z',
          },
          changes: {
            status: {
              before: 1,
              after: 2,
            },
          },
        },
      }),
    );
  });

  it('classifies an isDeleted false-to-true update as delete', async () => {
    const event = createSubscriberEvent({
      metadata: {
        targetName: 'InvoiceLineItem',
        primaryColumns: [{ propertyName: 'id' }],
        columns: [{ propertyName: 'id' }, { propertyName: 'isDeleted' }],
      },
      databaseEntity: {
        id: 401,
        isDeleted: 0,
      },
      entity: {
        id: 401,
        isDeleted: 1,
      },
      entityId: 401,
      queryRunner: { data: { currentUserId: 694 } },
    });

    await subscriber.afterUpdate(event);

    expect(writeEntryMock).toHaveBeenCalledWith(
      event.manager,
      expect.objectContaining({
        foreignPk: { id: 401 },
        userId: 694,
        type: 'delete',
        data: expect.objectContaining({
          changes: {
            isDeleted: {
              before: 0,
              after: 1,
            },
          },
        }),
      }),
    );
  });

  it('keeps an isDeleted true-to-false restore classified as update', async () => {
    const event = createSubscriberEvent({
      metadata: {
        targetName: 'InvoiceLineItem',
        primaryColumns: [{ propertyName: 'id' }],
        columns: [{ propertyName: 'id' }, { propertyName: 'isDeleted' }],
      },
      databaseEntity: {
        id: 402,
        isDeleted: true,
      },
      entity: {
        id: 402,
        isDeleted: false,
      },
      entityId: 402,
      queryRunner: { data: { currentUserId: 694 } },
    });

    await subscriber.afterUpdate(event);

    expect(writeEntryMock).toHaveBeenCalledWith(
      event.manager,
      expect.objectContaining({
        foreignPk: { id: 402 },
        userId: 694,
        type: 'update',
      }),
    );
  });

  it('writes delete audit rows using the console fallback user when no actor is available', async () => {
    const event = createSubscriberEvent({
      metadata: {
        targetName: 'UserEmail',
        primaryColumns: [{ propertyName: 'id' }],
        columns: [
          { propertyName: 'id' },
          { propertyName: 'email' },
        ],
      },
      entity: {
        id: 501,
        email: 'test@example.com',
      },
      entityId: 501,
      queryRunner: { data: {} },
    });

    await subscriber.afterRemove(event);

    expect(writeEntryMock).toHaveBeenCalledTimes(1);
    expect(writeEntryMock).toHaveBeenCalledWith(
      event.manager,
      expect.objectContaining({
        modelType: 'common\\models\\UserEmail',
        foreignPk: { id: 501 },
        userId: 727,
        type: 'delete',
        data: {
          id: 501,
          email: 'test@example.com',
        },
      }),
    );
  });

  it('ignores entities that are not audited', async () => {
    const event = createSubscriberEvent({
      metadata: {
        targetName: 'NotAuditedEntity',
        primaryColumns: [{ propertyName: 'id' }],
        columns: [{ propertyName: 'id' }],
      },
      entity: { id: 9001 },
      entityId: 9001,
    });

    await subscriber.afterInsert(event);
    await subscriber.afterUpdate(event);
    await subscriber.afterRemove(event);

    expect(writeEntryMock).not.toHaveBeenCalled();
  });
});
