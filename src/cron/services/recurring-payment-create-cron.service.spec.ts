import { RecurringPaymentCreateCronService } from './recurring-payment-create-cron.service';

describe('RecurringPaymentCreateCronService', () => {
  const location = { id: 48, name: 'Main', slug: 'main' };
  const recurringPayment = {
    id: 101,
    customerId: 501,
    customerName: 'Customer One',
    amount: 120,
    paymentMethodId: 6,
    paymentFrequencyId: 1,
    paymentDay: 10,
    expiryDate: '2026-12-31',
    nextEntryDay: '2026-05-10',
  };

  let dataSource: {
    transaction: ReturnType<typeof vi.fn>;
  };
  let repository: {
    getCronEnabledLocations: ReturnType<typeof vi.fn>;
    getDueRecurringPayments: ReturnType<typeof vi.fn>;
    processRecurringPayment: ReturnType<typeof vi.fn>;
  };
  let customerBalanceRecalculatorService: {
    recalculateAndPersist: ReturnType<typeof vi.fn>;
  };
  let cronLockService: {
    runWithLock: ReturnType<typeof vi.fn>;
  };
  let royaltyLedgerService: {
    recordPaymentRecognition: ReturnType<typeof vi.fn>;
    recordEvent: ReturnType<typeof vi.fn>;
  };
  let transactionManager: {
    findOne: ReturnType<typeof vi.fn>;
  };
  let service: RecurringPaymentCreateCronService;
  const originalCurrentDate = process.env.SMW_TEST_CURRENT_DATE;

  beforeEach(() => {
    process.env.SMW_TEST_CURRENT_DATE = '2026-05-10';

    transactionManager = {
      findOne: vi.fn(async (entity, options) =>
        entity?.name === 'ItemCategory'
          ? { id: 1, name: 'Lesson', isDeleted: false }
          : { value: options.where.type === 2 ? 1.25 : 6 },
      ),
    };
    dataSource = {
      transaction: vi.fn(async (callback) => callback(transactionManager)),
    };
    repository = {
      getCronEnabledLocations: vi.fn().mockResolvedValue([location]),
      getDueRecurringPayments: vi.fn().mockResolvedValue([recurringPayment]),
      processRecurringPayment: vi.fn().mockResolvedValue({
        paymentCreated: true,
        paymentId: 9001,
        recurringPaymentId: 7001,
        lessonsPaid: 2,
        lessonPaymentsCreated: 2,
        amountApplied: 95,
        remainingPaymentAmount: 25,
      }),
    };
    customerBalanceRecalculatorService = {
      recalculateAndPersist: vi.fn().mockResolvedValue(0),
    };
    cronLockService = {
      runWithLock: vi.fn((_lockName, _jobName, _logger, run) => run()),
    };
    royaltyLedgerService = {
      recordPaymentRecognition: vi.fn().mockResolvedValue({ id: 1 }),
      recordEvent: vi.fn().mockResolvedValue({ id: 2 }),
    };

    service = new RecurringPaymentCreateCronService(
      dataSource as any,
      repository as any,
      customerBalanceRecalculatorService as any,
      cronLockService as any,
      royaltyLedgerService as any,
    );
  });

  afterEach(() => {
    process.env.SMW_TEST_CURRENT_DATE = originalCurrentDate;
  });

  it('creates due recurring payments and recalculates the customer balance', async () => {
    const result = await service.runManually(77);

    expect(repository.getDueRecurringPayments).toHaveBeenCalledWith(
      location.id,
      '2026-05-10',
    );
    expect(repository.processRecurringPayment).toHaveBeenCalledWith(
      recurringPayment,
      '2026-05-10',
      '2026-05-10',
      '2026-05-01',
      '2026-05-10',
      727,
      transactionManager,
    );
    expect(royaltyLedgerService.recordPaymentRecognition).toHaveBeenCalledWith(
      transactionManager,
      expect.objectContaining({
        paymentId: 9001,
        locationId: 48,
        customerId: 501,
        paymentAmount: 120,
        revenueAmount: 120,
        rateApplied: 6,
        advertisementRateApplied: 1.25,
        purposeKey: 'recurring:101',
      }),
    );
    expect(royaltyLedgerService.recordEvent).toHaveBeenCalledWith(
      transactionManager,
      expect.objectContaining({
        paymentId: 9001,
        paymentAmount: -95,
        revenueAmount: -95,
        royaltyAmount: 0,
        eventType: 'ALLOCATION',
        relatedRoyaltyTransactionId: 1,
      }),
    );
    expect(
      customerBalanceRecalculatorService.recalculateAndPersist,
    ).toHaveBeenCalledWith(recurringPayment.customerId, {
      locationSlug: location.slug,
      updatedByUserId: 727,
    });
    expect(result).toMatchObject({
      triggeredBy: 'manual',
      triggeredByUserId: 77,
      locationsProcessed: 1,
      recurringPaymentsMatched: 1,
      paymentsCreated: 1,
      lessonPaymentsCreated: 2,
      lessonsPaid: 2,
      amountApplied: 95,
      unappliedPaymentAmount: 25,
    });
  });

  it('counts skipped recurring payments without recalculating balances', async () => {
    repository.processRecurringPayment.mockResolvedValue({
      paymentCreated: false,
      paymentId: null,
      recurringPaymentId: null,
      lessonsPaid: 0,
      lessonPaymentsCreated: 0,
      amountApplied: 0,
      remainingPaymentAmount: 120,
    });

    const result = await service.runManually(77);

    expect(
      customerBalanceRecalculatorService.recalculateAndPersist,
    ).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      recurringPaymentsMatched: 1,
      paymentsCreated: 0,
      recurringPaymentsSkippedExisting: 1,
      recurringPaymentsSkippedExpired: 0,
    });
  });

  it('logs recurring payment failures and continues processing remaining records', async () => {
    const secondRecurringPayment = {
      ...recurringPayment,
      id: 102,
      customerId: 502,
      customerName: 'Customer Two',
    };
    repository.getDueRecurringPayments.mockResolvedValue([
      recurringPayment,
      secondRecurringPayment,
    ]);
    repository.processRecurringPayment
      .mockRejectedValueOnce(new Error('Payment creation failed'))
      .mockResolvedValueOnce({
        paymentCreated: true,
        paymentId: 9002,
        recurringPaymentId: 7002,
        lessonsPaid: 1,
        lessonPaymentsCreated: 1,
        amountApplied: 50,
        remainingPaymentAmount: 0,
      });

    const result = await service.runManually(77);

    expect(repository.processRecurringPayment).toHaveBeenCalledTimes(2);
    expect(
      customerBalanceRecalculatorService.recalculateAndPersist,
    ).toHaveBeenCalledTimes(1);
    expect(
      customerBalanceRecalculatorService.recalculateAndPersist,
    ).toHaveBeenCalledWith(secondRecurringPayment.customerId, {
      locationSlug: location.slug,
      updatedByUserId: 727,
    });
    expect(result).toMatchObject({
      recurringPaymentsMatched: 2,
      recurringPaymentsFailed: 1,
      paymentsCreated: 1,
      lessonPaymentsCreated: 1,
      lessonsPaid: 1,
    });
  });
});
