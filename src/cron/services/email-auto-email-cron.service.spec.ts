import { EmailAutoEmailCronService } from './email-auto-email-cron.service';

describe('EmailAutoEmailCronService', () => {
  const fixedNow = new Date('2026-05-23T14:00:00.000Z');
  const location = { id: 10, email: 'main@example.com', name: 'Main' };
  const defaultTemplate = {
    id: 2,
    subject: 'Lesson reminder',
    header: 'Header',
    footer: 'Footer',
  };
  const overdueTemplate = {
    id: 9,
    subject: 'Overdue reminder',
    header: 'Overdue Header',
    footer: 'Overdue Footer',
  };

  let originalNodeEnv: string | undefined;
  let repository: {
    getActiveLocations: ReturnType<typeof vi.fn>;
    getCheckedCustomerIds: ReturnType<typeof vi.fn>;
    getCheckedNotificationTypesForCustomer: ReturnType<typeof vi.fn>;
    getRecipientEmails: ReturnType<typeof vi.fn>;
    getPrivateFirstLessonIds: ReturnType<typeof vi.fn>;
    getGroupFirstLessonIds: ReturnType<typeof vi.fn>;
    getPrivateLessonsForNotification: ReturnType<typeof vi.fn>;
    markPrivateStatusesSent: ReturnType<typeof vi.fn>;
    getUpcomingGroupLessonsBase: ReturnType<typeof vi.fn>;
    getGroupOverdueRowsForLesson: ReturnType<typeof vi.fn>;
    markGroupStatusSent: ReturnType<typeof vi.fn>;
    getGroupLessonsForNotification: ReturnType<typeof vi.fn>;
    getPendingGroupStudentsForLesson: ReturnType<typeof vi.fn>;
    getEmailTemplateByType: ReturnType<typeof vi.fn>;
  };
  let mailerService: {
    sendEmail: ReturnType<typeof vi.fn>;
  };
  let cronLockService: {
    runWithLock: ReturnType<typeof vi.fn>;
  };
  let service: EmailAutoEmailCronService;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    repository = {
      getActiveLocations: vi.fn().mockResolvedValue([location]),
      getCheckedCustomerIds: vi.fn().mockResolvedValue([501]),
      getCheckedNotificationTypesForCustomer: vi.fn().mockResolvedValue([4]),
      getRecipientEmails: vi.fn().mockResolvedValue(['family@example.com']),
      getPrivateFirstLessonIds: vi.fn().mockResolvedValue([1001]),
      getGroupFirstLessonIds: vi.fn().mockResolvedValue([2001]),
      getPrivateLessonsForNotification: vi.fn().mockResolvedValue([]),
      markPrivateStatusesSent: vi.fn().mockResolvedValue(0),
      getUpcomingGroupLessonsBase: vi.fn().mockResolvedValue([]),
      getGroupOverdueRowsForLesson: vi.fn().mockResolvedValue([]),
      markGroupStatusSent: vi.fn().mockResolvedValue(0),
      getGroupLessonsForNotification: vi.fn().mockResolvedValue([]),
      getPendingGroupStudentsForLesson: vi.fn().mockResolvedValue([]),
      getEmailTemplateByType: vi
        .fn()
        .mockImplementation((emailTypeId: number) =>
          Promise.resolve(
            emailTypeId === 9 ? overdueTemplate : defaultTemplate,
          ),
        ),
    };

    mailerService = {
      sendEmail: vi.fn().mockResolvedValue(undefined),
    };
    cronLockService = {
      runWithLock: vi.fn((_lockName, _jobName, _logger, run) => run()),
    };

    service = new EmailAutoEmailCronService(
      repository as any,
      mailerService as any,
      cronLockService as any,
    );
    vi.spyOn(service as any, 'getCurrentEasternStoredDate').mockReturnValue(
      fixedNow,
    );
    vi.spyOn(service as any, 'delay').mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it('skips notification types when the customer has no recipient emails', async () => {
    repository.getCheckedNotificationTypesForCustomer.mockResolvedValue([1, 4]);
    repository.getRecipientEmails.mockResolvedValue([]);

    const result = await service.runManually(77);

    expect(repository.getPrivateFirstLessonIds).not.toHaveBeenCalled();
    expect(mailerService.sendEmail).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      triggeredBy: 'manual',
      triggeredByUserId: 77,
      locationsProcessed: 1,
      customersProcessed: 1,
      notificationTypesProcessed: 0,
      skippedNoRecipients: 2,
      privateEmailsSent: 0,
      groupEmailsSent: 0,
    });
  });

  it('sends private notifications and marks matching private statuses as sent', async () => {
    repository.getPrivateLessonsForNotification.mockResolvedValue([
      {
        lessonId: 7001,
        courseId: 3001,
        lessonDate: new Date('2026-05-24T10:00:00.000Z'),
        dueDate: new Date('2026-05-20T00:00:00.000Z'),
        courseName: 'Piano',
        teacherName: 'Taylor Teacher',
        studentName: 'Ava Student',
        privateTotal: 120,
        privateBalance: 0,
      },
    ]);
    repository.markPrivateStatusesSent.mockResolvedValue(1);

    const result = await service.runManually(88);

    expect(mailerService.sendEmail).toHaveBeenCalledTimes(1);
    expect(repository.markPrivateStatusesSent).toHaveBeenCalledWith([7001], 4);
    expect(repository.getGroupLessonsForNotification).toHaveBeenCalledWith(
      501,
      10,
      fixedNow,
      new Date('2026-05-24T14:00:00.000Z'),
      4,
      [2001],
    );
    expect(result).toMatchObject({
      triggeredBy: 'manual',
      triggeredByUserId: 88,
      locationsProcessed: 1,
      customersProcessed: 1,
      notificationTypesProcessed: 1,
      privateEmailsSent: 1,
      privateStatusUpdates: 1,
      groupEmailsSent: 0,
      groupStatusUpdates: 0,
      sendFailures: 0,
    });
  });

  it('renders lesson template header as HTML instead of escaped text', async () => {
    defaultTemplate.header = '<p>Please find the lesson below test</p>';
    repository.getPrivateLessonsForNotification.mockResolvedValue([
      {
        lessonId: 7001,
        courseId: 3001,
        lessonDate: new Date('2026-05-24T10:00:00.000Z'),
        dueDate: new Date('2026-05-20T00:00:00.000Z'),
        courseName: 'Piano',
        teacherName: 'Taylor Teacher',
        studentName: 'Ava Student',
        privateTotal: 120,
        privateBalance: 0,
      },
    ]);
    repository.markPrivateStatusesSent.mockResolvedValue(1);

    await service.runManually(101);

    const sentEmail = mailerService.sendEmail.mock.calls[0]?.[0];
    expect(sentEmail.html).toContain(
      '<p>Please find the lesson below test</p>',
    );
    expect(sentEmail.html).not.toContain(
      '&lt;p&gt;Please find the lesson below test&lt;/p&gt;',
    );
  });

  it('sends group overdue notifications and marks the matching student status as sent', async () => {
    repository.getCheckedNotificationTypesForCustomer.mockResolvedValue([3]);
    repository.getPrivateLessonsForNotification.mockResolvedValue([]);
    repository.getUpcomingGroupLessonsBase.mockResolvedValue([
      {
        lessonId: 8101,
        courseId: 4101,
        lessonDate: new Date('2026-05-24T11:00:00.000Z'),
        dueDate: new Date('2026-05-22T00:00:00.000Z'),
        courseName: 'Violin Group',
        teacherName: 'Robin Teacher',
        studentName: null,
        privateTotal: null,
        privateBalance: null,
      },
    ]);
    repository.getGroupOverdueRowsForLesson.mockResolvedValue([
      {
        lessonId: 8101,
        enrolmentId: 9101,
        studentId: 9201,
        lessonDate: new Date('2026-05-24T11:00:00.000Z'),
        courseName: 'Violin Group',
        teacherName: 'Robin Teacher',
        studentName: 'Mia Student',
        total: 80,
        balance: 15,
      },
    ]);
    repository.markGroupStatusSent.mockResolvedValue(1);

    const result = await service.runManually(99);

    expect(mailerService.sendEmail).toHaveBeenCalledTimes(1);
    expect(repository.getGroupLessonsForNotification).not.toHaveBeenCalled();
    expect(repository.markGroupStatusSent).toHaveBeenCalledWith(8101, 9201, 3);
    expect(result).toMatchObject({
      triggeredBy: 'manual',
      triggeredByUserId: 99,
      locationsProcessed: 1,
      customersProcessed: 1,
      notificationTypesProcessed: 1,
      privateEmailsSent: 0,
      groupEmailsSent: 1,
      privateStatusUpdates: 0,
      groupStatusUpdates: 1,
      sendFailures: 0,
    });
  });

  it('runs through the shared cron lock', async () => {
    await service.runScheduled();

    expect(cronLockService.runWithLock).toHaveBeenCalledWith(
      'cron:email-auto-email',
      'email-auto-email',
      expect.anything(),
      expect.any(Function),
    );
  });

  it('logs notification processing failures and continues processing remaining customers', async () => {
    repository.getCheckedCustomerIds.mockResolvedValue([501, 502]);
    repository.getPrivateLessonsForNotification
      .mockRejectedValueOnce(new Error('Lesson lookup failed'))
      .mockResolvedValueOnce([]);

    const result = await service.runManually(77);

    expect(repository.getPrivateLessonsForNotification).toHaveBeenCalledTimes(
      2,
    );
    expect(result).toMatchObject({
      customersProcessed: 2,
      notificationTypesProcessed: 2,
      processingFailures: 1,
      sendFailures: 0,
    });
  });
});
