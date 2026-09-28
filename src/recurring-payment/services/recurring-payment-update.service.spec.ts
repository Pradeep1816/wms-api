import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { RecurringPaymentUpdateService } from './recurring-payment-update.service';
import { UpdateCustomerRecurringPaymentDto } from '../dto/update-recurring-payment.dto';

function createRepositoryMock() {
  return {
    getRecurringPaymentById: vi.fn(),
    getEnrolmentLinkWarnings: vi.fn(),
    getPaymentFrequencyById: vi.fn(),
    getActivePaymentMethods: vi.fn(),
    getAllPaymentFrequencies: vi.fn(),
    getEligibleEnrolmentIds: vi.fn(),
    getSelectedEnrolmentIds: vi.fn(),
    getEnrolmentDetails: vi.fn(),
    hasRecordedRecurringPaymentBetween: vi.fn(),
    getLatestRecordedRecurringPayment: vi.fn(),
    updateRecurringPayment: vi.fn(async () => undefined),
  };
}

describe('RecurringPaymentUpdateService', () => {
  let service: RecurringPaymentUpdateService;

  let customerRecurringPaymentRepository: ReturnType<typeof createRepositoryMock>;
  let recurringPaymentUpdateRepository: ReturnType<typeof createRepositoryMock>;
  let validationService: { validateLocationAndCustomer: ReturnType<typeof vi.fn> };
  let transformationService: Record<string, unknown>;
  let auditLogWriterService: { writeAuditLog: ReturnType<typeof vi.fn> };
  let userRepository: { findOne: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    customerRecurringPaymentRepository = createRepositoryMock();
    recurringPaymentUpdateRepository = createRepositoryMock();
    validationService = {
      validateLocationAndCustomer: vi.fn(),
    };
    transformationService = {};
    auditLogWriterService = {
      writeAuditLog: vi.fn(async () => undefined),
    };
    userRepository = {
      findOne: vi.fn(),
    };

    service = new RecurringPaymentUpdateService(
      customerRecurringPaymentRepository as any,
      recurringPaymentUpdateRepository as any,
      validationService as any,
      transformationService as any,
      auditLogWriterService as any,
      userRepository as any,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes a before/after audit diff when the snapshot capture succeeds', async () => {
    const beforeRecurringPayment = {
      id: 44,
      customerId: 501,
      entryDay: 1,
      paymentDay: 5,
      paymentMethodId: 8,
      paymentFrequencyId: 1,
      expiryDate: '2026-12-31',
      amount: 100,
      isDeleted: false,
      createdOn: new Date('2026-01-01T00:00:00.000Z'),
      updatedOn: new Date('2026-01-01T00:00:00.000Z'),
      createdByUserId: 10,
      updatedByUserId: 10,
      isRecurringPaymentEnabled: true,
      startDate: '2026-06-01',
      nextEntryDay: '2026-06-01',
      customer: {
        id: 501,
        firstName: 'Alice',
        lastName: 'Smith',
      },
    };

    const afterRecurringPayment = {
      ...beforeRecurringPayment,
      paymentDay: 10,
      amount: 125,
      isRecurringPaymentEnabled: false,
      updatedOn: new Date('2026-01-02T00:00:00.000Z'),
      customer: {
        id: 501,
        firstName: 'Alice',
        lastName: 'Smith',
      },
    };

    customerRecurringPaymentRepository.getRecurringPaymentById
      .mockResolvedValueOnce(beforeRecurringPayment)
      .mockResolvedValueOnce(afterRecurringPayment);
    recurringPaymentUpdateRepository.getPaymentFrequencyById.mockResolvedValue({ id: 1 });
    recurringPaymentUpdateRepository.getSelectedEnrolmentIds
      .mockResolvedValueOnce([201])
      .mockResolvedValueOnce([201, 202]);
    validationService.validateLocationAndCustomer.mockResolvedValue({ locationId: 22 });
    userRepository.findOne.mockResolvedValue({
      id: 7001,
      profile: { firstname: 'Seng', lastname: 'Test' },
    });

    const dto = {
      startDate: '2026-06-01',
      paymentDay: 10,
      paymentMethodId: 8,
      paymentFrequencyId: 1,
      amount: 125,
      isEnabled: 0,
      enrolmentIds: [],
    } as UpdateCustomerRecurringPaymentDto;

    await expect(
      service.updateRecurringPayment('training-location', 44, dto, 7001),
    ).resolves.toEqual({ id: 44 });

    expect(recurringPaymentUpdateRepository.updateRecurringPayment).toHaveBeenCalledWith(
      44,
      expect.objectContaining({
        paymentDay: 10,
        paymentMethodId: 8,
        paymentFrequencyId: 1,
        amount: 125,
        isRecurringPaymentEnabled: false,
        startDate: '2026-06-01',
        entryDay: 1,
      }),
      [],
      7001,
    );

    expect(auditLogWriterService.writeAuditLog).toHaveBeenCalledTimes(1);
    const payload = auditLogWriterService.writeAuditLog.mock.calls[0][0];

    expect(payload.message).toContain('changed the customer recurring payment details');
    expect(payload.mainLink).toEqual({
      index: 'Alice Smith',
      path: '/v2/admin/training-location/customers/501',
    });
    expect(payload.data).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({
          recurringPayment: expect.objectContaining({
            amount: 100,
            paymentDay: 5,
            isRecurringPaymentEnabled: true,
          }),
          enrolmentIds: [201],
        }),
        after: expect.objectContaining({
          recurringPayment: expect.objectContaining({
            amount: 125,
            paymentDay: 10,
            isRecurringPaymentEnabled: false,
          }),
          enrolmentIds: [201, 202],
        }),
        changes: expect.objectContaining({
          amount: expect.objectContaining({ before: 100, after: 125 }),
          paymentDay: expect.objectContaining({ before: 5, after: 10 }),
          isRecurringPaymentEnabled: expect.objectContaining({ before: true, after: false }),
          enrolmentIds: expect.objectContaining({ before: [201], after: [201, 202] }),
        }),
      }),
    );
  });

  it('includes stale enrolment warnings in enabled payment edit data', async () => {
    const warning = {
      code: 'COMPLETED_ENROLMENT_LINK_WITH_UNLINKED_CURRENT_ENROLMENT',
      message: 'Review this recurring payment.',
      studentId: 12439,
      studentName: 'Akal Purewal',
      programName: 'Piano Core',
      completedEnrolmentId: 29336,
      currentEnrolmentId: 30968,
    };
    customerRecurringPaymentRepository.getRecurringPaymentById.mockResolvedValue({
      id: 3472,
      customerId: 7768,
      isRecurringPaymentEnabled: true,
    });
    customerRecurringPaymentRepository.getEnrolmentLinkWarnings.mockResolvedValue([
      warning,
    ]);
    validationService.validateLocationAndCustomer.mockResolvedValue({
      locationId: 15,
    });
    recurringPaymentUpdateRepository.getActivePaymentMethods.mockResolvedValue([]);
    recurringPaymentUpdateRepository.getAllPaymentFrequencies.mockResolvedValue(
      [],
    );
    recurringPaymentUpdateRepository.getEligibleEnrolmentIds.mockResolvedValue([
      30968,
    ]);
    recurringPaymentUpdateRepository.getSelectedEnrolmentIds.mockResolvedValue([
      29336,
    ]);
    recurringPaymentUpdateRepository.getEnrolmentDetails.mockResolvedValue([]);
    transformationService = {
      transformPaymentToUpdateDto: vi.fn(() => ({})),
      transformPaymentMethodsToDtos: vi.fn(() => []),
      transformPaymentFrequenciesToDtos: vi.fn(() => []),
      transformEnrolmentsToFormDtos: vi.fn(() => []),
      transformFormDataToDto: vi.fn(
        (
          payment,
          paymentMethods,
          paymentFrequencies,
          enrolments,
          enrolmentWarnings,
        ) => ({
          body: {
            payment,
            paymentMethods,
            paymentFrequencies,
            enrolments,
            enrolmentWarnings,
          },
        }),
      ),
    };
    service = new RecurringPaymentUpdateService(
      customerRecurringPaymentRepository as any,
      recurringPaymentUpdateRepository as any,
      validationService as any,
      transformationService as any,
      auditLogWriterService as any,
      userRepository as any,
    );

    const result = await service.getUpdateFormData('burlington', 3472);

    expect(
      customerRecurringPaymentRepository.getEnrolmentLinkWarnings,
    ).toHaveBeenCalledWith(3472, 7768, 15);
    expect(result.body.enrolmentWarnings).toEqual([warning]);
  });

  it('falls back to a simple after-state payload when the snapshot capture fails', async () => {
    const beforeRecurringPayment = {
      id: 44,
      customerId: 501,
      entryDay: 1,
      paymentDay: 5,
      paymentMethodId: 8,
      paymentFrequencyId: 1,
      expiryDate: '2026-12-31',
      amount: 100,
      isDeleted: false,
      createdOn: new Date('2026-01-01T00:00:00.000Z'),
      updatedOn: new Date('2026-01-01T00:00:00.000Z'),
      createdByUserId: 10,
      updatedByUserId: 10,
      isRecurringPaymentEnabled: true,
      startDate: '2026-06-01',
      nextEntryDay: '2026-06-01',
      customer: {
        id: 501,
        firstName: 'Alice',
        lastName: 'Smith',
      },
    };

    const afterRecurringPayment = {
      ...beforeRecurringPayment,
      paymentDay: 12,
      amount: 130,
      isRecurringPaymentEnabled: true,
      customer: {
        id: 501,
        firstName: 'Alice',
        lastName: 'Smith',
      },
    };

    customerRecurringPaymentRepository.getRecurringPaymentById
      .mockResolvedValueOnce(beforeRecurringPayment)
      .mockResolvedValueOnce(afterRecurringPayment);
    recurringPaymentUpdateRepository.getPaymentFrequencyById.mockResolvedValue({ id: 1 });
    recurringPaymentUpdateRepository.getSelectedEnrolmentIds
      .mockRejectedValueOnce(new Error('snapshot failed'))
      .mockResolvedValueOnce([202]);
    validationService.validateLocationAndCustomer.mockResolvedValue({ locationId: 22 });
    userRepository.findOne.mockResolvedValue({
      id: 7001,
      profile: { firstname: 'Seng', lastname: 'Test' },
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const dto = {
      startDate: '2026-06-01',
      paymentDay: 12,
      paymentMethodId: 8,
      paymentFrequencyId: 1,
      amount: 130,
      isEnabled: 1,
      enrolmentIds: [],
    } as UpdateCustomerRecurringPaymentDto;

    await expect(
      service.updateRecurringPayment('training-location', 44, dto, 7001),
    ).resolves.toEqual({ id: 44 });

    expect(warnSpy).toHaveBeenCalled();
    expect(auditLogWriterService.writeAuditLog).toHaveBeenCalledTimes(1);

    const payload = auditLogWriterService.writeAuditLog.mock.calls[0][0];
    expect(payload.data).toEqual(
      expect.objectContaining({
        before: null,
        after: expect.objectContaining({
          recurringPayment: expect.objectContaining({
            amount: 130,
            paymentDay: 12,
          }),
          enrolmentIds: [202],
        }),
        changes: {},
      }),
    );
  });
});
