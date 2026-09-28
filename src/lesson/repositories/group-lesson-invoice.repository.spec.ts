import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GroupLessonInvoiceRepository } from './group-lesson-invoice.repository';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';
import * as royaltyUtils from '../../utils/royality/royalty-calculation.util';
import { Lesson } from '../entities/lesson.entity';
import { Item } from '../../item/entities/item.entity';
import { Qualification } from '../../qualification/entities/qualification.entity';

function createRepositoryMock() {
  return {
    createQueryBuilder: vi.fn(),
    findOne: vi.fn(),
  };
}

function createManagerMock(teacherId: number) {
  let transactionId = 1000;
  let rawCallCount = 0;
  const transactionBuilder = {
    insert: vi.fn().mockReturnThis(),
    into: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    execute: vi.fn(async () => ({
      identifiers: [{ id: ++transactionId }],
      raw: { insertId: transactionId },
      generatedMaps: [{ id: transactionId }],
    })),
    getRawOne: vi.fn(async () => {
      rawCallCount += 1;
      if (rawCallCount === 1) {
        return { teacherId };
      }
      return { total: 0 };
    }),
  };

  const invoiceQueryBuilder = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    getOne: vi.fn().mockResolvedValue(null),
  };

  const save = vi.fn(async (_entity: unknown, payload?: Record<string, any>) => {
    const record = payload ?? {};
    if (record && typeof record === 'object' && record.id == null) {
      record.id = ++transactionId;
    }
    return record;
  });

  const manager: any = {
    transaction: vi.fn(async (callback: (manager: any) => Promise<unknown>) =>
      callback(manager),
    ),
    createQueryBuilder: vi.fn(() => transactionBuilder),
    getRepository: vi.fn((entity: unknown) => {
      if (entity === Invoice) {
        return {
          createQueryBuilder: vi.fn(() => invoiceQueryBuilder),
        };
      }
      if (entity === Qualification) {
        return {
          findOne: vi.fn().mockResolvedValue(null),
        };
      }
      return {
        createQueryBuilder: vi.fn(() => invoiceQueryBuilder),
      };
    }),
    findOne: vi.fn(async (entity: unknown) => {
      if (entity === Item) {
        return { id: 77, taxStatusId: 1 };
      }
      return null;
    }),
    create: vi.fn((_entity: unknown, payload: Record<string, unknown>) => ({ ...payload })),
    save,
  };

  return manager;
}

describe('GroupLessonInvoiceRepository rounding', () => {
  let repository: GroupLessonInvoiceRepository;
  let lessonRepository: ReturnType<typeof createRepositoryMock>;
  let manager: ReturnType<typeof createManagerMock>;

  beforeEach(() => {
    lessonRepository = createRepositoryMock();
    manager = createManagerMock(77);
    lessonRepository.manager = manager as any;

    repository = new GroupLessonInvoiceRepository(
      lessonRepository as any,
      {
        findLogObjectByName: vi.fn().mockResolvedValue(null),
        createLog: vi.fn(),
      } as any,
      {
        findLogObjectByName: vi.fn().mockResolvedValue(null),
      } as any,
      {
        findLogActivityByName: vi.fn().mockResolvedValue(null),
      } as any,
      {
        getLocationDetails: vi.fn().mockResolvedValue(null),
      } as any,
    );

    vi.spyOn(royaltyUtils, 'resolveRoyaltySnapshot').mockResolvedValue({
      categoryId: null,
      rate: 0,
      advertisementRate: 1.25,
    } as any);
  });

  it('stores a rounded net total for group lesson invoices', async () => {
    const lesson = Object.assign(new Lesson(), {
      id: 101,
      courseId: 55,
      teacherId: 77,
      date: new Date('2026-09-10T18:30:00.000Z'),
      duration: '00:30:00',
      status: 2,
      isPresent: true,
      isDeleted: false,
      isConfirmed: true,
      programRate: 28.755,
      teacher: {
        profile: {
          firstname: 'Grace',
          lastname: 'Lee',
        },
      },
      course: {
        program: {
          id: 91,
          name: 'Piano Core',
        },
      },
    });
    const enrolment = {
      id: 501,
      courseId: 55,
      isDeleted: 0,
      isConfirmed: 1,
      student: {
        id: 701,
        firstName: 'Sam',
        lastName: 'Smith',
        user: {
          id: 801,
          userLocation: {
            locationId: 1,
          },
        },
      },
      course: {
        program: {
          id: 91,
          name: 'Piano Core',
        },
      },
    } as any;

    const result = await (repository as any).createInvoiceForEnrolment(
      lesson,
      enrolment,
      9001,
      {
        item: { id: 77, taxStatusId: 1 },
        courseProgramRate: { applyFullDiscount: false },
      },
    );

    expect(result.alreadyExists).toBe(false);
    expect(manager.save).toHaveBeenCalledWith(
      InvoiceLineItem,
      expect.objectContaining({
        netTotal: 28.76,
        advertisementRateApplied: 1.25,
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      Invoice,
      expect.objectContaining({
        total: 28.76,
        balance: 28.76,
      }),
    );
  });
});
