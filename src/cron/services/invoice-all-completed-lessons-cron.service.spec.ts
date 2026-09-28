import { BadRequestException } from '@nestjs/common';
import { InvoiceAllCompletedLessonsCronService } from './invoice-all-completed-lessons-cron.service';

describe('InvoiceAllCompletedLessonsCronService', () => {
  const location = { id: 10, name: 'Main', slug: 'main' };

  let repository: {
    getCronEnabledLocations: ReturnType<typeof vi.fn>;
    getCompletedGroupLessonIds: ReturnType<typeof vi.fn>;
    getCompletedUninvoicedPrivateLessons: ReturnType<typeof vi.fn>;
  };
  let privateLessonInvoiceService: {
    generateInvoicesForLessons: ReturnType<typeof vi.fn>;
  };
  let groupLessonInvoiceService: {
    createGroupLessonInvoice: ReturnType<typeof vi.fn>;
  };
  let cronLockService: {
    runWithLock: ReturnType<typeof vi.fn>;
  };
  let service: InvoiceAllCompletedLessonsCronService;

  beforeEach(() => {
    repository = {
      getCronEnabledLocations: vi.fn().mockResolvedValue([location]),
      getCompletedGroupLessonIds: vi.fn().mockResolvedValue([]),
      getCompletedUninvoicedPrivateLessons: vi.fn().mockResolvedValue([]),
    };
    privateLessonInvoiceService = {
      generateInvoicesForLessons: vi.fn(),
    };
    groupLessonInvoiceService = {
      createGroupLessonInvoice: vi.fn(),
    };
    cronLockService = {
      runWithLock: vi.fn((_lockName, _jobName, _logger, run) => run()),
    };

    service = new InvoiceAllCompletedLessonsCronService(
      repository as any,
      privateLessonInvoiceService as any,
      groupLessonInvoiceService as any,
      cronLockService as any,
    );
  });

  it('skips already-invoiced private lessons and continues processing remaining lessons', async () => {
    repository.getCompletedUninvoicedPrivateLessons.mockResolvedValue([
      { id: 101, programRate: 90 },
      { id: 102, programRate: 120 },
    ]);

    privateLessonInvoiceService.generateInvoicesForLessons
      .mockRejectedValueOnce(new BadRequestException("Lesson's already invoiced"))
      .mockResolvedValueOnce({ status: true, invoiceId: 5001 });

    const result = await service.runManually(77);

    expect(privateLessonInvoiceService.generateInvoicesForLessons).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      triggeredBy: 'manual',
      triggeredByUserId: 77,
      locationsProcessed: 1,
      privateLessonsProcessed: 1,
      privateInvoicesCreated: 1,
      privateLessonsSkippedZeroRate: 0,
      privateLessonsFailed: 0,
      groupLessonsProcessed: 0,
      groupLessonsFailed: 0,
    });
  });

  it('logs non-legacy private lesson errors and continues processing remaining lessons', async () => {
    repository.getCompletedUninvoicedPrivateLessons.mockResolvedValue([
      { id: 201, programRate: 100 },
      { id: 202, programRate: 100 },
    ]);

    privateLessonInvoiceService.generateInvoicesForLessons
      .mockRejectedValueOnce(new BadRequestException('Unexpected validation error'))
      .mockResolvedValueOnce({ status: true, invoiceId: 5002 });

    const result = await service.runManually(77);

    expect(privateLessonInvoiceService.generateInvoicesForLessons).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      locationsProcessed: 1,
      privateLessonsProcessed: 1,
      privateInvoicesCreated: 1,
      privateLessonsFailed: 1,
    });
  });

  it('logs group lesson errors and continues processing remaining group lessons', async () => {
    repository.getCompletedGroupLessonIds.mockResolvedValue([301, 302]);
    groupLessonInvoiceService.createGroupLessonInvoice
      .mockRejectedValueOnce(new Error('Bad group lesson'))
      .mockResolvedValueOnce({
        createdCount: 1,
        alreadyExistsCount: 0,
        totalEnrolments: 1,
      });

    const result = await service.runManually(77);

    expect(groupLessonInvoiceService.createGroupLessonInvoice).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      locationsProcessed: 1,
      groupLessonsProcessed: 1,
      groupInvoicesCreated: 1,
      groupLessonsFailed: 1,
    });
  });
});
