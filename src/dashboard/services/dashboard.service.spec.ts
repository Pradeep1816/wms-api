import { DashboardService } from './dashboard.service';

describe('DashboardService monthly revenue', () => {
  const locationId = 8;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-26T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createService(
    overrides: {
      invoiceMonthlyRevenueRepository?: Record<string, unknown>;
      royaltyReportRepository?: Record<string, unknown>;
      enrolmentParkedRepository?: Record<string, unknown>;
      cacheService?: Record<string, unknown>;
    } = {},
  ) {
    const invoiceMonthlyRevenueRepository = {
      getMonthlyRevenue: vi.fn().mockResolvedValue([]),
      ...overrides.invoiceMonthlyRevenueRepository,
    };
    const royaltyReportRepository = {
      getEligiblePayments: vi.fn().mockResolvedValue(0),
      ...overrides.royaltyReportRepository,
    };
    const enrolmentParkedRepository = {
      getParked: vi.fn().mockResolvedValue([]),
      ...overrides.enrolmentParkedRepository,
    };
    const cacheService = {
      remember: vi
        .fn()
        .mockImplementation((_key: string, factory: () => Promise<unknown>) =>
          factory(),
        ),
      ...overrides.cacheService,
    };

    const service = new DashboardService(
      {} as never,
      {} as never,
      enrolmentParkedRepository as never,
      {} as never,
      invoiceMonthlyRevenueRepository as never,
      royaltyReportRepository as never,
      cacheService as never,
    );

    return {
      service,
      invoiceMonthlyRevenueRepository,
      enrolmentParkedRepository,
      royaltyReportRepository,
      cacheService,
    };
  }

  it('returns used and collected series for the last six months', async () => {
    const {
      service,
      invoiceMonthlyRevenueRepository,
      royaltyReportRepository,
    } = createService({
      invoiceMonthlyRevenueRepository: {
        getMonthlyRevenue: vi.fn().mockResolvedValue([
          { year: 2026, month: 3, revenue: '61234.8' },
          { year: 2026, month: 4, revenue: '59000' },
        ]),
      },
      royaltyReportRepository: {
        getEligiblePayments: vi.fn().mockImplementation(
          async (_id: number, start: string) =>
            start.startsWith('2026-08') ? 2409.67 : 1000,
        ),
      },
    });

    const result = await service.getMonthlyRevenue(locationId);

    expect(result.values).toHaveLength(6);
    expect(result.values.map((row) => row.x)).toEqual([
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
    ]);

    expect(result.values.find((row) => row.x === 'Mar')).toMatchObject({
      y: 61234,
      revenueUsed: 61234,
      revenueCollected: 1000,
    });
    expect(result.values.find((row) => row.x === 'Aug')).toMatchObject({
      y: 0,
      revenueUsed: 0,
      revenueCollected: 2409.67,
    });

    expect(
      royaltyReportRepository.getEligiblePayments,
    ).toHaveBeenCalledTimes(6);
    expect(
      invoiceMonthlyRevenueRepository.getMonthlyRevenue,
    ).toHaveBeenCalledWith(locationId, '2026-03-01', '2026-08-31');
  });

  it('keeps other months when one collected-revenue month fails', async () => {
    const { service, royaltyReportRepository } = createService({
      invoiceMonthlyRevenueRepository: {
        getMonthlyRevenue: vi.fn().mockResolvedValue([]),
      },
      royaltyReportRepository: {
        getEligiblePayments: vi
          .fn()
          .mockImplementation(async (_id: number, start: string) => {
            if (start.startsWith('2026-05')) {
              throw new Error('query timeout');
            }
            return 1000;
          }),
      },
    });

    const result = await service.getMonthlyRevenue(locationId);

    expect(result.values.find((row) => row.x === 'Mar')).toMatchObject({
      revenueCollected: 1000,
    });
    expect(result.values.find((row) => row.x === 'May')).toMatchObject({
      revenueCollected: 0,
    });
    expect(
      royaltyReportRepository.getEligiblePayments,
    ).toHaveBeenCalledTimes(6);
  });

  it('still returns used revenue when collected revenue lookup fails', async () => {
    const { service } = createService({
      invoiceMonthlyRevenueRepository: {
        getMonthlyRevenue: vi
          .fn()
          .mockResolvedValue([{ year: 2026, month: 5, revenue: '80' }]),
      },
      royaltyReportRepository: {
        getEligiblePayments: vi.fn().mockRejectedValue(new Error('timeout')),
      },
    });

    const result = await service.getMonthlyRevenue(locationId);
    expect(result.values.find((row) => row.x === 'May')).toMatchObject({
      y: 80,
      revenueUsed: 80,
      revenueCollected: 0,
    });
  });

  it('aggregates parked enrolments by program without using lesson credits', async () => {
    const { service, enrolmentParkedRepository } = createService({
      enrolmentParkedRepository: {
        getParked: vi.fn().mockResolvedValue([
          { name: 'Guitar Core', count: '7' },
          { name: 'Piano Core', count: '5' },
        ]),
      },
    });

    const result = await service.getParkedEnrolments(8, {
      fromDate: '2026-08-01',
      toDate: '2026-08-31',
    });

    expect(result.total).toBe(12);
    expect(result.values).toEqual([
      { name: 'Guitar Core', count: 7 },
      { name: 'Piano Core', count: 5 },
    ]);
    expect(enrolmentParkedRepository.getParked).toHaveBeenCalledWith(
      8,
      '2026-08-01',
      '2026-08-31',
      '2026-08-26',
    );
    expect(result.values.reduce((sum, row) => sum + row.count, 0)).toBe(
      result.total,
    );
  });
});
