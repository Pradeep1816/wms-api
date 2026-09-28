import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoicePaymentDetailsService } from './invoice-payment-details.service';

function createService() {
  const invoicePaymentDetailsRepository = {
    findPaymentById: vi.fn(),
    hasLinkedPFI: vi.fn().mockResolvedValue(false),
    isAutoPayment: vi.fn().mockReturnValue(false),
    hasLessonWithCreditUsed: vi.fn().mockResolvedValue(false),
    deletePaymentCascade: vi.fn().mockResolvedValue({
      touchedPaymentIds: [],
      affectedInvoiceIds: [],
      affectedLessonContexts: [],
    }),
  };
  const invoicePaymentsTransformationService = {
    transformDeletePaymentResponse: vi.fn().mockReturnValue({ status: true }),
  };
  const manager = { query: vi.fn().mockResolvedValue([]) };
  const dataSource = {
    manager,
    transaction: vi.fn(async (callback: (manager: any) => Promise<any>) =>
      callback(manager),
    ),
  };
  const customerBalanceRecalculatorService = {
    recalculateAndPersist: vi.fn(),
  };
  const royaltyTransactionRepository = {
    hasPaymentRecognition: vi.fn().mockResolvedValue(false),
  };
  const royaltyPaymentCorrectionService = {
    reverseRecognizedPaymentForDeletion: vi.fn(),
  };
  const service = new InvoicePaymentDetailsService(
    invoicePaymentDetailsRepository as any,
    invoicePaymentsTransformationService as any,
    dataSource as any,
    customerBalanceRecalculatorService as any,
    royaltyTransactionRepository as any,
    royaltyPaymentCorrectionService as any,
  );

  return {
    service,
    manager,
    invoicePaymentDetailsRepository,
    dataSource,
    royaltyTransactionRepository,
    royaltyPaymentCorrectionService,
    customerBalanceRecalculatorService,
  };
}

describe('InvoicePaymentDetailsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('blocks ordinary deletion of a payment linked to a completed POS sale', async () => {
    const {
      service,
      manager,
      invoicePaymentDetailsRepository,
      dataSource,
      royaltyTransactionRepository,
    } = createService();
    invoicePaymentDetailsRepository.findPaymentById.mockResolvedValue({
      id: 55,
      userId: 77,
      date: new Date('2026-09-10T00:00:00.000Z'),
      paymentMethodId: 4,
      amount: 25,
    });
    manager.query.mockResolvedValue([{ id: 901 }]);

    await expect(
      service.deletePayment(55, 694, 'training-location', true),
    ).rejects.toThrow(
      'Payments linked to completed POS sales cannot be edited or deleted',
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM pos_transaction'),
      [55, 55],
    );
    expect(royaltyTransactionRepository.hasPaymentRecognition).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('retains the existing past-month delete restriction for non-admin users', async () => {
    const {
      service,
      invoicePaymentDetailsRepository,
      dataSource,
      royaltyTransactionRepository,
    } = createService();
    invoicePaymentDetailsRepository.findPaymentById.mockResolvedValue({
      id: 55,
      userId: 77,
      date: new Date('2026-07-10T00:00:00.000Z'),
      createdOn: new Date('2026-08-10T09:00:00.000Z'),
    });
    royaltyTransactionRepository.hasPaymentRecognition.mockResolvedValue(true);

    await expect(service.deletePayment(55, 694, 'burlington', false)).rejects.toThrow(
      "You don't have access to delete past month payment receipts",
    );
    expect(royaltyTransactionRepository.hasPaymentRecognition).toHaveBeenCalledWith(
      dataSource.manager,
      55,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('reverses royalty and deletes a future-dated recognized payment', async () => {
    const {
      service,
      invoicePaymentDetailsRepository,
      royaltyTransactionRepository,
      royaltyPaymentCorrectionService,
      dataSource,
    } = createService();
    invoicePaymentDetailsRepository.findPaymentById.mockResolvedValue({
      id: 55,
      userId: 77,
      date: new Date('2026-09-01T00:00:00.000Z'),
      createdOn: new Date('2026-08-10T09:00:00.000Z'),
      paymentMethodId: 4,
      amount: 255,
    });
    royaltyTransactionRepository.hasPaymentRecognition.mockResolvedValue(true);

    await expect(
      service.deletePayment(55, 694, 'newmarket', false),
    ).resolves.toEqual({ status: true });
    expect(
      royaltyPaymentCorrectionService.reverseRecognizedPaymentForDeletion,
    ).toHaveBeenCalledWith(dataSource.manager, 55, expect.any(Date), 694);
    expect(
      invoicePaymentDetailsRepository.deletePaymentCascade,
    ).toHaveBeenCalledWith(55, 694, dataSource.manager);
  });

  it('preserves the existing admin ability to delete a past recognized payment', async () => {
    const {
      service,
      invoicePaymentDetailsRepository,
      royaltyTransactionRepository,
      royaltyPaymentCorrectionService,
      dataSource,
    } = createService();
    invoicePaymentDetailsRepository.findPaymentById.mockResolvedValue({
      id: 56,
      userId: 77,
      date: new Date('2026-07-10T00:00:00.000Z'),
      createdOn: new Date('2026-07-10T09:00:00.000Z'),
      paymentMethodId: 4,
      amount: 255,
    });
    royaltyTransactionRepository.hasPaymentRecognition.mockResolvedValue(true);

    await expect(
      service.deletePayment(56, 694, 'burlington', true),
    ).resolves.toEqual({ status: true });
    expect(
      royaltyPaymentCorrectionService.reverseRecognizedPaymentForDeletion,
    ).toHaveBeenCalledWith(dataSource.manager, 56, expect.any(Date), 694);
  });
});
