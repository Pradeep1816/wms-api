import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerRecurringPaymentInfoRequestDto } from '../dto/customer-recurring-payment-info-request.dto';
import { CustomerRecurringPaymentService } from './customer-recurring-payment.service';

describe('CustomerRecurringPaymentService', () => {
  let repository: Record<string, ReturnType<typeof vi.fn>>;
  let transformationService: Record<string, ReturnType<typeof vi.fn>>;
  let infoTransformationService: Record<string, ReturnType<typeof vi.fn>>;
  let validationService: Record<string, ReturnType<typeof vi.fn>>;
  let calculationService: Record<string, ReturnType<typeof vi.fn>>;
  let service: CustomerRecurringPaymentService;

  beforeEach(() => {
    repository = {
      getRecurringPaymentById: vi.fn(),
      getRecurringPaymentCreateEnrolments: vi.fn().mockResolvedValue([]),
      getPaymentMethods: vi.fn().mockResolvedValue([]),
      getPaymentFrequencies: vi.fn().mockResolvedValue([]),
      getEnrolmentLinkWarnings: vi.fn().mockResolvedValue([]),
      getRecurringPaymentsByCustomerId: vi.fn(),
      getRecurringPaymentIdsWithEnrolmentLinkWarnings: vi.fn(),
    };
    transformationService = {
      transformRecurringPaymentsToDtos: vi.fn(),
    };
    calculationService = {
      calculatePagination: vi.fn(),
    };
    infoTransformationService = {
      transformPaymentToInfoDto: vi.fn(() => ({})),
      transformEnrolmentsToFormDtos: vi.fn(() => []),
      transformPaymentMethodsToDtos: vi.fn(() => []),
      transformPaymentFrequenciesToDtos: vi.fn(() => []),
      transformInfoDataToDto: vi.fn(
        (
          payment: unknown,
          enrolments: unknown,
          paymentMethods: unknown,
          paymentFrequencies: unknown,
          enrolmentWarnings: unknown,
        ) => ({
          payment,
          enrolments,
          paymentMethods,
          paymentFrequencies,
          enrolmentWarnings,
        }),
      ),
    };
    validationService = {
      validateLocationAndCustomer: vi
        .fn()
        .mockResolvedValue({ locationId: 15 }),
    };

    service = new CustomerRecurringPaymentService(
      repository as any,
      transformationService as any,
      calculationService as any,
      infoTransformationService as any,
      validationService as any,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('includes enrolment warnings when an enabled payment is edited', async () => {
    const warning = {
      code: 'COMPLETED_ENROLMENT_LINK_WITH_UNLINKED_CURRENT_ENROLMENT',
      message: 'Review this recurring payment.',
      studentId: 12439,
      studentName: 'Akal Purewal',
      programName: 'Piano Core',
      completedEnrolmentId: 29336,
      currentEnrolmentId: 30968,
    };
    repository.getRecurringPaymentById.mockResolvedValue({
      id: 3472,
      customerId: 7768,
      isRecurringPaymentEnabled: true,
    });
    repository.getEnrolmentLinkWarnings.mockResolvedValue([warning]);

    const result = await service.getRecurringPaymentInfo('burlington', 7768, {
      id: 3472,
    } as CustomerRecurringPaymentInfoRequestDto);

    expect(repository.getEnrolmentLinkWarnings).toHaveBeenCalledWith(
      3472,
      7768,
      15,
    );
    expect(result.body.enrolmentWarnings).toEqual([warning]);
  });

  it('does not warn for a disabled recurring payment', async () => {
    repository.getRecurringPaymentById.mockResolvedValue({
      id: 3472,
      customerId: 7768,
      isRecurringPaymentEnabled: false,
    });

    const result = await service.getRecurringPaymentInfo('burlington', 7768, {
      id: 3472,
    } as CustomerRecurringPaymentInfoRequestDto);

    expect(repository.getEnrolmentLinkWarnings).not.toHaveBeenCalled();
    expect(result.body.enrolmentWarnings).toEqual([]);
  });

  it('keeps the edit form available when the advisory warning check fails', async () => {
    repository.getRecurringPaymentById.mockResolvedValue({
      id: 3472,
      customerId: 7768,
      isRecurringPaymentEnabled: true,
    });
    repository.getEnrolmentLinkWarnings.mockRejectedValue(
      new Error('Warning lookup failed'),
    );
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    const result = await service.getRecurringPaymentInfo('burlington', 7768, {
      id: 3472,
    } as CustomerRecurringPaymentInfoRequestDto);

    expect(warnSpy).toHaveBeenCalled();
    expect(result.body.enrolmentWarnings).toEqual([]);
  });

  it('marks warning payments in the customer recurring-payment list', async () => {
    const recurringPayments = [
      { id: 3472, customerId: 7768 },
      { id: 4000, customerId: 7768 },
    ];
    const transformedPayments = [
      { id: 3472, hasEnrolmentWarning: true },
      { id: 4000, hasEnrolmentWarning: false },
    ];
    repository.getRecurringPaymentsByCustomerId.mockResolvedValue({
      recurringPayments,
      total: 2,
    });
    repository.getRecurringPaymentIdsWithEnrolmentLinkWarnings.mockResolvedValue(
      new Set([3472]),
    );
    transformationService.transformRecurringPaymentsToDtos.mockReturnValue(
      transformedPayments,
    );
    calculationService.calculatePagination.mockReturnValue({
      page: 1,
      limit: 10,
      total: 2,
      totalPages: 1,
    });

    const result = await service.getRecurringPaymentsByCustomerId(
      'burlington',
      7768,
      { page: 1, limit: 10 },
    );

    expect(
      repository.getRecurringPaymentIdsWithEnrolmentLinkWarnings,
    ).toHaveBeenCalledWith([3472, 4000], 15);
    expect(
      transformationService.transformRecurringPaymentsToDtos,
    ).toHaveBeenCalledWith(recurringPayments, new Set([3472]));
    expect(result.body).toEqual(transformedPayments);
  });

  it('keeps the customer recurring-payment list available when the warning check fails', async () => {
    const recurringPayments = [{ id: 3472, customerId: 7768 }];
    const transformedPayments = [
      { id: 3472, hasEnrolmentWarning: false },
    ];
    repository.getRecurringPaymentsByCustomerId.mockResolvedValue({
      recurringPayments,
      total: 1,
    });
    repository.getRecurringPaymentIdsWithEnrolmentLinkWarnings.mockRejectedValue(
      new Error('Warning lookup failed'),
    );
    transformationService.transformRecurringPaymentsToDtos.mockReturnValue(
      transformedPayments,
    );
    calculationService.calculatePagination.mockReturnValue({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    const result = await service.getRecurringPaymentsByCustomerId(
      'burlington',
      7768,
      { page: 1, limit: 10 },
    );

    expect(warnSpy).toHaveBeenCalled();
    expect(
      transformationService.transformRecurringPaymentsToDtos,
    ).toHaveBeenCalledWith(recurringPayments, new Set<number>());
    expect(result.body).toEqual(transformedPayments);
  });
});
