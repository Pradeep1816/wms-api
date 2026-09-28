import { BadRequestException } from '@nestjs/common';
import { InvoiceAllExpiredLessonsCronService } from './invoice-all-expired-lessons-cron.service';

describe('InvoiceAllExpiredLessonsCronService', () => {
  const location = { id: 10, name: 'Main', slug: 'main' };

  let repository: {
    getCronEnabledLocations: ReturnType<typeof vi.fn>;
    getExpiredPrivateLessonIds: ReturnType<typeof vi.fn>;
  };
  let privateLessonInvoiceService: {
    generateInvoicesForLessons: ReturnType<typeof vi.fn>;
  };
  let cronLockService: {
    runWithLock: ReturnType<typeof vi.fn>;
  };
  let service: InvoiceAllExpiredLessonsCronService;

  beforeEach(() => {
    repository = {
      getCronEnabledLocations: vi.fn().mockResolvedValue([location]),
      getExpiredPrivateLessonIds: vi.fn().mockResolvedValue([]),
    };
    privateLessonInvoiceService = {
      generateInvoicesForLessons: vi.fn(),
    };
    cronLockService = {
      runWithLock: vi.fn((_lockName, _jobName, _logger, run) => run()),
    };

    service = new InvoiceAllExpiredLessonsCronService(
      repository as any,
      privateLessonInvoiceService as any,
      cronLockService as any,
    );
  });

  it('skips already-invoiced expired private lessons and continues processing remaining lessons', async () => {
    repository.getExpiredPrivateLessonIds.mockResolvedValue([101, 102]);

    privateLessonInvoiceService.generateInvoicesForLessons
      .mockRejectedValueOnce(new BadRequestException("Lesson's already invoiced"))
      .mockResolvedValueOnce({ status: true, invoiceId: 5001 });

    const result = await service.runManually(77);

    expect(privateLessonInvoiceService.generateInvoicesForLessons).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      triggeredBy: 'manual',
      triggeredByUserId: 77,
      locationsProcessed: 1,
      expiredLessonsMatched: 2,
      expiredInvoicesCreated: 1,
      expiredInvoicesAlreadyExisting: 1,
    });
  });

  it('logs non-legacy private lesson errors and completes the run', async () => {
    repository.getExpiredPrivateLessonIds.mockResolvedValue([201]);

    privateLessonInvoiceService.generateInvoicesForLessons.mockRejectedValueOnce(
      new BadRequestException('Unexpected validation error'),
    );

    const result = await service.runManually(77);

    expect(result).toMatchObject({
      triggeredBy: 'manual',
      triggeredByUserId: 77,
      locationsProcessed: 1,
      expiredLessonsMatched: 1,
      expiredInvoicesCreated: 0,
      expiredInvoicesAlreadyExisting: 0,
    });
  });
});
