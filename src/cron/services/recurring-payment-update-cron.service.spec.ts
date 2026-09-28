import { RecurringPaymentUpdateCronService } from './recurring-payment-update-cron.service';

describe('RecurringPaymentUpdateCronService', () => {
  const location = { id: 48, name: 'Main', slug: 'main' };
  const recurringPayment = {
    id: 101,
    customerId: 501,
    amount: 120,
    paymentFrequencyId: 1,
    expiryDate: '2026-12-31',
    startDate: '2026-01-10',
    nextEntryDay: '2026-04-10',
  };

  let dataSource: {
    transaction: ReturnType<typeof vi.fn>;
  };
  let repository: {
    getCronEnabledLocations: ReturnType<typeof vi.fn>;
    getOutdatedRecurringPayments: ReturnType<typeof vi.fn>;
    processRecurringPaymentUpdate: ReturnType<typeof vi.fn>;
  };
  let cronLockService: {
    runWithLock: ReturnType<typeof vi.fn>;
  };
  let service: RecurringPaymentUpdateCronService;
  const originalCurrentDate = process.env.SMW_TEST_CURRENT_DATE;

  beforeEach(() => {
    process.env.SMW_TEST_CURRENT_DATE = '2026-05-20';

    dataSource = {
      transaction: vi.fn(async (callback) => callback({})),
    };
    repository = {
      getCronEnabledLocations: vi.fn().mockResolvedValue([location]),
      getOutdatedRecurringPayments: vi
        .fn()
        .mockResolvedValue([recurringPayment]),
      processRecurringPaymentUpdate: vi.fn().mockResolvedValue({
        updated: true,
        previousRecordedPaymentDate: '2026-04-10',
        previousNextEntryDay: '2026-04-10',
        nextEntryDay: '2026-06-10',
        skippedReason: null,
      }),
    };
    cronLockService = {
      runWithLock: vi.fn((_lockName, _jobName, _logger, run) => run()),
    };

    service = new RecurringPaymentUpdateCronService(
      dataSource as any,
      repository as any,
      cronLockService as any,
    );
  });

  afterEach(() => {
    process.env.SMW_TEST_CURRENT_DATE = originalCurrentDate;
  });

  it('updates stale recurring payment next entry days', async () => {
    const result = await service.runManually(77);

    expect(repository.getOutdatedRecurringPayments).toHaveBeenCalledWith(
      location.id,
      '2026-05-20',
    );
    expect(repository.processRecurringPaymentUpdate).toHaveBeenCalledWith(
      recurringPayment,
      '2026-05-20',
      727,
      {},
    );
    expect(result).toMatchObject({
      jobName: 'recurring-payment-update-recurring-payments',
      triggeredBy: 'manual',
      triggeredByUserId: 77,
      locationsProcessed: 1,
      recurringPaymentsMatched: 1,
      recurringPaymentsUpdated: 1,
      recurringPaymentsSkippedInvalid: 0,
    });
  });

  it('counts invalid payment frequencies without marking them updated', async () => {
    repository.processRecurringPaymentUpdate.mockResolvedValue({
      updated: false,
      previousRecordedPaymentDate: null,
      previousNextEntryDay: '2026-04-10',
      nextEntryDay: null,
      skippedReason: 'invalid-payment-frequency',
    });

    const result = await service.runManually(77);

    expect(result).toMatchObject({
      recurringPaymentsMatched: 1,
      recurringPaymentsUpdated: 0,
      recurringPaymentsSkippedInvalid: 1,
    });
  });

  it('logs recurring payment update failures and continues processing remaining records', async () => {
    const secondRecurringPayment = {
      ...recurringPayment,
      id: 102,
      customerId: 502,
    };
    repository.getOutdatedRecurringPayments.mockResolvedValue([
      recurringPayment,
      secondRecurringPayment,
    ]);
    repository.processRecurringPaymentUpdate
      .mockRejectedValueOnce(new Error('Payment update failed'))
      .mockResolvedValueOnce({
        updated: true,
        previousRecordedPaymentDate: '2026-04-10',
        previousNextEntryDay: '2026-04-10',
        nextEntryDay: '2026-06-10',
        skippedReason: null,
      });

    const result = await service.runManually(77);

    expect(repository.processRecurringPaymentUpdate).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      recurringPaymentsMatched: 2,
      recurringPaymentsUpdated: 1,
      recurringPaymentsFailed: 1,
      recurringPaymentsSkippedInvalid: 0,
    });
  });
});
