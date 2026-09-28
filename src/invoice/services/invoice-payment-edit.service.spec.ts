import { describe, expect, it, beforeEach, vi } from 'vitest';
import { InvoicePaymentEditService } from './invoice-payment-edit.service';
import { InvoiceType } from '../enums/invoice-type.enum';
import { PaymentMethodType } from '../../payment/enums/payment-method-type.enum';

function createService() {
  const transactionManager = { query: vi.fn().mockResolvedValue([]) } as any;
  const invoicePaymentEditRepository = {
    findPaymentById: vi.fn(),
    findInvoicePaymentsByPaymentId: vi.fn(),
    findLessonPaymentsByPaymentId: vi.fn(),
    isPaymentCreditInvoice: vi.fn(),
    calculatePaymentBalance: vi.fn(),
    updatePayment: vi.fn(),
    findLessonPaymentsByLessonAndPayment: vi.fn(),
    findGroupLessonById: vi.fn(),
    findInvoicePaymentsByInvoiceAndPayment: vi.fn(),
    updateLessonPaymentAmount: vi.fn(),
    updateInvoicePaymentAmount: vi.fn(),
    softDeleteLessonPaymentById: vi.fn(),
    softDeleteInvoicePaymentById: vi.fn(),
    softDeletePayment: vi.fn(),
    softDeleteInvoicePayments: vi.fn(),
    softDeleteLessonPayments: vi.fn(),
    recalculateInvoiceBalance: vi.fn(),
  };

  const invoicePaymentDetailsRepository = {
    recalculatePrivateLessonBalance: vi.fn(),
    recalculateGroupLessonBalance: vi.fn(),
  };

  const transformationService = {
    transformUpdateResponse: vi.fn().mockReturnValue({ status: true }),
  };

  const customerBalanceRecalculatorService = {
    recalculateAndPersist: vi.fn(),
  };

  const dataSource = {
    transaction: vi.fn(async (callback: (manager: any) => Promise<any>) => callback(transactionManager)),
  };
  const royaltyTransactionRepository = {
    hasPaymentRecognition: vi.fn().mockResolvedValue(false),
  };
  const royaltyPaymentCorrectionService = {
    getRecognitionScope: vi.fn().mockResolvedValue({
      locationId: 1,
      customerId: 77,
    }),
    captureAppliedPurposes: vi.fn().mockResolvedValue([]),
    validateRecognizedEditBeforeSave: vi.fn(),
    reconcileRecognizedEdit: vi.fn(),
  };

  const service = new InvoicePaymentEditService(
    invoicePaymentEditRepository as any,
    invoicePaymentDetailsRepository as any,
    transformationService as any,
    customerBalanceRecalculatorService as any,
    dataSource as any,
    royaltyTransactionRepository as any,
    royaltyPaymentCorrectionService as any,
  );

  return {
    service,
    invoicePaymentEditRepository,
    invoicePaymentDetailsRepository,
    transformationService,
    customerBalanceRecalculatorService,
    dataSource,
    transactionManager,
    royaltyTransactionRepository,
    royaltyPaymentCorrectionService,
  };
}

describe('InvoicePaymentEditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('blocks ordinary editing of a payment linked to a completed POS sale', async () => {
    const {
      service,
      invoicePaymentEditRepository,
      transactionManager,
      royaltyTransactionRepository,
    } = createService();
    invoicePaymentEditRepository.findPaymentById.mockResolvedValue({
      id: 55,
      userId: 77,
      amount: 25,
      paymentMethodId: PaymentMethodType.CASH,
      date: new Date('2026-09-10T00:00:00.000Z'),
      isDeleted: 0,
    });
    transactionManager.query.mockResolvedValue([{ id: 901 }]);

    await expect(
      service.updatePayment(
        55,
        {
          amount: 20,
          amountToDistribute: 0,
          date: '2026-09-10',
          paymentMethodId: PaymentMethodType.CASH,
          reference: '',
        },
        694,
        true,
      ),
    ).rejects.toThrow(
      'Payments linked to completed POS sales cannot be edited or deleted',
    );
    expect(transactionManager.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM pos_transaction'),
      [55, 55],
    );
    expect(royaltyTransactionRepository.hasPaymentRecognition).not.toHaveBeenCalled();
    expect(invoicePaymentEditRepository.updatePayment).not.toHaveBeenCalled();
    expect(invoicePaymentEditRepository.softDeletePayment).not.toHaveBeenCalled();
  });

  it('allows an eligible payment-method correction after royalty recognition', async () => {
    const {
      service,
      invoicePaymentEditRepository,
      royaltyTransactionRepository,
      royaltyPaymentCorrectionService,
    } = createService();
    invoicePaymentEditRepository.findPaymentById.mockResolvedValue({
      id: 55,
      userId: 77,
      amount: 100,
      paymentMethodId: PaymentMethodType.CASH,
      date: new Date('2026-08-10T00:00:00.000Z'),
      isDeleted: 0,
    });
    invoicePaymentEditRepository.findInvoicePaymentsByPaymentId.mockResolvedValue([]);
    invoicePaymentEditRepository.findLessonPaymentsByPaymentId.mockResolvedValue([]);
    invoicePaymentEditRepository.calculatePaymentBalance.mockResolvedValue(100);
    invoicePaymentEditRepository.updatePayment.mockResolvedValue(undefined);
    royaltyTransactionRepository.hasPaymentRecognition.mockResolvedValue(true);

    await expect(
      service.updatePayment(
        55,
        {
          amount: 100,
          amountToDistribute: 0,
          date: '2026-08-10',
          paymentMethodId: PaymentMethodType.CREDIT_CARD,
          reference: '',
        },
        694,
        true,
      ),
    ).resolves.toEqual({ status: true });
    expect(
      royaltyPaymentCorrectionService.validateRecognizedEditBeforeSave,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        oldPaymentMethodId: PaymentMethodType.CASH,
        newPaymentMethodId: PaymentMethodType.CREDIT_CARD,
      }),
    );
    expect(
      royaltyPaymentCorrectionService.reconcileRecognizedEdit,
    ).toHaveBeenCalledTimes(1);
  });

  it('refreshes affected invoice and lesson balances after editing a payment', async () => {
    const {
      service,
      invoicePaymentEditRepository,
      invoicePaymentDetailsRepository,
      transformationService,
      customerBalanceRecalculatorService,
      dataSource,
      transactionManager,
    } = createService();

    invoicePaymentEditRepository.findPaymentById.mockResolvedValue({
      id: 55,
      userId: 77,
      amount: 120,
      paymentMethodId: PaymentMethodType.CASH,
      date: new Date('2026-05-15T00:00:00.000Z'),
      isDeleted: 0,
    });
    invoicePaymentEditRepository.findInvoicePaymentsByPaymentId.mockResolvedValue([
      {
        invoiceId: 301,
        invoice: { id: 301, type: InvoiceType.INVOICE },
      },
    ]);
    invoicePaymentEditRepository.findLessonPaymentsByPaymentId.mockResolvedValue([
      { lessonId: 201, enrolmentId: null },
      { lessonId: 202, enrolmentId: 88 },
    ]);
    invoicePaymentEditRepository.isPaymentCreditInvoice.mockResolvedValue(false);
    invoicePaymentEditRepository.calculatePaymentBalance
      .mockResolvedValueOnce(120)
      .mockResolvedValueOnce(120);
    invoicePaymentEditRepository.updatePayment.mockResolvedValue(undefined);
    invoicePaymentEditRepository.findLessonPaymentsByLessonAndPayment
      .mockImplementation(async (lessonId: number, paymentId: number, enrolmentId?: number | null) => {
        if (lessonId === 201 && paymentId === 55 && enrolmentId == null) {
          return [{ id: 401 }];
        }

        if (lessonId === 202 && paymentId === 55 && enrolmentId === 88) {
          return [{ id: 402 }];
        }

        return [];
      });
    invoicePaymentEditRepository.findGroupLessonById.mockResolvedValue({
      id: 202,
      lessonId: 202,
      enrolmentId: 88,
    });
    invoicePaymentEditRepository.findInvoicePaymentsByInvoiceAndPayment.mockResolvedValue([
      { id: 501 },
    ]);
    invoicePaymentEditRepository.softDeleteLessonPaymentById.mockResolvedValue(undefined);
    invoicePaymentEditRepository.softDeleteInvoicePaymentById.mockResolvedValue(undefined);
    invoicePaymentEditRepository.recalculateInvoiceBalance.mockResolvedValue(undefined);
    invoicePaymentDetailsRepository.recalculatePrivateLessonBalance.mockResolvedValue(undefined);
    invoicePaymentDetailsRepository.recalculateGroupLessonBalance.mockResolvedValue(undefined);
    customerBalanceRecalculatorService.recalculateAndPersist.mockResolvedValue(undefined);

    const result = await service.updatePayment(
      55,
      {
        amount: 120,
        amountToDistribute: 120,
        date: '2026-05-20',
        paymentMethodId: PaymentMethodType.CASH,
        reference: 'updated',
        lessonPayments: [
          { id: 201, value: 0 },
        ],
        groupLessonPayments: [
          { id: 202, value: 0 },
        ],
        invoicePayments: [
          { id: 301, value: 0 },
        ],
      } as any,
      77,
      false,
    );

    expect(result).toEqual({ status: true });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(invoicePaymentEditRepository.findPaymentById).toHaveBeenCalledWith(55, transactionManager);
    expect(invoicePaymentEditRepository.updatePayment).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 55, userId: 77 }),
      expect.objectContaining({
        amount: 120,
        paymentMethodId: PaymentMethodType.CASH,
        reference: 'updated',
      }),
      transactionManager,
    );
    expect(invoicePaymentEditRepository.updatePayment).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: 55, userId: 77 }),
      expect.objectContaining({
        amount: 120,
        paymentMethodId: PaymentMethodType.CASH,
        reference: 'updated',
      }),
      transactionManager,
    );
    expect(invoicePaymentEditRepository.recalculateInvoiceBalance).toHaveBeenCalledWith(301, 77, transactionManager);
    expect(invoicePaymentDetailsRepository.recalculatePrivateLessonBalance).toHaveBeenCalledWith(201, null, 77, transactionManager);
    expect(invoicePaymentDetailsRepository.recalculatePrivateLessonBalance).toHaveBeenCalledWith(202, 88, 77, transactionManager);
    expect(invoicePaymentDetailsRepository.recalculateGroupLessonBalance).toHaveBeenCalledWith(202, 88, 77, transactionManager);
    expect(customerBalanceRecalculatorService.recalculateAndPersist).toHaveBeenCalledWith(77, {
      updatedByUserId: 77,
      manager: transactionManager,
    });
    expect(transformationService.transformUpdateResponse).toHaveBeenCalledTimes(1);
  });

  it('soft deletes a payment when the edited amount is zero', async () => {
    const {
      service,
      invoicePaymentEditRepository,
      invoicePaymentDetailsRepository,
      customerBalanceRecalculatorService,
      dataSource,
      transactionManager,
    } = createService();

    invoicePaymentEditRepository.findPaymentById.mockResolvedValue({
      id: 55,
      userId: 77,
      amount: 120,
      paymentMethodId: PaymentMethodType.CASH,
      date: new Date('2026-05-15T00:00:00.000Z'),
      isDeleted: 0,
    });
    invoicePaymentEditRepository.findInvoicePaymentsByPaymentId.mockResolvedValue([
      {
        invoiceId: 301,
        invoice: { id: 301, type: InvoiceType.INVOICE },
      },
    ]);
    invoicePaymentEditRepository.findLessonPaymentsByPaymentId.mockResolvedValue([
      { lessonId: 201, enrolmentId: null },
    ]);
    invoicePaymentEditRepository.isPaymentCreditInvoice.mockResolvedValue(false);
    invoicePaymentEditRepository.softDeletePayment.mockResolvedValue(undefined);
    invoicePaymentEditRepository.softDeleteInvoicePayments.mockResolvedValue(undefined);
    invoicePaymentEditRepository.softDeleteLessonPayments.mockResolvedValue(undefined);
    invoicePaymentEditRepository.recalculateInvoiceBalance.mockResolvedValue(undefined);
    invoicePaymentDetailsRepository.recalculatePrivateLessonBalance.mockResolvedValue(undefined);
    invoicePaymentDetailsRepository.recalculateGroupLessonBalance.mockResolvedValue(undefined);
    customerBalanceRecalculatorService.recalculateAndPersist.mockResolvedValue(undefined);

    const result = await service.updatePayment(
      55,
      {
        amount: 0,
        amountToDistribute: 0,
        date: '2026-05-20',
        paymentMethodId: PaymentMethodType.CASH,
        reference: 'deleted',
      } as any,
      77,
      false,
    );

    expect(result).toEqual({ status: true });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(invoicePaymentEditRepository.softDeletePayment).toHaveBeenCalledWith(55, 77, transactionManager);
    expect(invoicePaymentEditRepository.softDeleteInvoicePayments).toHaveBeenCalledWith(55, 77, transactionManager);
    expect(invoicePaymentEditRepository.softDeleteLessonPayments).toHaveBeenCalledWith(55, 77, transactionManager);
    expect(invoicePaymentEditRepository.recalculateInvoiceBalance).toHaveBeenCalledWith(301, 77, transactionManager);
    expect(invoicePaymentDetailsRepository.recalculatePrivateLessonBalance).toHaveBeenCalledWith(201, null, 77, transactionManager);
    expect(invoicePaymentDetailsRepository.recalculateGroupLessonBalance).not.toHaveBeenCalled();
    expect(customerBalanceRecalculatorService.recalculateAndPersist).toHaveBeenCalledWith(77, {
      updatedByUserId: 77,
      manager: transactionManager,
    });
  });

  it('unapplies a one-cent lesson allocation when amount to apply is credited', async () => {
    const {
      service,
      invoicePaymentEditRepository,
      invoicePaymentDetailsRepository,
      customerBalanceRecalculatorService,
      transactionManager,
    } = createService();

    invoicePaymentEditRepository.findPaymentById.mockResolvedValue({
      id: 88,
      userId: 77,
      amount: 0.01,
      paymentMethodId: PaymentMethodType.CASH,
      date: new Date('2026-09-05T00:00:00.000Z'),
      isDeleted: 0,
    });
    invoicePaymentEditRepository.findInvoicePaymentsByPaymentId.mockResolvedValue(
      [],
    );
    invoicePaymentEditRepository.findLessonPaymentsByPaymentId.mockResolvedValue(
      [{ id: 9001, lessonId: 201, enrolmentId: 321 }],
    );
    invoicePaymentEditRepository.isPaymentCreditInvoice.mockResolvedValue(
      false,
    );
    invoicePaymentEditRepository.calculatePaymentBalance
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0.01);
    invoicePaymentEditRepository.updatePayment.mockResolvedValue(undefined);
    invoicePaymentEditRepository.softDeleteLessonPayments.mockResolvedValue(
      undefined,
    );
    invoicePaymentEditRepository.softDeleteInvoicePayments.mockResolvedValue(
      undefined,
    );
    invoicePaymentDetailsRepository.recalculatePrivateLessonBalance.mockResolvedValue(
      undefined,
    );
    invoicePaymentDetailsRepository.recalculateGroupLessonBalance.mockResolvedValue(
      undefined,
    );
    customerBalanceRecalculatorService.recalculateAndPersist.mockResolvedValue(
      undefined,
    );

    const result = await service.updatePayment(
      88,
      {
        amount: 0.01,
        amountToDistribute: 0,
        date: '2026-09-05',
        paymentMethodId: PaymentMethodType.CASH,
        reference: '',
      } as any,
      77,
      true,
    );

    expect(result).toEqual({ status: true });
    expect(
      invoicePaymentEditRepository.softDeletePayment,
    ).not.toHaveBeenCalled();
    expect(
      invoicePaymentEditRepository.softDeleteLessonPayments,
    ).toHaveBeenCalledWith(88, 77, transactionManager);
    expect(
      invoicePaymentEditRepository.softDeleteInvoicePayments,
    ).toHaveBeenCalledWith(88, 77, transactionManager);
    expect(
      invoicePaymentDetailsRepository.recalculatePrivateLessonBalance,
    ).toHaveBeenCalledWith(201, 321, 77, transactionManager);
    expect(
      customerBalanceRecalculatorService.recalculateAndPersist,
    ).toHaveBeenCalledWith(77, {
      updatedByUserId: 77,
      manager: transactionManager,
    });
  });

  it('keeps a remaining lesson allocation when another one-cent row is omitted', async () => {
    const {
      service,
      invoicePaymentEditRepository,
      invoicePaymentDetailsRepository,
      transactionManager,
    } = createService();

    invoicePaymentEditRepository.findPaymentById.mockResolvedValue({
      id: 88,
      userId: 77,
      amount: 10.02,
      paymentMethodId: PaymentMethodType.CASH,
      date: new Date('2026-09-05T00:00:00.000Z'),
      isDeleted: 0,
    });
    invoicePaymentEditRepository.findInvoicePaymentsByPaymentId.mockResolvedValue(
      [],
    );
    invoicePaymentEditRepository.findLessonPaymentsByPaymentId.mockResolvedValue(
      [
        { id: 9001, lessonId: 201, enrolmentId: 321 },
        { id: 9002, lessonId: 202, enrolmentId: 321 },
      ],
    );
    invoicePaymentEditRepository.isPaymentCreditInvoice.mockResolvedValue(
      false,
    );
    invoicePaymentEditRepository.calculatePaymentBalance
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0.01);
    invoicePaymentEditRepository.updatePayment.mockResolvedValue(undefined);
    invoicePaymentEditRepository.findLessonPaymentsByLessonAndPayment.mockImplementation(
      async (lessonId: number) => {
        if (lessonId === 201) {
          return [{ id: 9001, lessonId: 201 }];
        }
        return [];
      },
    );
    invoicePaymentEditRepository.updateLessonPaymentAmount.mockResolvedValue(
      undefined,
    );
    invoicePaymentEditRepository.softDeleteLessonPaymentById.mockResolvedValue(
      undefined,
    );
    invoicePaymentDetailsRepository.recalculatePrivateLessonBalance.mockResolvedValue(
      undefined,
    );
    invoicePaymentDetailsRepository.recalculateGroupLessonBalance.mockResolvedValue(
      undefined,
    );

    await service.updatePayment(
      88,
      {
        amount: 10.02,
        amountToDistribute: 10.01,
        date: '2026-09-05',
        paymentMethodId: PaymentMethodType.CASH,
        reference: '',
        lessonPayments: [{ id: 201, value: 10.01 }],
        groupLessonPayments: [],
        invoicePayments: [],
      } as any,
      77,
      true,
    );

    expect(
      invoicePaymentEditRepository.softDeleteLessonPayments,
    ).not.toHaveBeenCalled();
    expect(
      invoicePaymentEditRepository.updateLessonPaymentAmount,
    ).toHaveBeenCalledWith(9001, 10.01, 77, transactionManager);
    expect(
      invoicePaymentEditRepository.softDeleteLessonPaymentById,
    ).toHaveBeenCalledWith(9002, 77, transactionManager);
  });

  it('removes an omitted group allocation without removing a kept enrolment on the same lesson', async () => {
    const { service, invoicePaymentEditRepository, transactionManager } =
      createService();

    invoicePaymentEditRepository.findPaymentById.mockResolvedValue({
      id: 88,
      userId: 77,
      amount: 20,
      paymentMethodId: PaymentMethodType.CASH,
      date: new Date('2026-09-05T00:00:00.000Z'),
      isDeleted: 0,
    });
    invoicePaymentEditRepository.findInvoicePaymentsByPaymentId.mockResolvedValue(
      [],
    );
    invoicePaymentEditRepository.findLessonPaymentsByPaymentId.mockResolvedValue(
      [
        { id: 9001, lessonId: 201, enrolmentId: 321 },
        { id: 9002, lessonId: 201, enrolmentId: 322 },
      ],
    );
    invoicePaymentEditRepository.isPaymentCreditInvoice.mockResolvedValue(
      false,
    );
    invoicePaymentEditRepository.calculatePaymentBalance.mockResolvedValue(10);
    invoicePaymentEditRepository.updatePayment.mockResolvedValue(undefined);
    invoicePaymentEditRepository.findGroupLessonById.mockResolvedValue({
      id: 7001,
      lessonId: 201,
      enrolmentId: 321,
    });
    invoicePaymentEditRepository.findLessonPaymentsByLessonAndPayment.mockResolvedValue(
      [{ id: 9001, lessonId: 201, enrolmentId: 321 }],
    );
    invoicePaymentEditRepository.updateLessonPaymentAmount.mockResolvedValue(
      undefined,
    );
    invoicePaymentEditRepository.softDeleteLessonPaymentById.mockResolvedValue(
      undefined,
    );

    await service.updatePayment(
      88,
      {
        amount: 20,
        amountToDistribute: 10,
        date: '2026-09-05',
        paymentMethodId: PaymentMethodType.CASH,
        reference: '',
        lessonPayments: [],
        groupLessonPayments: [{ id: 7001, value: 10 }],
        invoicePayments: [],
      },
      77,
      true,
    );

    expect(
      invoicePaymentEditRepository.updateLessonPaymentAmount,
    ).toHaveBeenCalledWith(9001, 10, 77, transactionManager);
    expect(
      invoicePaymentEditRepository.softDeleteLessonPaymentById,
    ).not.toHaveBeenCalledWith(9001, 77, transactionManager);
    expect(
      invoicePaymentEditRepository.softDeleteLessonPaymentById,
    ).toHaveBeenCalledWith(9002, 77, transactionManager);
  });

  it('removes one submitted group allocation while keeping the other', async () => {
    const { service, invoicePaymentEditRepository, transactionManager } =
      createService();

    invoicePaymentEditRepository.findPaymentById.mockResolvedValue({
      id: 88,
      userId: 77,
      amount: 287.5,
      paymentMethodId: PaymentMethodType.CASH,
      date: new Date('2026-09-08T00:00:00.000Z'),
      isDeleted: 0,
    });
    invoicePaymentEditRepository.findInvoicePaymentsByPaymentId.mockResolvedValue(
      [],
    );
    invoicePaymentEditRepository.findLessonPaymentsByPaymentId.mockResolvedValue([
      { id: 9001, lessonId: 201, enrolmentId: 321 },
      { id: 9002, lessonId: 202, enrolmentId: 321 },
    ]);
    invoicePaymentEditRepository.isPaymentCreditInvoice.mockResolvedValue(false);
    invoicePaymentEditRepository.calculatePaymentBalance.mockResolvedValue(143.75);
    invoicePaymentEditRepository.updatePayment.mockResolvedValue(undefined);
    invoicePaymentEditRepository.findGroupLessonById.mockImplementation(
      async (groupLessonId: number) => {
        if (groupLessonId === 7001) {
          return { id: 7001, lessonId: 201, enrolmentId: 321 };
        }
        if (groupLessonId === 7002) {
          return { id: 7002, lessonId: 202, enrolmentId: 321 };
        }
        return null;
      },
    );
    invoicePaymentEditRepository.findLessonPaymentsByLessonAndPayment.mockImplementation(
      async (lessonId: number) => {
        if (lessonId === 201) {
          return [{ id: 9001, lessonId: 201, enrolmentId: 321 }];
        }
        if (lessonId === 202) {
          return [{ id: 9002, lessonId: 202, enrolmentId: 321 }];
        }
        return [];
      },
    );
    invoicePaymentEditRepository.updateLessonPaymentAmount.mockResolvedValue(
      undefined,
    );
    invoicePaymentEditRepository.softDeleteLessonPaymentById.mockResolvedValue(
      undefined,
    );

    await service.updatePayment(
      88,
      {
        amount: 287.5,
        amountToDistribute: 143.75,
        date: '2026-09-08',
        paymentMethodId: PaymentMethodType.CASH,
        reference: '',
        lessonPayments: [],
        groupLessonPayments: [
          { id: 7001, value: 0 },
          { id: 7002, value: 143.75 },
        ],
        invoicePayments: [],
      },
      77,
      true,
    );

    expect(
      invoicePaymentEditRepository.softDeleteLessonPaymentById,
    ).toHaveBeenCalledWith(9001, 77, transactionManager);
    expect(
      invoicePaymentEditRepository.updateLessonPaymentAmount,
    ).toHaveBeenCalledWith(9002, 143.75, 77, transactionManager);
    expect(
      invoicePaymentEditRepository.softDeleteLessonPaymentById,
    ).not.toHaveBeenCalledWith(9002, 77, transactionManager);
  });

  it('rejects an unknown group lesson id before snapshot cleanup', async () => {
    const { service, invoicePaymentEditRepository } = createService();

    invoicePaymentEditRepository.findPaymentById.mockResolvedValue({
      id: 88,
      userId: 77,
      amount: 287.5,
      paymentMethodId: PaymentMethodType.CASH,
      date: new Date('2026-09-08T00:00:00.000Z'),
      isDeleted: 0,
    });
    invoicePaymentEditRepository.findInvoicePaymentsByPaymentId.mockResolvedValue(
      [],
    );
    invoicePaymentEditRepository.findLessonPaymentsByPaymentId.mockResolvedValue([
      { id: 9001, lessonId: 201, enrolmentId: 321 },
      { id: 9002, lessonId: 202, enrolmentId: 321 },
    ]);
    invoicePaymentEditRepository.isPaymentCreditInvoice.mockResolvedValue(false);
    invoicePaymentEditRepository.updatePayment.mockResolvedValue(undefined);
    invoicePaymentEditRepository.findGroupLessonById.mockResolvedValue(null);

    await expect(
      service.updatePayment(
        88,
        {
          amount: 287.5,
          amountToDistribute: 143.75,
          date: '2026-09-08',
          paymentMethodId: PaymentMethodType.CASH,
          reference: '',
          lessonPayments: [],
          groupLessonPayments: [{ id: 201, value: 143.75 }],
          invoicePayments: [],
        },
        77,
        true,
      ),
    ).rejects.toThrow('Group lesson with ID 201 not found');
    expect(
      invoicePaymentEditRepository.softDeleteLessonPaymentById,
    ).not.toHaveBeenCalled();
  });

  it('removes an omitted invoice allocation while keeping the submitted invoice row', async () => {
    const { service, invoicePaymentEditRepository, transactionManager } =
      createService();

    invoicePaymentEditRepository.findPaymentById.mockResolvedValue({
      id: 88,
      userId: 77,
      amount: 20,
      paymentMethodId: PaymentMethodType.CASH,
      date: new Date('2026-09-05T00:00:00.000Z'),
      isDeleted: 0,
    });
    invoicePaymentEditRepository.findInvoicePaymentsByPaymentId.mockResolvedValue(
      [
        {
          id: 5001,
          invoiceId: 301,
          invoice: { id: 301, type: InvoiceType.INVOICE },
        },
        {
          id: 5002,
          invoiceId: 302,
          invoice: { id: 302, type: InvoiceType.INVOICE },
        },
      ],
    );
    invoicePaymentEditRepository.findLessonPaymentsByPaymentId.mockResolvedValue(
      [],
    );
    invoicePaymentEditRepository.isPaymentCreditInvoice.mockResolvedValue(
      false,
    );
    invoicePaymentEditRepository.calculatePaymentBalance.mockResolvedValue(10);
    invoicePaymentEditRepository.updatePayment.mockResolvedValue(undefined);
    invoicePaymentEditRepository.findInvoicePaymentsByInvoiceAndPayment.mockResolvedValue(
      [{ id: 5001, invoiceId: 301 }],
    );
    invoicePaymentEditRepository.updateInvoicePaymentAmount.mockResolvedValue(
      undefined,
    );
    invoicePaymentEditRepository.softDeleteInvoicePaymentById.mockResolvedValue(
      undefined,
    );

    await service.updatePayment(
      88,
      {
        amount: 20,
        amountToDistribute: 10,
        date: '2026-09-05',
        paymentMethodId: PaymentMethodType.CASH,
        reference: '',
        lessonPayments: [],
        groupLessonPayments: [],
        invoicePayments: [{ id: 301, value: 10 }],
      },
      77,
      true,
    );

    expect(
      invoicePaymentEditRepository.updateInvoicePaymentAmount,
    ).toHaveBeenCalledWith(5001, 10, 77, transactionManager);
    expect(
      invoicePaymentEditRepository.softDeleteInvoicePaymentById,
    ).not.toHaveBeenCalledWith(5001, 77, transactionManager);
    expect(
      invoicePaymentEditRepository.softDeleteInvoicePaymentById,
    ).toHaveBeenCalledWith(5002, 77, transactionManager);
  });
});
