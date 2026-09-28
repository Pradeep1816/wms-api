import { EmailAutoEmailCronRepository } from './email-auto-email-cron.repository';

describe('EmailAutoEmailCronRepository', () => {
  let repository: EmailAutoEmailCronRepository;
  let groupLessonQueryBuilder: any;
  let groupLessonRepository: any;
  let locationRepository: any;
  let customerNotificationQueryBuilder: any;
  let customerEmailNotificationRepository: any;

  beforeEach(() => {
    groupLessonQueryBuilder = {
      createQueryBuilder: vi.fn(),
      innerJoin: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      getRawMany: vi.fn().mockResolvedValue([]),
    };

    groupLessonRepository = {
      createQueryBuilder: vi.fn().mockReturnValue(groupLessonQueryBuilder),
    };

    locationRepository = {
      find: vi.fn().mockResolvedValue([]),
    };

    customerNotificationQueryBuilder = {
      innerJoin: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      getRawMany: vi.fn().mockResolvedValue([]),
    };

    customerEmailNotificationRepository = {
      createQueryBuilder: vi.fn().mockReturnValue(customerNotificationQueryBuilder),
    };

    repository = new EmailAutoEmailCronRepository(
      locationRepository,
      customerEmailNotificationRepository,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      groupLessonRepository,
      {} as any,
      {} as any,
    );
  });

  it('loads all active locations for the auto-email cron', async () => {
    await repository.getActiveLocations();

    expect(locationRepository.find).toHaveBeenCalledWith({
      where: { isDeleted: false },
      order: { id: 'ASC' },
      select: ['id', 'email', 'name'],
    });
  });

  it('loads checked customer ids for all locations', async () => {
    await repository.getCheckedCustomerIds();

    expect(customerEmailNotificationRepository.createQueryBuilder).toHaveBeenCalledWith(
      'notification',
    );
    expect(customerNotificationQueryBuilder.innerJoin).not.toHaveBeenCalled();
    expect(customerNotificationQueryBuilder.andWhere).not.toHaveBeenCalled();
  });

  it('excludes deleted enrolments from overdue group email candidates', async () => {
    await repository.getGroupOverdueRowsForLesson(8101, 501);

    expect(groupLessonRepository.createQueryBuilder).toHaveBeenCalledWith('groupLesson');
    expect(groupLessonQueryBuilder.andWhere).toHaveBeenCalledWith(
      'enrolment.isDeleted = :enrolmentIsDeleted',
      { enrolmentIsDeleted: false },
    );
  });
});
