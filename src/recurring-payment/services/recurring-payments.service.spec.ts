import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecurringPaymentsService } from './recurring-payments.service';

describe('RecurringPaymentsService', () => {
  let recurringPaymentsRepository: Record<string, ReturnType<typeof vi.fn>>;
  let transformationService: Record<string, ReturnType<typeof vi.fn>>;
  let calculationService: Record<string, ReturnType<typeof vi.fn>>;
  let warningRepository: Record<string, ReturnType<typeof vi.fn>>;
  let service: RecurringPaymentsService;

  beforeEach(() => {
    recurringPaymentsRepository = {
      getRecurringPaymentsByLocationId: vi.fn(),
    };
    transformationService = {
      transformRecurringPaymentsList: vi.fn(),
    };
    calculationService = {
      calculatePagination: vi.fn(),
    };
    warningRepository = {
      getRecurringPaymentIdsWithEnrolmentLinkWarnings: vi.fn(),
    };
    service = new RecurringPaymentsService(
      recurringPaymentsRepository as any,
      transformationService as any,
      calculationService as any,
      warningRepository as any,
    );
  });

  it('adds warning status to the location recurring-payment list', async () => {
    const recurringPayments = [
      { id: 3472, customerId: 7768 },
      { id: 4000, customerId: 9000 },
    ];
    const transformedPayments = [
      { id: 3472, hasEnrolmentWarning: true },
      { id: 4000, hasEnrolmentWarning: false },
    ];
    recurringPaymentsRepository.getRecurringPaymentsByLocationId.mockResolvedValue(
      {
        recurringPayments,
        total: 2,
      },
    );
    warningRepository.getRecurringPaymentIdsWithEnrolmentLinkWarnings.mockResolvedValue(
      new Set([3472]),
    );
    transformationService.transformRecurringPaymentsList.mockReturnValue(
      transformedPayments,
    );
    calculationService.calculatePagination.mockReturnValue({
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1,
    });

    const result = await service.getRecurringPayments(15, {
      page: 1,
      limit: 20,
    });

    expect(
      warningRepository.getRecurringPaymentIdsWithEnrolmentLinkWarnings,
    ).toHaveBeenCalledWith([3472, 4000], 15);
    expect(
      transformationService.transformRecurringPaymentsList,
    ).toHaveBeenCalledWith(recurringPayments, new Set([3472]));
    expect(result.body).toEqual(transformedPayments);
  });

  it('keeps the list available when the advisory warning check fails', async () => {
    const recurringPayments = [{ id: 3472, customerId: 7768 }];
    recurringPaymentsRepository.getRecurringPaymentsByLocationId.mockResolvedValue(
      {
        recurringPayments,
        total: 1,
      },
    );
    warningRepository.getRecurringPaymentIdsWithEnrolmentLinkWarnings.mockRejectedValue(
      new Error('Warning lookup failed'),
    );
    transformationService.transformRecurringPaymentsList.mockReturnValue([
      { id: 3472, hasEnrolmentWarning: false },
    ]);
    calculationService.calculatePagination.mockReturnValue({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await service.getRecurringPayments(15, {
      page: 1,
      limit: 20,
    });

    expect(
      transformationService.transformRecurringPaymentsList,
    ).toHaveBeenCalledWith(recurringPayments, new Set());
    expect(result.body).toEqual([{ id: 3472, hasEnrolmentWarning: false }]);
  });
});
