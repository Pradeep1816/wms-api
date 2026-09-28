import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityManager } from 'typeorm';
import { InvoiceReceivePaymentService } from '../../src/payment/services/receive-payment.service';
import { Payment } from '../../src/payment/entities/payment.entity';
import { PaymentMethodType } from '../../src/payment/enums/payment-method-type.enum';
import { Invoice } from '../../src/invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../../src/invoice/entities/invoice-line-item.entity';
import { InvoicePayment } from '../../src/invoice/entities/invoice-payment.entity';
import { Item } from '../../src/item/entities/item.entity';
import { ItemTypeEnum } from '../../src/invoice/enums/item-type.enum';
import { GroupLesson } from '../../src/lesson/entities/group-lesson.entity';
import { Lesson } from '../../src/lesson/entities/lesson.entity';
import { LessonStatusEnum } from '../../src/lesson/enums/lesson-status';
import { LessonPayment } from '../../src/lesson/entities/lesson-payment.entity';
import { InvoicePaymentEditRepository } from '../../src/invoice/repositories/invoice-payment-edit.repository';
import { ReceivePaymentRepository } from '../../src/invoice/repositories/receive-payment.repository';
import { ReceivePaymentCashApplierService } from '../../src/payment/services/receive-payment/receive-payment-cash-applier.service';
import { ReceivePaymentCreditApplierService } from '../../src/payment/services/receive-payment/receive-payment-credit-applier.service';
import { ReceivePaymentNegativeService } from '../../src/payment/services/receive-payment/receive-payment-negative.service';
import { ReceivePaymentPaymentFactoryService } from '../../src/payment/services/receive-payment/receive-payment-payment-factory.service';
import { ReceivePaymentPostProcessorService } from '../../src/payment/services/receive-payment/receive-payment-post-processor.service';
import { ReceivePaymentWorkBuilderService } from '../../src/payment/services/receive-payment/receive-payment-work-builder.service';
import { ReceivePaymentValidationService } from '../../src/payment/services/receive-payment/receive-payment-validation.service';
import * as dateUtils from '../../src/utils/date-utils';

function createRepositoryMock() {
  return {
    createQueryBuilder: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(async () => undefined),
    createTransaction: vi.fn(),
    createPayment: vi.fn(),
    createInvoicePayment: vi.fn(async () => ({})),
    createLessonPayment: vi.fn(async () => ({})),
    createCreditUsage: vi.fn(async () => ({})),
    createPaymentCreditInvoiceWithLineItem: vi.fn(async () => ({ id: 1 })),
    save: vi.fn(async (value: unknown) => value),
  };
}

function createQueryBuilderMock(result: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    leftJoinAndSelect: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    getOne: vi.fn(async () => result),
    getRawOne: vi.fn(async () => result),
    getRawMany: vi.fn(async () => result),
  };
}

function createManagerMock(repositories: Record<string, ReturnType<typeof createRepositoryMock>>) {
  return {
    getRepository: vi.fn((entity: { name?: string }) => {
      const repository = repositories[entity.name || ''];
      if (!repository) {
        throw new Error(`Unexpected repository request: ${entity.name}`);
      }
      return repository;
    }),
  } as any as EntityManager;
}

function createReceivePaymentRepositoryServiceMock() {
  return {
    findInvoiceTargetsForCustomer: vi.fn(async () => new Map()),
    findPrivateLessonTargetsForCustomer: vi.fn(async () => new Map()),
    findGroupLessonTargetsForCustomer: vi.fn(async () => new Map()),
    findInvoiceCreditSourcesForCustomer: vi.fn(async () => new Map()),
    findPaymentCreditSourcesForCustomer: vi.fn(async () => new Map()),
    createTransaction: vi.fn(async () => 1),
    createPayment: vi.fn(async (value: unknown) => value),
    createInvoicePayment: vi.fn(async (value: unknown) => value),
    createLessonPayment: vi.fn(async (value: unknown) => value),
    createCreditUsage: vi.fn(async (value: unknown) => value),
    createPaymentCreditInvoiceWithLineItem: vi.fn(async () => ({ id: 1 })),
    recalculatePaymentBalance: vi.fn(async () => 0),
    recalculateInvoiceBalance: vi.fn(async () => undefined),
    recalculatePrivateLessonBalance: vi.fn(async () => undefined),
    recalculateGroupLessonBalance: vi.fn(async () => undefined),
  };
}

describe('receive-payment parity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('negative validation', () => {
    const service = new ReceivePaymentValidationService();

    it('allows negative saves that only use payment credits', () => {
      expect(() =>
        service.validateNegativeFlowSelections(
          [],
          [],
          [],
          [],
          [{ id: 22, requested: 10, remainingCredit: 10 }],
        ),
      ).not.toThrow();
    });

    it('allows negative saves that only use invoice credits', () => {
      expect(() =>
        service.validateNegativeFlowSelections(
          [],
          [],
          [],
          [{ id: 11, requested: 10, remainingCredit: 10 }],
          [],
        ),
      ).not.toThrow();
    });

    it('rejects negative saves with no credits at all', () => {
      expect(() => service.validateNegativeFlowSelections([], [], [], [], [])).toThrow(
        'Select Any Invoice credits to apply negative payment',
      );
    });

    it('rejects negative saves with invoice, lesson, or group distributions', () => {
      expect(() =>
        service.validateNegativeFlowSelections(
          [{ id: 1, requested: 5, remainingRequest: 5 }],
          [],
          [],
          [{ id: 11, requested: 10, remainingCredit: 10 }],
          [],
        ),
      ).toThrow('Negative Payment can be applied to only invoice credits.');
    });
  });

  describe('validation service basics', () => {
    const service = new ReceivePaymentValidationService();

    it('allows zero amount without a payment method', () => {
      expect(() => service.validateAmountAndMethod(0)).not.toThrow();
    });

    it('rejects non-zero amount without a payment method', () => {
      expect(() => service.validateAmountAndMethod(25)).toThrow(
        'Payment Method cannot be blank.',
      );
    });

    it('rejects a non-finite amount', () => {
      expect(() => service.validateAmountAndMethod(Number.NaN, 1)).toThrow(
        'Amount must be number',
      );
    });

    it('parses a valid payment date', () => {
      const parsed = service.parsePaymentDate('2026-05-14T00:00:00.000Z');
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed.toISOString()).toBe('2026-05-14T00:00:00.000Z');
    });

    it('rejects an invalid payment date', () => {
      expect(() => service.parsePaymentDate('bad-date')).toThrow(
        'Invalid payment date format',
      );
    });

    it('blocks non-admin backdated payment creation', () => {
      vi.spyOn(dateUtils, 'getCurrentESTDate').mockReturnValue(
        new Date('2026-05-14T12:00:00.000Z'),
      );

      expect(() =>
        service.validateCreateDate(new Date('2026-04-30T12:00:00.000Z'), false),
      ).toThrow('Payment Date cannot be set prior to first day of current month');
    });

    it('allows admin backdated payment creation', () => {
      expect(() =>
        service.validateCreateDate(new Date('2020-01-01T00:00:00.000Z'), true),
      ).not.toThrow();
    });

    it('rejects canceled lessons during validation', async () => {
      const manager = {
        find: vi.fn(async () => [{ id: 9001 }]),
      } as any as EntityManager;

      await expect(service.validateCanceledLessons(manager, [9001])).rejects.toThrow(
        'One of the choosen lesson is canceled so please cancel the payment and retry',
      );
      expect(manager.find).toHaveBeenCalledWith(Lesson, {
        where: {
          id: expect.any(Object),
          status: LessonStatusEnum.CANCELED,
        },
      });
    });

    it('accepts active lessons during validation', async () => {
      const manager = {
        find: vi.fn(async () => []),
      } as any as EntityManager;

      await expect(service.validateCanceledLessons(manager, [9001])).resolves.toBeUndefined();
      expect(manager.find).toHaveBeenCalledTimes(1);
    });

    it('accepts balanced distribution totals', () => {
      expect(() =>
        service.validateRequestedDistributionTotals(
          100,
          [{ id: 1, requested: 50, remainingRequest: 50 }],
          [{ id: 2, requested: 25, remainingRequest: 25 }],
          [{ id: 3, requested: 25, remainingRequest: 25 }],
          [],
          [],
        ),
      ).not.toThrow();
    });

    it('rejects mismatched distribution totals', () => {
      expect(() =>
        service.validateRequestedDistributionTotals(
          100,
          [{ id: 1, requested: 60, remainingRequest: 60 }],
          [{ id: 2, requested: 25, remainingRequest: 25 }],
          [{ id: 3, requested: 20, remainingRequest: 20 }],
          [],
          [],
        ),
      ).toThrow('Amount mismatched with distributions');
    });
  });

  describe('cash allocation', () => {
    let repository: ReturnType<typeof createRepositoryMock>;
    let service: ReceivePaymentCashApplierService;
    const manager = {} as EntityManager;

    beforeEach(() => {
      repository = createRepositoryMock();
      service = new ReceivePaymentCashApplierService(repository as any);
    });

    it('applies cash to invoice targets with a small positive balance', async () => {
      const invoiceWork = [
        {
          id: 11,
          requested: 1,
          remainingRequest: 1,
          target: { id: 101, invoiceNumber: 5001 },
          remainingBalance: 0.05,
        },
      ];
      const affectedInvoiceIds = new Set<number>();

      const remaining = await service.applyCashToInvoiceTargets(
        manager,
        301,
        1,
        invoiceWork as any,
        401,
        affectedInvoiceIds,
      );

      expect(repository.createInvoicePayment).toHaveBeenCalledWith(101, 301, 0.05, 401, manager);
      expect(remaining).toBe(0.95);
      expect(invoiceWork[0].remainingRequest).toBe(0.95);
      expect(invoiceWork[0].remainingBalance).toBe(0);
      expect(affectedInvoiceIds.has(101)).toBe(true);
    });

    it('applies cash to private lesson targets with a small positive balance', async () => {
      const lessonWork = [
        {
          id: 12,
          requested: 1,
          remainingRequest: 1,
          target: { lessonId: 201, enrolmentId: 301, balance: 0.05 },
          remainingBalance: 0.05,
        },
      ];
      const affectedPrivateLessonIds = new Set<number>();

      const remaining = await service.applyCashToLessonTargets(
        manager,
        302,
        1,
        lessonWork as any,
        402,
        affectedPrivateLessonIds,
      );

      expect(repository.createLessonPayment).toHaveBeenCalledWith(
        201,
        302,
        301,
        0.05,
        402,
        manager,
      );
      expect(remaining).toBe(0.95);
      expect(lessonWork[0].remainingRequest).toBe(0.95);
      expect(lessonWork[0].remainingBalance).toBe(0);
      expect(affectedPrivateLessonIds.has(201)).toBe(true);
    });

    it('applies cash to group lesson targets with a small positive balance', async () => {
      const groupWork = [
        {
          id: 13,
          requested: 1,
          remainingRequest: 1,
          target: { lessonId: 401, enrolmentId: 501, balance: 0.05 },
          remainingBalance: 0.05,
        },
      ];
      const affectedGroupLessonKeys = new Map<string, { lessonId: number; enrolmentId: number }>();

      const remaining = await service.applyCashToGroupTargets(
        manager,
        303,
        1,
        groupWork as any,
        403,
        affectedGroupLessonKeys as any,
      );

      expect(repository.createLessonPayment).toHaveBeenCalledWith(
        401,
        303,
        501,
        0.05,
        403,
        manager,
      );
      expect(remaining).toBe(0.95);
      expect(groupWork[0].remainingRequest).toBe(0.95);
      expect(groupWork[0].remainingBalance).toBe(0);
      expect(affectedGroupLessonKeys.has('401:501')).toBe(true);
    });
  });

  describe('credit allocation and lookup', () => {
    let repository: ReturnType<typeof createRepositoryMock>;
    let creditApplierService: ReceivePaymentCreditApplierService;
    let receivePaymentRepository: ReceivePaymentRepository;
    const manager = {} as EntityManager;

    beforeEach(() => {
      repository = createRepositoryMock();
      receivePaymentRepository = new ReceivePaymentRepository();
      creditApplierService = new ReceivePaymentCreditApplierService(
        repository as any,
        {} as any,
      );
    });

    it('applies existing payment credits to invoice targets with a small positive balance', async () => {
      const credit = {
        source: { id: 700, reference: 'P-00700', balance: 1 },
        requested: 1,
        remainingCredit: 1,
      };
      const invoiceWork = [
        {
          id: 14,
          requested: 1,
          remainingRequest: 1,
          target: { id: 601, invoiceNumber: 6001 },
          remainingBalance: 0.05,
        },
      ];
      const affectedInvoiceIds = new Set<number>();

      const applied = await creditApplierService.applyExistingPaymentCreditToInvoices(
        manager,
        credit as any,
        invoiceWork as any,
        800,
        affectedInvoiceIds,
      );

      expect(applied).toBe(true);
      expect(repository.createInvoicePayment).toHaveBeenCalledWith(601, 700, 0.05, 800, manager);
      expect(credit.remainingCredit).toBe(0.95);
      expect(invoiceWork[0].remainingRequest).toBe(0.95);
      expect(invoiceWork[0].remainingBalance).toBe(0);
      expect(affectedInvoiceIds.has(601)).toBe(true);
    });

    it('keeps payment credits above the legacy credit threshold only', async () => {
      const paymentRows = [{ id: 51, reference: 'P-00051', balance: 0.25 }];
      const paymentQueryBuilder = createQueryBuilderMock(paymentRows);
      const paymentRepository = createRepositoryMock();
      paymentRepository.createQueryBuilder.mockReturnValue(paymentQueryBuilder);
      const lookupManager = createManagerMock({ [Payment.name]: paymentRepository });

      const result = await receivePaymentRepository.findPaymentCreditSourcesForCustomer(
        [51],
        99,
        lookupManager,
      );

      expect(paymentQueryBuilder.andWhere).toHaveBeenCalledWith(
        'ROUND(payment.balance, 2) > 0.09',
      );
      expect(paymentQueryBuilder.andWhere).toHaveBeenCalledWith(
        'payment.paymentMethodId NOT IN (:...excludedMethods)',
        {
          excludedMethods: [
            PaymentMethodType.CREDIT_USED,
            PaymentMethodType.CREDIT_APPLIED,
          ],
        },
      );
      expect(result.get(51)).toEqual({
        id: 51,
        reference: 'P-00051',
        balance: 0.25,
      });
    });
  });

  describe('status recalculation', () => {
    let repository: ReceivePaymentRepository;

    beforeEach(() => {
      repository = new ReceivePaymentRepository();
    });

    it('marks invoices with a small positive balance as owing', async () => {
      const invoice = {
        id: 21,
        total: 100,
        balance: 0,
        status: Invoice.STATUS_PAID,
        updatedUserId: 10,
      };
      const invoiceRepository = createRepositoryMock();
      invoiceRepository.findOne.mockResolvedValue(invoice);

      const invoicePaymentQueryBuilder = createQueryBuilderMock({ total: '99.95' });
      const invoicePaymentRepository = createRepositoryMock();
      invoicePaymentRepository.createQueryBuilder.mockReturnValue(invoicePaymentQueryBuilder);

      const manager = createManagerMock({
        [Invoice.name]: invoiceRepository,
        [InvoicePayment.name]: invoicePaymentRepository,
      });

      await repository.recalculateInvoiceBalance(21, 77, manager);

      expect(invoice.balance).toBe(0.05);
      expect(invoice.status).toBe(Invoice.STATUS_OWING);
      expect(invoice.updatedUserId).toBe(77);
      expect(invoiceRepository.save).toHaveBeenCalledWith(invoice);
    });

    it('rounds half-cent invoice totals to zero like legacy behavior', async () => {
      const invoice = {
        id: 22,
        total: 31.525,
        balance: -0.01,
        status: Invoice.STATUS_CREDIT,
        updatedUserId: 10,
      };
      const invoiceRepository = createRepositoryMock();
      invoiceRepository.findOne.mockResolvedValue(invoice);

      const invoicePaymentQueryBuilder = createQueryBuilderMock({ total: '31.5300' });
      const invoicePaymentRepository = createRepositoryMock();
      invoicePaymentRepository.createQueryBuilder.mockReturnValue(invoicePaymentQueryBuilder);

      const manager = createManagerMock({
        [Invoice.name]: invoiceRepository,
        [InvoicePayment.name]: invoicePaymentRepository,
      });

      await repository.recalculateInvoiceBalance(22, 77, manager);

      expect(invoice.balance).toBe(0);
      expect(invoice.status).toBe(Invoice.STATUS_PAID);
      expect(invoice.updatedUserId).toBe(77);
      expect(invoiceRepository.save).toHaveBeenCalledWith(invoice);
    });

    it('marks group lessons with a small positive balance as owing', async () => {
      const groupLesson = {
        id: 31,
        lessonId: 301,
        enrolmentId: 401,
        total: 100,
        balance: 0,
        paidStatus: GroupLesson.STATUS_PAID,
        updatedByUserId: 10,
      };
      const groupLessonRepository = createRepositoryMock();
      groupLessonRepository.findOne.mockResolvedValue(groupLesson);

      const lessonPaymentQueryBuilder = createQueryBuilderMock({ total: '99.95' });
      const lessonPaymentRepository = createRepositoryMock();
      lessonPaymentRepository.createQueryBuilder.mockReturnValue(lessonPaymentQueryBuilder);

      const manager = createManagerMock({
        [GroupLesson.name]: groupLessonRepository,
        [LessonPayment.name]: lessonPaymentRepository,
      });

      await repository.recalculateGroupLessonBalance(301, 401, 88, manager);

      expect(groupLesson.balance).toBe(0.05);
      expect(groupLesson.paidStatus).toBe(GroupLesson.STATUS_OWING);
      expect(groupLesson.updatedByUserId).toBe(88);
      expect(groupLessonRepository.save).toHaveBeenCalledWith(groupLesson);
    });
  });

  describe('invoice payment edit repository', () => {
    let repository: InvoicePaymentEditRepository;
    let invoiceRepository: ReturnType<typeof createRepositoryMock>;
    let invoicePaymentRepository: ReturnType<typeof createRepositoryMock>;

    beforeEach(() => {
      invoiceRepository = createRepositoryMock();
      invoicePaymentRepository = createRepositoryMock();
      repository = new InvoicePaymentEditRepository(
        createRepositoryMock() as any,
        invoicePaymentRepository as any,
        invoiceRepository as any,
        createRepositoryMock() as any,
        createRepositoryMock() as any,
        createRepositoryMock() as any,
      );
    });

    it('stores a zero balance for half-cent invoice differences', async () => {
      const invoice = {
        id: 33,
        total: 31.525,
        balance: -0.01,
        status: Invoice.STATUS_CREDIT,
        updatedUserId: 10,
      };
      invoiceRepository.findOne.mockResolvedValue(invoice);

      const invoicePaymentQueryBuilder = createQueryBuilderMock({ total: '31.5300' });
      invoicePaymentRepository.createQueryBuilder.mockReturnValue(invoicePaymentQueryBuilder);

      const manager = createManagerMock({
        [Invoice.name]: invoiceRepository,
        [InvoicePayment.name]: invoicePaymentRepository,
      });

      await repository.recalculateInvoiceBalance(33, 77, manager);

      expect(invoiceRepository.update).toHaveBeenCalledWith(33, {
        balance: 0,
        status: Invoice.STATUS_PAID,
        updatedUserId: 77,
      });
    });
  });

  describe('work builder guard rails', () => {
    let service: ReceivePaymentWorkBuilderService;

    beforeEach(() => {
      service = new ReceivePaymentWorkBuilderService();
    });

    it('normalizes raw distributions and credits into bounded work items', () => {
      expect(
        service.normalizeDistributionItems([
          { id: '1', value: '-3' },
          { id: '2', value: '2.345' },
          { id: '0', value: '10' },
          { id: 'bad', value: '1' },
        ] as any),
      ).toEqual([
        { id: 1, requested: 0, remainingRequest: 0 },
        { id: 2, requested: 2.35, remainingRequest: 2.35 },
      ]);

      expect(
        service.normalizeCreditItems([
          { id: '3', value: '-5' },
          { id: '4', value: '8.765' },
          { id: '0', value: '9' },
          { id: 'bad', value: '1' },
        ] as any),
      ).toEqual([
        { id: 3, requested: 0, remainingCredit: 0 },
        { id: 4, requested: 8.77, remainingCredit: 8.77 },
      ]);
    });

    it('rejects missing invoice targets', () => {
      expect(() =>
        service.buildInvoiceWork([{ id: 11, requested: 5, remainingRequest: 5 }], new Map()),
      ).toThrow('Invoice 11 not found for this customer/location');
    });

    it('rejects missing private lesson targets', () => {
      expect(() =>
        service.buildLessonWork([{ id: 12, requested: 5, remainingRequest: 5 }], new Map()),
      ).toThrow('Lesson 12 not found for this customer/location');
    });

    it('rejects missing group lesson targets', () => {
      expect(() =>
        service.buildGroupWork([{ id: 13, requested: 5, remainingRequest: 5 }], new Map()),
      ).toThrow('Group lesson 13 not found for this customer/location');
    });

    it('rejects missing invoice credit sources', () => {
      expect(() =>
        service.buildInvoiceCreditWork([{ id: 14, requested: 5, remainingCredit: 5 }], new Map()),
      ).toThrow('Invoice credit 14 not found for this customer/location');
    });

    it('rejects missing payment credit sources', () => {
      expect(() =>
        service.buildPaymentCreditWork([{ id: 15, requested: 5, remainingCredit: 5 }], new Map()),
      ).toThrow('Payment credit 15 not found for this customer');
    });

    it('caps invoice credit availability using the source balance', () => {
      const work = service.buildInvoiceCreditWork(
        [{ id: 16, requested: 50, remainingCredit: 50 }],
        new Map([[16, { id: 16, invoiceNumber: 7001, balance: -32.5 }]]),
      );

      expect(work).toEqual([
        {
          id: 16,
          requested: 50,
          remainingCredit: 32.5,
          source: { id: 16, invoiceNumber: 7001, balance: -32.5 },
        },
      ]);
    });

    it('caps payment credit availability using the source balance', () => {
      const work = service.buildPaymentCreditWork(
        [{ id: 17, requested: 50, remainingCredit: 50 }],
        new Map([[17, { id: 17, reference: 'P-17', balance: 12.5 }]]),
      );

      expect(work).toEqual([
        {
          id: 17,
          requested: 50,
          remainingCredit: 12.5,
          source: { id: 17, reference: 'P-17', balance: 12.5 },
        },
      ]);
    });
  });

  describe('payment factory', () => {
    let repository: ReturnType<typeof createRepositoryMock>;
    let service: ReceivePaymentPaymentFactoryService;
    const manager = {} as EntityManager;

    beforeEach(() => {
      repository = createRepositoryMock();
      service = new ReceivePaymentPaymentFactoryService(repository as any);
    });

    it('creates payment rows with rounded values', async () => {
      repository.createTransaction.mockResolvedValue(991);
      repository.createPayment.mockImplementation(async (input: unknown) => ({
        id: 555,
        ...(input as Record<string, unknown>),
      }));

      const result = await service.createPaymentWithTransaction(
        manager,
        77,
        88,
        PaymentMethodType.CASH,
        12.345,
        12.344,
        new Date('2026-05-15T00:00:00.000Z'),
        'REF-1',
        'NOTE-1',
      );

      expect(repository.createTransaction).toHaveBeenCalledWith(77, manager);
      expect(repository.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: 991,
          userId: 88,
          paymentMethodId: PaymentMethodType.CASH,
          amount: 12.35,
          balance: 12.34,
          reference: 'REF-1',
          notes: 'NOTE-1',
          createdByUserId: 77,
          updatedByUserId: 77,
        }),
        manager,
      );
      expect(result).toEqual(
        expect.objectContaining({
          id: 555,
          amount: 12.35,
          balance: 12.34,
        }),
      );
    });

    it('creates the legacy invoice-credit transfer pair and links the usage row', async () => {
      const applyCreditPayment = vi.fn(async (creditAppliedPaymentId: number) => {
        await (repository.createInvoicePayment as any)(
          7001,
          creditAppliedPaymentId,
          28.75,
          77,
          manager,
        );
      });
      const affectedPaymentIds = new Set<number>();
      const createPaymentSpy = vi
        .spyOn(service, 'createPaymentWithTransaction')
        .mockResolvedValueOnce({ id: 101 } as any)
        .mockResolvedValueOnce({ id: 102 } as any);

      await service.createInvoiceCreditTransferPair(
        manager,
        88,
        77,
        5001,
        'INV-5001',
        'LESSON-7001',
        28.75,
        applyCreditPayment,
        affectedPaymentIds,
      );

      expect(createPaymentSpy).toHaveBeenNthCalledWith(
        1,
        manager,
        77,
        88,
        PaymentMethodType.CREDIT_APPLIED,
        28.75,
        28.75,
        expect.any(Date),
        'INV-5001',
        '',
      );
      expect(applyCreditPayment).toHaveBeenCalledWith(101);
      expect(createPaymentSpy).toHaveBeenNthCalledWith(
        2,
        manager,
        77,
        88,
        PaymentMethodType.CREDIT_USED,
        -28.75,
        -28.75,
        expect.any(Date),
        'LESSON-7001',
        '',
      );
      expect(repository.createInvoicePayment).toHaveBeenLastCalledWith(
        5001,
        102,
        -28.75,
        77,
        manager,
      );
      expect(repository.createCreditUsage).toHaveBeenCalledWith(101, 102, manager);
      expect(affectedPaymentIds).toEqual(new Set([101, 102]));
    });
  });

  describe('credit allocation to lessons and groups', () => {
    const manager = {} as EntityManager;

    it('applies invoice credits to private lessons through the legacy transfer pair', async () => {
      const repository = createRepositoryMock();
      const paymentFactoryService = {
        createInvoiceCreditTransferPair: vi.fn(
          async (
            _manager: EntityManager,
            _customerId: number,
            _currentUserId: number,
            _sourceInvoiceId: number,
            _sourceReference: string,
            _targetReference: string,
            _amount: number,
            applyCreditPayment: (creditAppliedPaymentId: number) => Promise<number>,
          ) => {
            const allocationId = await applyCreditPayment(901);
            return { allocationId, creditUsedPaymentId: 903 };
          },
        ),
      };
      const service = new ReceivePaymentCreditApplierService(
        repository as any,
        paymentFactoryService as any,
      );
      const credit = {
        source: { id: 700, invoiceNumber: 6001, balance: -1 },
        requested: 1,
        remainingCredit: 1,
      };
      const lessonWork = [
        {
          id: 12,
          requested: 1,
          remainingRequest: 1,
          target: { lessonId: 201, enrolmentId: 301, balance: 0.05 },
          remainingBalance: 0.05,
        },
      ];
      const affectedInvoiceIds = new Set<number>();
      const affectedPrivateLessonIds = new Set<number>();
      const affectedPaymentIds = new Set<number>();

      const applied = await service.applyInvoiceCreditToLessons(
        manager,
        credit as any,
        lessonWork as any,
        88,
        77,
        affectedInvoiceIds,
        affectedPrivateLessonIds,
        affectedPaymentIds,
      );

      expect(applied).toBe(true);
      expect(paymentFactoryService.createInvoiceCreditTransferPair).toHaveBeenCalledWith(
        manager,
        88,
        77,
        700,
        'I-06001',
        'L-000201',
        0.05,
        expect.any(Function),
        affectedPaymentIds,
      );
      expect(repository.createLessonPayment).toHaveBeenCalledWith(
        201,
        901,
        301,
        0.05,
        77,
        manager,
      );
      expect(lessonWork[0].remainingBalance).toBe(0);
      expect(affectedInvoiceIds.has(700)).toBe(true);
      expect(affectedPrivateLessonIds.has(201)).toBe(true);
    });

    it('applies invoice credits to group lessons through the legacy transfer pair', async () => {
      const repository = createRepositoryMock();
      const paymentFactoryService = {
        createInvoiceCreditTransferPair: vi.fn(
          async (
            _manager: EntityManager,
            _customerId: number,
            _currentUserId: number,
            _sourceInvoiceId: number,
            _sourceReference: string,
            _targetReference: string,
            _amount: number,
            applyCreditPayment: (creditAppliedPaymentId: number) => Promise<number>,
          ) => {
            const allocationId = await applyCreditPayment(902);
            return { allocationId, creditUsedPaymentId: 904 };
          },
        ),
      };
      const service = new ReceivePaymentCreditApplierService(
        repository as any,
        paymentFactoryService as any,
      );
      const credit = {
        source: { id: 701, invoiceNumber: 6002, balance: -1 },
        requested: 1,
        remainingCredit: 1,
      };
      const groupWork = [
        {
          id: 13,
          requested: 1,
          remainingRequest: 1,
          target: { lessonId: 401, enrolmentId: 501, balance: 0.05 },
          remainingBalance: 0.05,
        },
      ];
      const affectedInvoiceIds = new Set<number>();
      const affectedGroupLessonKeys = new Map<string, { lessonId: number; enrolmentId: number }>();
      const affectedPaymentIds = new Set<number>();

      const applied = await service.applyInvoiceCreditToGroupLessons(
        manager,
        credit as any,
        groupWork as any,
        88,
        77,
        affectedInvoiceIds,
        affectedGroupLessonKeys as any,
        affectedPaymentIds,
      );

      expect(applied).toBe(true);
      expect(paymentFactoryService.createInvoiceCreditTransferPair).toHaveBeenCalledWith(
        manager,
        88,
        77,
        701,
        'I-06002',
        'L-000401',
        0.05,
        expect.any(Function),
        affectedPaymentIds,
      );
      expect(repository.createLessonPayment).toHaveBeenCalledWith(
        401,
        902,
        501,
        0.05,
        77,
        manager,
      );
      expect(groupWork[0].remainingBalance).toBe(0);
      expect(affectedInvoiceIds.has(701)).toBe(true);
      expect(affectedGroupLessonKeys.has('401:501')).toBe(true);
    });

    it('applies existing payment credits to private lessons', async () => {
      const repository = createRepositoryMock();
      const service = new ReceivePaymentCreditApplierService(repository as any, {} as any);
      const credit = {
        source: { id: 710, reference: 'P-710', balance: 1 },
        requested: 1,
        remainingCredit: 1,
      };
      const lessonWork = [
        {
          id: 21,
          requested: 1,
          remainingRequest: 1,
          target: { lessonId: 211, enrolmentId: 311, balance: 0.05 },
          remainingBalance: 0.05,
        },
      ];
      const affectedPrivateLessonIds = new Set<number>();

      const applied = await service.applyExistingPaymentCreditToLessons(
        manager,
        credit as any,
        lessonWork as any,
        77,
        affectedPrivateLessonIds,
      );

      expect(applied).toBe(true);
      expect(repository.createLessonPayment).toHaveBeenCalledWith(
        211,
        710,
        311,
        0.05,
        77,
        manager,
      );
      expect(lessonWork[0].remainingBalance).toBe(0);
      expect(affectedPrivateLessonIds.has(211)).toBe(true);
      expect(credit.remainingCredit).toBe(0.95);
    });

    it('applies existing payment credits to group lessons', async () => {
      const repository = createRepositoryMock();
      const service = new ReceivePaymentCreditApplierService(repository as any, {} as any);
      const credit = {
        source: { id: 711, reference: 'P-711', balance: 1 },
        requested: 1,
        remainingCredit: 1,
      };
      const groupWork = [
        {
          id: 22,
          requested: 1,
          remainingRequest: 1,
          target: { lessonId: 212, enrolmentId: 312, balance: 0.05 },
          remainingBalance: 0.05,
        },
      ];
      const affectedGroupLessonKeys = new Map<string, { lessonId: number; enrolmentId: number }>();

      const applied = await service.applyExistingPaymentCreditToGroupLessons(
        manager,
        credit as any,
        groupWork as any,
        77,
        affectedGroupLessonKeys as any,
      );

      expect(applied).toBe(true);
      expect(repository.createLessonPayment).toHaveBeenCalledWith(
        212,
        711,
        312,
        0.05,
        77,
        manager,
      );
      expect(groupWork[0].remainingBalance).toBe(0);
      expect(affectedGroupLessonKeys.has('212:312')).toBe(true);
      expect(credit.remainingCredit).toBe(0.95);
    });
  });

  describe('negative receive-payment orchestration', () => {
    const manager = {} as EntityManager;

    it('creates a negative payment and offsets invoice credits', async () => {
      const repository = createReceivePaymentRepositoryServiceMock();
      repository.findInvoiceCreditSourcesForCustomer.mockResolvedValue(
        new Map([
          [
            1118316,
            { id: 1118316, invoiceNumber: 104106, balance: -32.5 },
          ],
        ]),
      );
      repository.findPaymentCreditSourcesForCustomer.mockResolvedValue(new Map());

      const paymentFactoryService = {
        createPaymentWithTransaction: vi.fn(async () => ({ id: 1706579 })),
      };
      const postProcessor = {
        recalculateAndPersist: vi.fn(async () => 0),
      };
      const service = new ReceivePaymentNegativeService(
        repository as any,
        new ReceivePaymentValidationService(),
        new ReceivePaymentWorkBuilderService(),
        paymentFactoryService as any,
        postProcessor as any,
        {
          recordInvoiceCreditRefund: vi.fn(),
          recordCreditRefund: vi.fn(),
        } as any,
      );

      const result = await service.saveNegativeReceivePayment({
        manager,
        locationSlug: 'main',
        locationId: 1,
        dto: {
          customerId: 14104,
          amount: -32.5,
          date: '2026-05-15',
          paymentMethodId: 4,
          reference: '',
          notes: '',
          invoicePayments: [],
          lessonPayments: [],
          groupLessonPayments: [],
          paymentCredits: [],
          invoiceCredits: [{ id: 1118316, value: 32.5 }],
          canUsePaymentCredits: 0,
          canUseInvoiceCredits: 1,
        } as any,
        currentUserId: 694,
        paymentDate: new Date('2026-05-15T00:00:00.000Z'),
        amountReceived: -32.5,
      });

      expect(paymentFactoryService.createPaymentWithTransaction).toHaveBeenCalledWith(
        manager,
        694,
        14104,
        4,
        -32.5,
        -32.5,
        new Date('2026-05-15T00:00:00.000Z'),
        '',
        '',
      );
      expect(repository.createInvoicePayment).toHaveBeenCalledWith(
        1118316,
        1706579,
        -32.5,
        694,
        manager,
      );
      expect(repository.createPaymentCreditInvoiceWithLineItem).not.toHaveBeenCalled();
      expect(postProcessor.recalculateAndPersist).toHaveBeenCalledTimes(1);
      expect(result.response).toEqual(
        expect.objectContaining({
          paymentId: 1706579,
          amountReceived: -32.5,
          applied: expect.objectContaining({
            fromAmountReceived: -32.5,
            fromInvoiceCredits: 32.5,
            fromPaymentCredits: 0,
            totalApplied: 32.5,
          }),
        }),
      );
    });

    it('creates the payment-credit invoice when negative payment uses payment credits', async () => {
      const repository = createReceivePaymentRepositoryServiceMock();
      repository.findInvoiceCreditSourcesForCustomer.mockResolvedValue(new Map());
      repository.findPaymentCreditSourcesForCustomer.mockResolvedValue(
        new Map([
          [
            1706575,
            { id: 1706575, reference: 'P-1706575', balance: 32.5 },
          ],
        ]),
      );
      repository.createPaymentCreditInvoiceWithLineItem.mockResolvedValue({ id: 3001 });

      const paymentFactoryService = {
        createPaymentWithTransaction: vi.fn(async () => ({ id: 1706579 })),
      };
      const postProcessor = {
        recalculateAndPersist: vi.fn(async () => 0),
      };
      const service = new ReceivePaymentNegativeService(
        repository as any,
        new ReceivePaymentValidationService(),
        new ReceivePaymentWorkBuilderService(),
        paymentFactoryService as any,
        postProcessor as any,
        {
          recordInvoiceCreditRefund: vi.fn(),
          recordCreditRefund: vi.fn(),
        } as any,
      );

      const result = await service.saveNegativeReceivePayment({
        manager,
        locationSlug: 'main',
        locationId: 1,
        dto: {
          customerId: 14104,
          amount: -32.5,
          date: '2026-05-15',
          paymentMethodId: 4,
          reference: '',
          notes: '',
          invoicePayments: [],
          lessonPayments: [],
          groupLessonPayments: [],
          paymentCredits: [{ id: 1706575, value: 32.5 }],
          invoiceCredits: [],
          canUsePaymentCredits: 1,
          canUseInvoiceCredits: 0,
        } as any,
        currentUserId: 694,
        paymentDate: new Date('2026-05-15T00:00:00.000Z'),
        amountReceived: -32.5,
      });

      expect(repository.createPaymentCreditInvoiceWithLineItem).toHaveBeenCalledWith(
        14104,
        1,
        694,
        manager,
      );
      expect(repository.createInvoicePayment).toHaveBeenNthCalledWith(
        1,
        3001,
        1706579,
        -32.5,
        694,
        manager,
      );
      expect(repository.createInvoicePayment).toHaveBeenNthCalledWith(
        2,
        3001,
        1706575,
        32.5,
        694,
        manager,
      );
      expect(repository.createCreditUsage).not.toHaveBeenCalled();
      expect(postProcessor.recalculateAndPersist).toHaveBeenCalledTimes(1);
      expect(result.response).toEqual(
        expect.objectContaining({
          paymentId: 1706579,
          amountReceived: -32.5,
          applied: expect.objectContaining({
            fromAmountReceived: -32.5,
            fromInvoiceCredits: 0,
            fromPaymentCredits: 32.5,
            totalApplied: 32.5,
          }),
        }),
      );
    });
  });

  describe('receive payment orchestration', () => {
    it('delegates negative requests to the negative service', async () => {
      const manager = {} as EntityManager;
      const transaction = vi.fn(async (callback: (transactionManager: EntityManager) => Promise<unknown>) =>
        callback(manager),
      );
      const dataSource = { transaction } as any;
      const customerValidationService = {
        validateLocationAndCustomer: vi.fn(async () => ({ locationId: 2, customerId: 10756 })),
      };
      const validationService = {
        validateAmountAndMethod: vi.fn(),
        parsePaymentDate: vi.fn(() => new Date('2026-05-15T00:00:00.000Z')),
        validateCreateDate: vi.fn(),
        validateRequestedDistributionTotals: vi.fn(),
        validateCanceledLessons: vi.fn(),
      };
      const negativeService = {
        saveNegativeReceivePayment: vi.fn(async () => ({
          response: {
            status: true,
            paymentId: 9001,
            paymentBalance: 0,
            amountReceived: -10,
            applied: {
              fromAmountReceived: -10,
              fromInvoiceCredits: 10,
              fromPaymentCredits: 0,
              totalApplied: 10,
            },
          },
          auditContext: {
            locationSlug: 'main',
            locationId: 2,
            customerId: 10756,
            currentUserId: 694,
            paymentDate: new Date('2026-05-15T00:00:00.000Z'),
            amountReceived: -10,
            appliedFromAmountReceived: -10,
            appliedFromInvoiceCredits: 10,
            appliedFromPaymentCredits: 0,
            affectedInvoiceIds: [],
            affectedPrivateLessonIds: [],
            affectedGroupLessonKeys: [],
            affectedPaymentIds: [],
            paymentCreditInvoiceId: null,
          },
        })),
      };
      const service = new InvoiceReceivePaymentService(
        dataSource,
        customerValidationService as any,
        createReceivePaymentRepositoryServiceMock() as any,
        validationService as any,
        new ReceivePaymentWorkBuilderService(),
        new ReceivePaymentPaymentFactoryService(createRepositoryMock() as any),
        new ReceivePaymentCreditApplierService(createRepositoryMock() as any, {} as any),
        new ReceivePaymentCashApplierService(createRepositoryMock() as any),
        new ReceivePaymentPostProcessorService(
          createRepositoryMock() as any,
          { recalculateAndPersist: vi.fn(async () => 0) } as any,
        ),
        negativeService as any,
        { recognizeReceivePayment: vi.fn() } as any,
        {
          processCreditAllocation: vi.fn(),
          processInvoiceCreditAllocation: vi.fn(),
        } as any,
      );

      const response = await service.saveReceivePayment(
        'main',
        {
          customerId: 10756,
          amount: -10,
          date: '2026-05-15',
          paymentMethodId: 4,
          reference: '',
          notes: '',
          invoicePayments: [],
          lessonPayments: [],
          groupLessonPayments: [],
          paymentCredits: [{ id: 1706575, value: 10 }],
          invoiceCredits: [],
          canUsePaymentCredits: 1,
          canUseInvoiceCredits: 0,
        } as any,
        694,
        true,
      );

      expect(customerValidationService.validateLocationAndCustomer).toHaveBeenCalledWith(
        'main',
        10756,
      );
      expect(negativeService.saveNegativeReceivePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          manager,
          locationSlug: 'main',
          locationId: 2,
          currentUserId: 694,
          amountReceived: -10,
          dto: expect.objectContaining({ customerId: 10756 }),
        }),
      );
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(response).toEqual(
        expect.objectContaining({
          paymentId: 9001,
          applied: expect.objectContaining({ fromInvoiceCredits: 10 }),
        }),
      );
    });

    it('applies cash allocations in invoice, private lesson, group lesson order', async () => {
      const manager = { query: vi.fn().mockResolvedValue([]) } as unknown as EntityManager;
      const transaction = vi.fn(async (callback: (transactionManager: EntityManager) => Promise<unknown>) =>
        callback(manager),
      );
      const customerValidationService = {
        validateLocationAndCustomer: vi.fn(async () => ({ locationId: 2, customerId: 10756 })),
      };
      const validationService = {
        validateAmountAndMethod: vi.fn(),
        parsePaymentDate: vi.fn(() => new Date('2026-05-15T00:00:00.000Z')),
        validateCreateDate: vi.fn(),
        validateRequestedDistributionTotals: vi.fn(),
        validateCanceledLessons: vi.fn(),
      };
      const repository = createReceivePaymentRepositoryServiceMock();
      repository.findInvoiceTargetsForCustomer.mockResolvedValue(
        new Map([
          [1, { id: 1, invoiceNumber: 5001, balance: 10 }],
        ]),
      );
      repository.findPrivateLessonTargetsForCustomer.mockResolvedValue(
        new Map([
          [2, { lessonId: 2, enrolmentId: 22, balance: 20 }],
        ]),
      );
      repository.findGroupLessonTargetsForCustomer.mockResolvedValue(
        new Map([
          [3, { id: 3, lessonId: 3, enrolmentId: 33, balance: 30 }],
        ]),
      );
      const paymentFactoryService = {
        createPaymentWithTransaction: vi.fn(async () => ({ id: 444 })),
      };
      const creditApplierService = new ReceivePaymentCreditApplierService(
        createRepositoryMock() as any,
        { createInvoiceCreditTransferPair: vi.fn() } as any,
      );
      const cashApplierService = {
        applyCashToInvoiceTargets: vi.fn(async () => 20),
        applyCashToLessonTargets: vi.fn(async () => 10),
        applyCashToGroupTargets: vi.fn(async () => 0),
      };
      const postProcessorService = {
        recalculateAndPersist: vi.fn(async () => 4.5),
      };
      const negativeService = {
        saveNegativeReceivePayment: vi.fn(),
      };
      const service = new InvoiceReceivePaymentService(
        { transaction } as any,
        customerValidationService as any,
        repository as any,
        validationService as any,
        new ReceivePaymentWorkBuilderService(),
        paymentFactoryService as any,
        creditApplierService as any,
        cashApplierService as any,
        postProcessorService as any,
        negativeService as any,
        { recognizeReceivePayment: vi.fn() } as any,
        {
          processCreditAllocation: vi.fn(),
          processInvoiceCreditAllocation: vi.fn(),
        } as any,
      );

      const response = await service.saveReceivePayment(
        'main',
        {
          customerId: 10756,
          amount: 30,
          date: '2026-05-15',
          paymentMethodId: 4,
          reference: '',
          notes: '',
          invoicePayments: [{ id: 1, value: 10 }],
          lessonPayments: [{ id: 2, value: 10 }],
          groupLessonPayments: [{ id: 3, value: 10 }],
          paymentCredits: [],
          invoiceCredits: [],
          canUsePaymentCredits: 0,
          canUseInvoiceCredits: 0,
        } as any,
        694,
        true,
      );

      expect(paymentFactoryService.createPaymentWithTransaction).toHaveBeenCalledWith(
        manager,
        694,
        10756,
        4,
        30,
        30,
        new Date('2026-05-15T00:00:00.000Z'),
        '',
        '',
      );
      expect(cashApplierService.applyCashToInvoiceTargets).toHaveBeenCalledTimes(1);
      expect(cashApplierService.applyCashToLessonTargets).toHaveBeenCalledTimes(1);
      expect(cashApplierService.applyCashToGroupTargets).toHaveBeenCalledTimes(1);
      expect(cashApplierService.applyCashToInvoiceTargets).toHaveBeenCalledWith(
        manager,
        444,
        30,
        expect.any(Array),
        694,
        expect.any(Set),
      );
      expect(cashApplierService.applyCashToLessonTargets).toHaveBeenCalledWith(
        manager,
        444,
        20,
        expect.any(Array),
        694,
        expect.any(Set),
      );
      expect(cashApplierService.applyCashToGroupTargets).toHaveBeenCalledWith(
        manager,
        444,
        10,
        expect.any(Array),
        694,
        expect.any(Map),
      );
      expect(postProcessorService.recalculateAndPersist).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: 444,
          affectedPaymentIds: expect.any(Set),
        }),
      );
      expect(response).toEqual(
        expect.objectContaining({
          paymentId: 444,
          paymentBalance: 4.5,
          amountReceived: 30,
          applied: {
            fromAmountReceived: 30,
            fromInvoiceCredits: 0,
            fromPaymentCredits: 0,
            totalApplied: 30,
          },
        }),
      );
    });
  });

  describe('post processor orchestration', () => {
    it('recalculates touched balances and customer totals before returning the payment balance', async () => {
      const repository = createReceivePaymentRepositoryServiceMock();
      (repository.recalculatePaymentBalance as any).mockImplementation(async (id: number) =>
        id === 99 ? 7.25 : 2.5,
      );
      const customerBalanceRecalculatorService = {
        recalculateAndPersist: vi.fn(async () => 123.45),
      };
      const service = new ReceivePaymentPostProcessorService(
        repository as any,
        customerBalanceRecalculatorService as any,
      );
      const manager = {} as EntityManager;
      const groupLessonKeys = new Map<string, { lessonId: number; enrolmentId: number }>([
        ['4:5', { lessonId: 4, enrolmentId: 5 }],
      ]);

      const paymentBalance = await service.recalculateAndPersist({
        manager,
        locationSlug: 'main',
        customerId: 10756,
        currentUserId: 694,
        paymentId: 99,
        affectedInvoiceIds: new Set([1, 2]),
        affectedPrivateLessonIds: new Set([3]),
        affectedGroupLessonKeys: groupLessonKeys,
        affectedPaymentIds: new Set([99, 77]),
      });

      expect(repository.recalculatePaymentBalance).toHaveBeenNthCalledWith(1, 99, 694, manager);
      expect(repository.recalculatePaymentBalance).toHaveBeenNthCalledWith(2, 77, 694, manager);
      expect(repository.recalculateInvoiceBalance).toHaveBeenCalledWith(1, 694, manager);
      expect(repository.recalculateInvoiceBalance).toHaveBeenCalledWith(2, 694, manager);
      expect(repository.recalculatePrivateLessonBalance).toHaveBeenCalledWith(3, manager);
      expect(repository.recalculateGroupLessonBalance).toHaveBeenCalledWith(4, 5, 694, manager);
      expect(customerBalanceRecalculatorService.recalculateAndPersist).toHaveBeenCalledWith(
        10756,
        {
          manager,
          updatedByUserId: 694,
          locationSlug: 'main',
        },
      );
      expect(repository.recalculatePaymentBalance).toHaveBeenNthCalledWith(3, 99, 694, manager);
      expect(paymentBalance).toBe(7.25);
    });

    it('returns zero when there is no payment id to refresh', async () => {
      const repository = createReceivePaymentRepositoryServiceMock();
      const customerBalanceRecalculatorService = {
        recalculateAndPersist: vi.fn(async () => 55.5),
      };
      const service = new ReceivePaymentPostProcessorService(
        repository as any,
        customerBalanceRecalculatorService as any,
      );

      const paymentBalance = await service.recalculateAndPersist({
        manager: {} as EntityManager,
        locationSlug: 'main',
        customerId: 10756,
        currentUserId: 694,
        paymentId: null,
        affectedInvoiceIds: new Set(),
        affectedPrivateLessonIds: new Set(),
        affectedGroupLessonKeys: new Map(),
        affectedPaymentIds: new Set(),
      });

      expect(customerBalanceRecalculatorService.recalculateAndPersist).toHaveBeenCalledWith(
        10756,
        expect.objectContaining({
          locationSlug: 'main',
          updatedByUserId: 694,
        }),
      );
      expect(paymentBalance).toBe(0);
    });
  });

  describe('payment credit invoice creation', () => {
    it('creates the payment credit invoice and PAYMENT CREDIT line item', async () => {
      const invoiceQueryBuilder = {
        setLock: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        getOne: vi.fn(async () => ({ invoiceNumber: 104105 })),
      };
      const itemQueryBuilder = {
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        getOne: vi.fn(async () => ({
          id: 9001,
          description: 'Payment Credit',
          code: 'PAYMENT CREDIT',
          royaltyFree: false,
          taxStatusId: 12,
        })),
      };
      const taxQueryBuilder = {
        insert: vi.fn().mockReturnThis(),
        into: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        execute: vi.fn(async () => ({ identifiers: [{ id: 9000 }] })),
        select: vi.fn().mockReturnThis(),
        addSelect: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getRawOne: vi.fn(async () => ({
          taxTypeName: 'GST',
          taxCodeRate: '0',
          taxCodeCode: 'GST',
          taxStatusName: 'Taxable',
        })),
      };
      const itemRepository = {
        createQueryBuilder: vi.fn(() => itemQueryBuilder),
      };
      const manager = {
        query: vi.fn(async () => []),
        create: vi.fn((entity: unknown, input: Record<string, unknown>) => ({ ...input })),
        save: vi.fn(async (entity: unknown, value: Record<string, unknown>) => ({
          ...value,
          id: entity === Invoice ? 7001 : 8001,
        })),
        createQueryBuilder: vi.fn((entity?: unknown, alias?: string) => {
          if (entity === Invoice && alias === 'invoice') {
            return invoiceQueryBuilder;
          }

          return taxQueryBuilder;
        }),
        getRepository: vi.fn((entity: { name?: string }) => {
          if (entity === Item) {
            return itemRepository;
          }

          throw new Error(`Unexpected repository request: ${entity.name}`);
        }),
      } as any as EntityManager;
      const repository = new ReceivePaymentRepository();

      const savedInvoice = await repository.createPaymentCreditInvoiceWithLineItem(
        10756,
        1,
        694,
        manager,
      );

      expect(manager.createQueryBuilder).toHaveBeenCalledWith(Invoice, 'invoice');
      expect(itemRepository.createQueryBuilder).toHaveBeenCalledWith('item');
      expect(manager.save).toHaveBeenCalledWith(
        Invoice,
        expect.objectContaining({
          userId: 10756,
          locationId: 1,
          invoiceNumber: 104106,
          type: Invoice.TYPE_INVOICE,
          isVoid: 0,
          paidStatus: 0,
        }),
      );
      expect(manager.save).toHaveBeenCalledWith(
        InvoiceLineItem,
        expect.objectContaining({
          invoiceId: 7001,
          itemId: 9001,
          itemTypeId: ItemTypeEnum.TYPE_PAYMENT_CREDIT,
          description: 'Payment Credit',
          code: 'PAYMENT CREDIT',
          taxType: 'GST',
          taxCode: 'GST',
          taxStatus: 'Taxable',
        }),
      );
      expect(savedInvoice.id).toBe(7001);
    });
  });
});
