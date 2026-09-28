import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LessonDiscount } from '../entities/lesson-discount.entity';
import { LessonRepository } from './lesson.repository';

function queryBuilderReturning(result: unknown) {
  return {
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getOne: vi.fn().mockResolvedValue(result),
  };
}

function createCourseRepositoryMock() {
  return {
    createQueryBuilder: vi.fn(),
    create: vi.fn((payload: Record<string, unknown>) => payload),
    save: vi.fn((payload: Record<string, unknown>) =>
      Promise.resolve({ ...payload, id: 900 }),
    ),
  };
}

function createCourseExtraRepositoryMock() {
  return {
    find: vi.fn(),
    create: vi.fn((payload: Record<string, unknown>) => payload),
    save: vi.fn((payload: Record<string, unknown>) => Promise.resolve(payload)),
    update: vi.fn(() => Promise.resolve({ affected: 1 })),
  };
}

describe('LessonRepository extra-course linking', () => {
  let repository: LessonRepository;
  let courseRepository: ReturnType<typeof createCourseRepositoryMock>;
  let courseExtraRepository: ReturnType<typeof createCourseExtraRepositoryMock>;

  beforeEach(() => {
    courseRepository = createCourseRepositoryMock();
    courseExtraRepository = createCourseExtraRepositoryMock();

    repository = new LessonRepository(
      {} as never,
      {} as never,
      {} as never,
      courseRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      courseExtraRepository as never,
    );
  });

  it('repairs a missing link when reusing an existing extra course', async () => {
    const extraCourse = { id: 900 };
    const regularCourse = { id: 700 };
    const extraCourseQuery = queryBuilderReturning(extraCourse);
    const regularCourseQuery = queryBuilderReturning(regularCourse);
    courseRepository.createQueryBuilder
      .mockReturnValueOnce(extraCourseQuery)
      .mockReturnValueOnce(regularCourseQuery);
    courseExtraRepository.find.mockResolvedValue([]);

    const result = await repository.findOrCreateExtraCourse(
      10,
      20,
      30,
      40,
      new Date('2026-09-10T18:30:00.000Z'),
    );

    expect(result).toBe(extraCourse);
    expect(courseExtraRepository.create).toHaveBeenCalledWith({
      courseId: 700,
      extraCourseId: 900,
      isDeleted: false,
    });
    expect(courseExtraRepository.save).toHaveBeenCalledOnce();
    expect(courseRepository.save).not.toHaveBeenCalled();
    expect(extraCourseQuery.andWhere).toHaveBeenCalledWith(
      'course.locationId = :locationId',
      { locationId: 40 },
    );
    expect(regularCourseQuery.andWhere).toHaveBeenCalledWith(
      'course.locationId = :locationId',
      { locationId: 40 },
    );
  });

  it('creates the legacy link when creating a new extra course', async () => {
    courseRepository.createQueryBuilder
      .mockReturnValueOnce(queryBuilderReturning(null))
      .mockReturnValueOnce(queryBuilderReturning({ id: 700 }));
    courseExtraRepository.find.mockResolvedValue([]);

    const result = await repository.findOrCreateExtraCourse(
      10,
      20,
      30,
      40,
      new Date('2026-09-10T18:30:00.000Z'),
    );

    expect(result.id).toBe(900);
    expect(courseExtraRepository.save).toHaveBeenCalledWith({
      courseId: 700,
      extraCourseId: 900,
      isDeleted: false,
    });
  });

  it('does not create a duplicate when the extra course has an active link', async () => {
    courseRepository.createQueryBuilder
      .mockReturnValueOnce(queryBuilderReturning({ id: 900 }))
      .mockReturnValueOnce(queryBuilderReturning({ id: 700 }));
    courseExtraRepository.find.mockResolvedValue([
      { id: 5, courseId: 700, extraCourseId: 900, isDeleted: false },
    ]);

    await repository.findOrCreateExtraCourse(
      10,
      20,
      30,
      40,
      new Date('2026-09-10T18:30:00.000Z'),
    );

    expect(courseExtraRepository.create).not.toHaveBeenCalled();
    expect(courseExtraRepository.save).not.toHaveBeenCalled();
    expect(courseExtraRepository.update).not.toHaveBeenCalled();
  });

  it('reactivates the matching soft-deleted link', async () => {
    courseRepository.createQueryBuilder
      .mockReturnValueOnce(queryBuilderReturning({ id: 900 }))
      .mockReturnValueOnce(queryBuilderReturning({ id: 700 }));
    courseExtraRepository.find.mockResolvedValue([
      { id: 5, courseId: 700, extraCourseId: 900, isDeleted: true },
    ]);

    await repository.findOrCreateExtraCourse(
      10,
      20,
      30,
      40,
      new Date('2026-09-10T18:30:00.000Z'),
    );

    expect(courseExtraRepository.update).toHaveBeenCalledWith(
      { id: 5 },
      { isDeleted: false },
    );
    expect(courseExtraRepository.save).not.toHaveBeenCalled();
  });

  it('leaves the extra course standalone when the student has no regular course', async () => {
    const extraCourse = { id: 900 };
    courseRepository.createQueryBuilder
      .mockReturnValueOnce(queryBuilderReturning(extraCourse))
      .mockReturnValueOnce(queryBuilderReturning(null));

    const result = await repository.findOrCreateExtraCourse(
      10,
      20,
      30,
      40,
      new Date('2026-09-10T18:30:00.000Z'),
    );

    expect(result).toBe(extraCourse);
    expect(courseExtraRepository.find).not.toHaveBeenCalled();
    expect(courseExtraRepository.save).not.toHaveBeenCalled();
  });
});

describe('LessonRepository extra-lesson totals', () => {
  it('stores the private-lesson total after the payment-frequency reduction', async () => {
    const privateLessonRepository = {
      create: vi.fn((payload: Record<string, unknown>) => payload),
      save: vi.fn((payload: Record<string, unknown>) =>
        Promise.resolve({ ...payload, id: 99 }),
      ),
    };
    const repository = new LessonRepository(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      privateLessonRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await repository.createPrivateLessonRecord(
      9001,
      new Date('2026-09-21T17:15:00.000Z'),
      '00:30:00',
      72.5,
      0,
      1.09,
    );

    expect(privateLessonRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonId: 9001,
        total: 35.16,
        balance: 35.16,
      }),
    );
  });
});

describe('LessonRepository extra-lesson discount source', () => {
  it('uses discounts from the current pricing-tier effective period', async () => {
    const queryBuilder = {
      innerJoinAndSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      setParameters: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      addOrderBy: vi.fn().mockReturnThis(),
      getOne: vi.fn().mockResolvedValue({ id: 4573622 }),
    };
    const lessonRepository = {
      createQueryBuilder: vi.fn(() => queryBuilder),
    };
    const repository = new LessonRepository(
      lessonRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await repository.findRegularLessonWithEnrolmentDiscounts(
      15568,
      15378,
      new Date('2026-09-01T17:15:00.000Z'),
      '00:45:00',
      1,
    );

    expect(queryBuilder.innerJoinAndSelect).toHaveBeenCalledWith(
      'lesson.discounts',
      'discount',
      expect.any(String),
      expect.objectContaining({
        enrolmentId: 15568,
        discountTypes: expect.arrayContaining([
          LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
        ]),
      }),
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('enrolment_tier_change'),
      { pricingTier: 1 },
    );
  });
});

describe('LessonRepository extra-lesson enrolment selection', () => {
  it('prefers an explicitly tiered enrolment over a later-ending untiered enrolment', async () => {
    const queryBuilder = {
      leftJoinAndSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      addOrderBy: vi.fn().mockReturnThis(),
      getOne: vi.fn().mockResolvedValue({
        id: 30363,
        pricingTier: 1,
        courseId: 29988,
      }),
    };
    const enrolmentRepository = {
      createQueryBuilder: vi.fn(() => queryBuilder),
    };
    const repository = new LessonRepository(
      {} as never,
      {} as never,
      enrolmentRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await repository.findRegularEnrolmentForPricing(15537, 92, 9);

    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      expect.stringMatching(
        /enrolment\.pricingTier IS NOT NULL[\s\S]*enrolment\.keepsPreviousRate = TRUE/,
      ),
      'ASC',
    );
    expect(queryBuilder.addOrderBy).toHaveBeenNthCalledWith(
      1,
      'course.endDate',
      'DESC',
    );
    expect(queryBuilder.addOrderBy).toHaveBeenNthCalledWith(
      2,
      'enrolment.id',
      'DESC',
    );
  });
});

describe('LessonRepository changed-lesson pricing', () => {
  it('moves the balance by the total delta instead of replacing applied money', async () => {
    const lessonRepository = { update: vi.fn() };
    const privateLessonRepository = { query: vi.fn() };
    const repository = new LessonRepository(
      lessonRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      privateLessonRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await repository.updateChangedLessonPricing(301, 72.48, 18.12);

    expect(lessonRepository.update).toHaveBeenCalledWith(
      { id: 301 },
      { programRate: 72.48 },
    );
    expect(privateLessonRepository.query).toHaveBeenCalledWith(
      expect.stringMatching(/balance = ROUND\(balance \+ \? - total, 4\)/),
      [18.12, 18.12, 301],
    );
  });
});
