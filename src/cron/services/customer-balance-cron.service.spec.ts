import { CustomerBalanceCronService } from './customer-balance-cron.service';

describe('CustomerBalanceCronService', () => {
  let repository: {
    getTargetCounts: ReturnType<typeof vi.fn>;
    getTargetCustomerIds: ReturnType<typeof vi.fn>;
  };
  let customerBalanceRecalculatorService: {
    recalculateAndPersist: ReturnType<typeof vi.fn>;
  };
  let cronLockService: {
    runWithLock: ReturnType<typeof vi.fn>;
  };
  let service: CustomerBalanceCronService;

  beforeEach(() => {
    repository = {
      getTargetCounts: vi.fn().mockResolvedValue({
        totalCustomers: 2,
        customersWithAccounts: 2,
        customersWithoutAccounts: 0,
      }),
      getTargetCustomerIds: vi
        .fn()
        .mockResolvedValueOnce([101, 102])
        .mockResolvedValueOnce([]),
    };
    customerBalanceRecalculatorService = {
      recalculateAndPersist: vi
        .fn()
        .mockRejectedValueOnce(new Error('Balance recalculation failed'))
        .mockResolvedValueOnce(undefined),
    };
    cronLockService = {
      runWithLock: vi.fn((_lockName, _jobName, _logger, run) => run()),
    };

    service = new CustomerBalanceCronService(
      repository as any,
      customerBalanceRecalculatorService as any,
      cronLockService as any,
    );
  });

  it('logs customer balance failures and continues processing remaining customers', async () => {
    const result = await service.runManually(77);

    expect(
      customerBalanceRecalculatorService.recalculateAndPersist,
    ).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      triggeredBy: 'manual',
      triggeredByUserId: 77,
      processedCustomers: 1,
      failedCustomers: 1,
      totalCustomers: 2,
    });
  });
});
