import { InvoiceEquipmentRentalsCronService } from './invoice-equipment-rentals-cron.service';

describe('InvoiceEquipmentRentalsCronService', () => {
  const location = { id: 10, name: 'Main', slug: 'main' };

  let repository: {
    getCronEnabledLocations: ReturnType<typeof vi.fn>;
    getEquipmentRentalsForCron: ReturnType<typeof vi.fn>;
    getFirstRentalInvoiceDate: ReturnType<typeof vi.fn>;
    hasRentalInvoiceOnDate: ReturnType<typeof vi.fn>;
    createOngoingRentalInvoice: ReturnType<typeof vi.fn>;
    hasAnyRentalInvoice: ReturnType<typeof vi.fn>;
    createFixedTermRentalInvoice: ReturnType<typeof vi.fn>;
  };
  let customerBalanceRecalculatorService: {
    recalculateAndPersist: ReturnType<typeof vi.fn>;
  };
  let cronLockService: {
    runWithLock: ReturnType<typeof vi.fn>;
  };
  let service: InvoiceEquipmentRentalsCronService;

  beforeEach(() => {
    repository = {
      getCronEnabledLocations: vi.fn().mockResolvedValue([location]),
      getEquipmentRentalsForCron: vi.fn().mockResolvedValue([]),
      getFirstRentalInvoiceDate: vi.fn().mockResolvedValue(null),
      hasRentalInvoiceOnDate: vi.fn().mockResolvedValue(false),
      createOngoingRentalInvoice: vi
        .fn()
        .mockResolvedValue({
          invoiceId: 5001,
          botUserId: 727,
          lineItemsCreated: 2,
        }),
      hasAnyRentalInvoice: vi.fn().mockResolvedValue(false),
      createFixedTermRentalInvoice: vi
        .fn()
        .mockResolvedValue({
          invoiceId: 6001,
          botUserId: 727,
          lineItemsCreated: 3,
        }),
    };
    customerBalanceRecalculatorService = {
      recalculateAndPersist: vi.fn().mockResolvedValue(undefined),
    };
    cronLockService = {
      runWithLock: vi.fn((_lockName, _jobName, _logger, run) => run()),
    };

    service = new InvoiceEquipmentRentalsCronService(
      repository as any,
      customerBalanceRecalculatorService as any,
      cronLockService as any,
    );
  });

  it('creates an invoice for a first ongoing rental and recalculates the customer balance', async () => {
    repository.getEquipmentRentalsForCron.mockResolvedValue([
      {
        id: 101,
        customerId: 88,
        studentId: 55,
        startDate: new Date('2026-05-05T00:00:00.000Z'),
        returnDate: null,
        endDate: null,
        duration: 1,
        isOnGoing: true,
        hst: 13,
        createdOn: new Date('2026-05-01T00:00:00.000Z'),
      },
    ]);
    vi.spyOn(service as any, 'getCurrentEasternYmd').mockReturnValue(
      '2026-05-20',
    );

    const result = await service.runManually(77);

    expect(repository.createOngoingRentalInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ id: 101 }),
      '2026-05-05',
      true,
    );
    expect(
      customerBalanceRecalculatorService.recalculateAndPersist,
    ).toHaveBeenCalledWith(88, { updatedByUserId: 727 });
    expect(result).toMatchObject({
      triggeredBy: 'manual',
      triggeredByUserId: 77,
      cronEnabledLocationsFound: 1,
      rentalsScanned: 1,
      ongoingRentalsMatched: 1,
      ongoingInvoicesCreated: 1,
      fixedRentalsMatched: 0,
      fixedInvoicesCreated: 0,
      lineItemsCreated: 2,
    });
  });

  it('does not create a duplicate invoice for an ongoing rental when the billing date already exists', async () => {
    repository.getEquipmentRentalsForCron.mockResolvedValue([
      {
        id: 102,
        customerId: 89,
        studentId: 56,
        startDate: new Date('2026-05-05T00:00:00.000Z'),
        returnDate: null,
        endDate: null,
        duration: 1,
        isOnGoing: true,
        hst: 13,
        createdOn: new Date('2026-05-01T00:00:00.000Z'),
      },
    ]);
    repository.hasRentalInvoiceOnDate.mockResolvedValue(true);
    vi.spyOn(service as any, 'getCurrentEasternYmd').mockReturnValue(
      '2026-05-20',
    );

    const result = await service.runManually(77);

    expect(repository.createOngoingRentalInvoice).not.toHaveBeenCalled();
    expect(
      customerBalanceRecalculatorService.recalculateAndPersist,
    ).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      rentalsScanned: 1,
      ongoingRentalsMatched: 1,
      ongoingInvoicesCreated: 0,
      lineItemsCreated: 0,
    });
  });

  it('does not create the next recurring ongoing invoice before the legacy mid-month gate', async () => {
    repository.getEquipmentRentalsForCron.mockResolvedValue([
      {
        id: 103,
        customerId: 90,
        studentId: 57,
        startDate: new Date('2026-05-05T00:00:00.000Z'),
        returnDate: null,
        endDate: null,
        duration: 1,
        isOnGoing: true,
        hst: 13,
        createdOn: new Date('2026-05-01T00:00:00.000Z'),
      },
    ]);
    repository.getFirstRentalInvoiceDate.mockResolvedValue(
      new Date('2026-05-05T00:00:00.000Z'),
    );
    vi.spyOn(service as any, 'getCurrentEasternYmd').mockReturnValue(
      '2026-06-10',
    );

    const result = await service.runManually(77);

    expect(repository.hasRentalInvoiceOnDate).not.toHaveBeenCalled();
    expect(repository.createOngoingRentalInvoice).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      rentalsScanned: 1,
      ongoingRentalsMatched: 0,
      ongoingInvoicesCreated: 0,
    });
  });

  it('creates the next recurring ongoing invoice on or after the legacy mid-month gate', async () => {
    repository.getEquipmentRentalsForCron.mockResolvedValue([
      {
        id: 104,
        customerId: 91,
        studentId: 58,
        startDate: new Date('2026-05-05T00:00:00.000Z'),
        returnDate: null,
        endDate: null,
        duration: 1,
        isOnGoing: true,
        hst: 13,
        createdOn: new Date('2026-05-01T00:00:00.000Z'),
      },
    ]);
    repository.getFirstRentalInvoiceDate.mockResolvedValue(
      new Date('2026-05-05T00:00:00.000Z'),
    );
    vi.spyOn(service as any, 'getCurrentEasternYmd').mockReturnValue(
      '2026-06-15',
    );

    const result = await service.runManually(77);

    expect(repository.hasRentalInvoiceOnDate).toHaveBeenCalledWith(
      104,
      '2026-07-01',
    );
    expect(repository.createOngoingRentalInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ id: 104 }),
      '2026-07-01',
      false,
    );
    expect(result).toMatchObject({
      rentalsScanned: 1,
      ongoingRentalsMatched: 1,
      ongoingInvoicesCreated: 1,
    });
  });

  it('creates a fixed-term rental invoice when billable and uninvoiced', async () => {
    repository.getEquipmentRentalsForCron.mockResolvedValue([
      {
        id: 105,
        customerId: 92,
        studentId: 59,
        startDate: new Date('2026-01-05T00:00:00.000Z'),
        returnDate: new Date('2026-03-31T00:00:00.000Z'),
        endDate: null,
        duration: 3,
        isOnGoing: false,
        hst: 39,
        createdOn: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    vi.spyOn(service as any, 'getCurrentEasternYmd').mockReturnValue(
      '2026-05-20',
    );

    const result = await service.runManually(77);

    expect(repository.createFixedTermRentalInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ id: 105 }),
      '2026-05-20',
    );
    expect(
      customerBalanceRecalculatorService.recalculateAndPersist,
    ).toHaveBeenCalledWith(92, { updatedByUserId: 727 });
    expect(result).toMatchObject({
      rentalsScanned: 1,
      fixedRentalsMatched: 1,
      fixedInvoicesCreated: 1,
      lineItemsCreated: 3,
    });
  });

  it('does not create a fixed-term invoice when one already exists', async () => {
    repository.getEquipmentRentalsForCron.mockResolvedValue([
      {
        id: 106,
        customerId: 93,
        studentId: 60,
        startDate: new Date('2026-01-05T00:00:00.000Z'),
        returnDate: new Date('2026-03-31T00:00:00.000Z'),
        endDate: null,
        duration: 3,
        isOnGoing: false,
        hst: 39,
        createdOn: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    repository.hasAnyRentalInvoice.mockResolvedValue(true);
    vi.spyOn(service as any, 'getCurrentEasternYmd').mockReturnValue(
      '2026-05-20',
    );

    const result = await service.runManually(77);

    expect(repository.createFixedTermRentalInvoice).not.toHaveBeenCalled();
    expect(
      customerBalanceRecalculatorService.recalculateAndPersist,
    ).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      rentalsScanned: 1,
      fixedRentalsMatched: 0,
      fixedInvoicesCreated: 0,
    });
  });

  it('does not create a fixed-term invoice when the legacy month-only comparison does not pass', async () => {
    repository.getEquipmentRentalsForCron.mockResolvedValue([
      {
        id: 107,
        customerId: 94,
        studentId: 61,
        startDate: new Date('2026-10-05T00:00:00.000Z'),
        returnDate: new Date('2027-01-31T00:00:00.000Z'),
        endDate: null,
        duration: 3,
        isOnGoing: false,
        hst: 39,
        createdOn: new Date('2026-10-01T00:00:00.000Z'),
      },
    ]);
    vi.spyOn(service as any, 'getCurrentEasternYmd').mockReturnValue(
      '2026-05-20',
    );

    const result = await service.runManually(77);

    expect(repository.createFixedTermRentalInvoice).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      rentalsScanned: 1,
      fixedRentalsMatched: 1,
      fixedInvoicesCreated: 0,
    });
  });

  it('does not create a new ongoing invoice for a returned rental', async () => {
    repository.getEquipmentRentalsForCron.mockResolvedValue([
      {
        id: 108,
        customerId: 95,
        studentId: 62,
        startDate: new Date('2026-05-05T00:00:00.000Z'),
        returnDate: new Date('2026-05-10T00:00:00.000Z'),
        endDate: null,
        duration: 1,
        isOnGoing: true,
        hst: 13,
        createdOn: new Date('2026-05-01T00:00:00.000Z'),
      },
    ]);
    vi.spyOn(service as any, 'getCurrentEasternYmd').mockReturnValue(
      '2026-05-20',
    );

    const result = await service.runManually(77);

    expect(repository.getFirstRentalInvoiceDate).not.toHaveBeenCalled();
    expect(repository.createOngoingRentalInvoice).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      rentalsScanned: 1,
      ongoingRentalsMatched: 0,
      ongoingInvoicesCreated: 0,
    });
  });

  it('logs rental failures and continues processing remaining rentals', async () => {
    repository.getEquipmentRentalsForCron.mockResolvedValue([
      {
        id: 109,
        customerId: 96,
        studentId: 63,
        startDate: new Date('2026-05-05T00:00:00.000Z'),
        returnDate: null,
        endDate: null,
        duration: 1,
        isOnGoing: true,
        hst: 13,
        createdOn: new Date('2026-05-01T00:00:00.000Z'),
      },
      {
        id: 110,
        customerId: 97,
        studentId: 64,
        startDate: new Date('2026-05-06T00:00:00.000Z'),
        returnDate: null,
        endDate: null,
        duration: 1,
        isOnGoing: true,
        hst: 13,
        createdOn: new Date('2026-05-01T00:00:00.000Z'),
      },
    ]);
    repository.getFirstRentalInvoiceDate
      .mockRejectedValueOnce(new Error('Rental lookup failed'))
      .mockResolvedValueOnce(null);
    vi.spyOn(service as any, 'getCurrentEasternYmd').mockReturnValue(
      '2026-05-20',
    );

    const result = await service.runManually(77);

    expect(repository.createOngoingRentalInvoice).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      rentalsScanned: 2,
      rentalsFailed: 1,
      ongoingRentalsMatched: 1,
      ongoingInvoicesCreated: 1,
    });
  });
});
