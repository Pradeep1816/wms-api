import { StudentStatusCronService } from './student-status-cron.service';

describe('StudentStatusCronService', () => {
  let repository: {
    getLocationsByCronEnabled: ReturnType<typeof vi.fn>;
    getActiveStudentIdsForLocation: ReturnType<typeof vi.fn>;
    getInactiveStudentIdsForLocation: ReturnType<typeof vi.fn>;
    updateStudentsStatus: ReturnType<typeof vi.fn>;
    getInactiveStatusValue: ReturnType<typeof vi.fn>;
    getActiveStatusValue: ReturnType<typeof vi.fn>;
  };
  let cronLockService: {
    runWithLock: ReturnType<typeof vi.fn>;
  };
  let service: StudentStatusCronService;

  beforeEach(() => {
    repository = {
      getLocationsByCronEnabled: vi.fn().mockResolvedValue([
        { id: 10, name: 'First' },
        { id: 11, name: 'Second' },
      ]),
      getActiveStudentIdsForLocation: vi
        .fn()
        .mockRejectedValueOnce(new Error('Student lookup failed'))
        .mockResolvedValueOnce([201])
        .mockResolvedValueOnce([202]),
      getInactiveStudentIdsForLocation: vi.fn().mockResolvedValue([301]),
      updateStudentsStatus: vi.fn().mockResolvedValue(undefined),
      getInactiveStatusValue: vi.fn().mockReturnValue(2),
      getActiveStatusValue: vi.fn().mockReturnValue(1),
    };
    cronLockService = {
      runWithLock: vi.fn((_lockName, _jobName, _logger, run) => run()),
    };

    service = new StudentStatusCronService(
      repository as any,
      cronLockService as any,
    );
  });

  it('logs location failures and continues processing remaining locations', async () => {
    const result = await service.runProductionManually(77);

    expect(repository.getActiveStudentIdsForLocation).toHaveBeenCalledTimes(3);
    expect(repository.updateStudentsStatus).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      target: 'production',
      triggeredBy: 'manual',
      triggeredByUserId: 77,
      locationsProcessed: 1,
      locationsFailed: 1,
      activeStudents: 1,
      inactiveStudents: 1,
      totalStudentsUpdated: 2,
    });
  });
});
