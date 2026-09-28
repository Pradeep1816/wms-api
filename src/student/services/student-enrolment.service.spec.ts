import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StudentEnrolmentService } from './student-enrolment.service';
import { CreateStudentEnrolmentDto } from '../dto/create-student-enrolment.dto';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { EnrolmentDiscount } from '../../enrolment/entities/enrolment-discount.entity';
import { CourseRateResolverService } from '../../pricing/services/course-rate-resolver.service';

function createQueryBuilderMock() {
  return {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getMany: vi.fn().mockResolvedValue([]),
  };
}

function createRepositoryMock() {
  return {
    findOne: vi.fn(),
    create: vi.fn((payload) => payload),
    save: vi.fn(async (payload) => payload),
    update: vi.fn(),
    createQueryBuilder: vi.fn(() => createQueryBuilderMock()),
  };
}

function createDto(overrides: Record<string, unknown> = {}) {
  return {
    programId: 8,
    teacherId: 14,
    paymentFrequency: 'Monthly',
    startDate: '2026-04-07',
    startTime: '15:00',
    lessonsCount: 1,
    isOnline: false,
    day: 'Tuesday',
    duration: '00:45',
    autoRenew: false,
    programRate: 130,
    paymentCycleEffectiveDate: '2026-04-01',
    multipleEnrolDiscount: 25,
    paymentFrequencyDiscount: 10,
    discountedRatePerMonth: 120,
    ...overrides,
  };
}

describe('StudentEnrolmentService', () => {
  let service: StudentEnrolmentService;

  let studentRepository: {
    findStudentByIdAndLocation: ReturnType<typeof vi.fn>;
  };
  let enrolmentStudentRepository: Record<string, never>;
  let studentEnrolmentTransformationService: {
    transformEnrolmentToDto: ReturnType<typeof vi.fn>;
  };
  let courseRepository: ReturnType<typeof createRepositoryMock>;
  let courseScheduleRepository: ReturnType<typeof createRepositoryMock>;
  let enrolmentRepository: ReturnType<typeof createRepositoryMock>;
  let paymentFrequencyRepository: ReturnType<typeof createRepositoryMock>;
  let enrolmentPaymentFrequencyRepository: ReturnType<
    typeof createRepositoryMock
  >;
  let courseProgramRateRepository: ReturnType<typeof createRepositoryMock>;
  let enrolmentDiscountRepository: ReturnType<typeof createRepositoryMock>;
  let lessonRepository: ReturnType<typeof createRepositoryMock>;
  let holidayRepository: ReturnType<typeof createRepositoryMock>;
  let lessonRepo: { getTeacherRate: ReturnType<typeof vi.fn> };
  let programRepository: ReturnType<typeof createRepositoryMock>;
  let pricingResolver: { resolve: ReturnType<typeof vi.fn> };
  let programPresentation: {
    isClassified: ReturnType<typeof vi.fn>;
    isTierable: ReturnType<typeof vi.fn>;
    pricingCategoryFor: ReturnType<typeof vi.fn>;
  };
  let courseRateResolver: CourseRateResolverService;
  let enrolmentTier: {
    change: ReturnType<typeof vi.fn>;
    assign: ReturnType<typeof vi.fn>;
  };
  let rollout: { isEnabledForLocation: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    studentRepository = {
      findStudentByIdAndLocation: vi.fn(),
    };
    enrolmentStudentRepository = {};
    studentEnrolmentTransformationService = {
      transformEnrolmentToDto: vi.fn(),
    };
    courseRepository = createRepositoryMock();
    courseScheduleRepository = createRepositoryMock();
    enrolmentRepository = createRepositoryMock();
    paymentFrequencyRepository = createRepositoryMock();
    enrolmentPaymentFrequencyRepository = createRepositoryMock();
    courseProgramRateRepository = createRepositoryMock();
    enrolmentDiscountRepository = createRepositoryMock();
    lessonRepository = createRepositoryMock();
    holidayRepository = createRepositoryMock();
    lessonRepo = {
      getTeacherRate: vi.fn(),
    };

    // The catalogue answers nothing by default, so every expectation written
    // before the September pricing work still describes today's behaviour.
    programRepository = createRepositoryMock();
    programRepository.findOne.mockResolvedValue(null);
    pricingResolver = { resolve: vi.fn() };
    programPresentation = {
      isClassified: vi.fn().mockReturnValue(false),
      // Mirrors `isClassified` by default, which is the real behaviour for
      // every program that does not carry a marker prefix. The marker cases
      // override it explicitly, so a test that cares says so. The cast is only
      // because `isClassified` is declared as a bare `vi.fn()` above, which
      // TypeScript will not let us call directly.
      isTierable: vi.fn((program: unknown) =>
        (programPresentation.isClassified as unknown as (p: unknown) => boolean)(
          program,
        ),
      ),
      pricingCategoryFor: vi.fn(),
    };
    courseRateResolver = new CourseRateResolverService();
    enrolmentTier = { change: vi.fn(), assign: vi.fn() };
    // Enabled by default so existing expectations are unchanged; the rollout
    // tests below turn it off explicitly.
    rollout = { isEnabledForLocation: vi.fn().mockResolvedValue(true) };

    service = new StudentEnrolmentService(
      studentRepository as any,
      enrolmentStudentRepository as any,
      studentEnrolmentTransformationService as any,
      courseRepository as any,
      courseScheduleRepository as any,
      enrolmentRepository as any,
      paymentFrequencyRepository as any,
      enrolmentPaymentFrequencyRepository as any,
      courseProgramRateRepository as any,
      enrolmentDiscountRepository as any,
      lessonRepository as any,
      holidayRepository as any,
      lessonRepo as any,
      programRepository as any,
      pricingResolver as any,
      programPresentation as any,
      courseRateResolver,
      enrolmentTier as any,
      rollout as any,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('throws NotFoundException when student does not exist in location', async () => {
    studentRepository.findStudentByIdAndLocation.mockResolvedValue(null);

    await expect(
      service.createEnrolment(3, 'test-location', 99, createDto() as any, 7001),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException for invalid payment frequency name', async () => {
    studentRepository.findStudentByIdAndLocation.mockResolvedValue({ id: 99 });
    paymentFrequencyRepository.findOne.mockResolvedValue(null);

    await expect(
      service.createEnrolment(3, 'test-location', 99, createDto() as any, 7001),
    ).rejects.toThrow(
      new BadRequestException('Invalid payment frequency: Monthly'),
    );
  });

  it('creates enrolment discounts and scheduled lesson with legacy mappings', async () => {
    const dto = createDto();
    const responseDto = { id: 200, studentId: 99 };

    studentRepository.findStudentByIdAndLocation.mockResolvedValue({ id: 99 });
    paymentFrequencyRepository.findOne.mockResolvedValue({
      id: 3,
      name: 'Monthly',
    });
    lessonRepo.getTeacherRate.mockResolvedValue(55);

    courseRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 100,
    }));
    enrolmentRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 200,
    }));

    let lessonId = 1000;
    lessonRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: lessonId++,
    }));

    enrolmentRepository.findOne.mockResolvedValue({
      id: 200,
      course: { id: 100 },
    });
    studentEnrolmentTransformationService.transformEnrolmentToDto.mockReturnValue(
      responseDto,
    );

    const result = await service.createEnrolment(
      3,
      'test-location',
      99,
      dto,
      7001,
    );

    expect(result).toEqual(responseDto);

    expect(enrolmentDiscountRepository.save).toHaveBeenCalledTimes(2);
    const savedDiscounts = enrolmentDiscountRepository.save.mock.calls.map(
      (call) => call[0],
    );
    // Corrected 2026-08-11. This previously asserted the opposite and so pinned
    // a live defect in place: a multiple-enrolment discount is a monthly dollar
    // amount, because the screen divides it by four to get a per-lesson figure,
    // and a payment-frequency discount is a percentage, because the screen
    // multiplies by it over 100. The values written since 2026-04-09 were
    // inverted against both the screen and eight years of existing rows.
    expect(savedDiscounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          enrolmentId: 200,
          discount: 25,
          discountType: EnrolmentDiscount.VALUE_TYPE_DOLLAR,
          type: EnrolmentDiscount.TYPE_MULTIPLE_ENROLMENT,
        }),
        expect.objectContaining({
          enrolmentId: 200,
          discount: 10,
          discountType: EnrolmentDiscount.VALUE_TYPE_PERCENTAGE,
          type: EnrolmentDiscount.TYPE_PAYMENT_FREQUENCY,
        }),
      ]),
    );

    // Named constants, not literals: dollar is 1 on an enrolment discount and 0
    // on a lesson discount, and that inversion is what made this easy to get
    // backwards in the first place.
    expect(EnrolmentDiscount.VALUE_TYPE_DOLLAR).toBe(1);
    expect(EnrolmentDiscount.VALUE_TYPE_PERCENTAGE).toBe(0);

    expect(lessonRepository.create).toHaveBeenCalledTimes(1);
    const createdLesson = lessonRepository.create.mock.calls[0][0];
    expect(createdLesson.status).toBe(LessonStatusEnum.SCHEDULED);
    expect(createdLesson.teacherRate).toBe(55);
    expect(createdLesson.dueDate).toBeInstanceOf(Date);
    expect(createdLesson.dueDate.getUTCHours()).toBe(0);
    expect(createdLesson.dueDate.getUTCMinutes()).toBe(0);
  });

  describe('lessons that run past the estimated course end', () => {
    // The course end is start plus lessonsCount weeks rounded to the month end,
    // but the lesson loop skips holidays and professional-development days by
    // adding another week each time, so the real last lesson lands later. Found
    // 2026-08-12 driving the wizard: a 96-lesson enrolment ended its rate period
    // on 2028-07-30 while lessons ran to 2028-08-26, and the last four priced at
    // the program's flat rate because no period covered them.
    it('stretches the final rate period to the last lesson', async () => {
      studentRepository.findStudentByIdAndLocation.mockResolvedValue({
        id: 99,
      });
      paymentFrequencyRepository.findOne.mockResolvedValue({
        id: 3,
        name: 'Monthly',
      });
      lessonRepo.getTeacherRate.mockResolvedValue(55);
      courseRepository.save.mockImplementation(async (p: any) => ({
        ...p,
        id: 100,
      }));
      enrolmentRepository.save.mockImplementation(async (p: any) => ({
        ...p,
        id: 200,
      }));
      let lessonId = 1000;
      lessonRepository.save.mockImplementation(async (p: any) => ({
        ...p,
        id: lessonId++,
      }));
      enrolmentRepository.findOne.mockResolvedValue({
        id: 200,
        course: { id: 100 },
      });
      studentEnrolmentTransformationService.transformEnrolmentToDto.mockReturnValue(
        { id: 200 },
      );
      programRepository.findOne.mockResolvedValue({ id: 8, type: 1 });
      programPresentation.isClassified.mockReturnValue(true);
      programPresentation.pricingCategoryFor.mockReturnValue('standard');
      pricingResolver.resolve.mockResolvedValue({ hourlyRate: '72.50' });

      // A rate period that stops well before the lessons do.
      courseProgramRateRepository.findOne.mockResolvedValue({
        id: 555,
        endDate: new Date('2026-09-15T00:00:00.000Z'),
      });

      await service.createEnrolment(
        3,
        'test-location',
        99,
        createDto({ startDate: '2026-09-01', lessonsCount: 8, pricingTier: 1 }),
        7001,
      );

      const stretched = courseProgramRateRepository.update.mock.calls.find(
        (call: any[]) => call[0]?.id === 555,
      );
      expect(stretched).toBeDefined();
      // Extended to the last lesson, not left on the estimate.
      expect(new Date(stretched![1].endDate).getTime()).toBeGreaterThan(
        new Date('2026-09-15T00:00:00.000Z').getTime(),
      );
    });

    it('leaves a period alone when it already covers the last lesson', async () => {
      studentRepository.findStudentByIdAndLocation.mockResolvedValue({
        id: 99,
      });
      paymentFrequencyRepository.findOne.mockResolvedValue({
        id: 3,
        name: 'Monthly',
      });
      lessonRepo.getTeacherRate.mockResolvedValue(55);
      courseRepository.save.mockImplementation(async (p: any) => ({
        ...p,
        id: 100,
      }));
      enrolmentRepository.save.mockImplementation(async (p: any) => ({
        ...p,
        id: 200,
      }));
      let lessonId = 2000;
      lessonRepository.save.mockImplementation(async (p: any) => ({
        ...p,
        id: lessonId++,
      }));
      enrolmentRepository.findOne.mockResolvedValue({
        id: 200,
        course: { id: 100 },
      });
      studentEnrolmentTransformationService.transformEnrolmentToDto.mockReturnValue(
        { id: 200 },
      );
      programRepository.findOne.mockResolvedValue({ id: 8, type: 1 });
      programPresentation.isClassified.mockReturnValue(true);
      programPresentation.pricingCategoryFor.mockReturnValue('standard');
      pricingResolver.resolve.mockResolvedValue({ hourlyRate: '72.50' });

      courseProgramRateRepository.findOne.mockResolvedValue({
        id: 556,
        endDate: new Date('2030-01-01T00:00:00.000Z'),
      });

      await service.createEnrolment(
        3,
        'test-location',
        99,
        createDto({ startDate: '2026-09-01', lessonsCount: 4, pricingTier: 1 }),
        7001,
      );

      expect(
        courseProgramRateRepository.update.mock.calls.some(
          (call: any[]) => call[0]?.id === 556,
        ),
      ).toBe(false);
    });
  });

  describe('a course that crosses 1 September 2026', () => {
    // The migration stages rates for enrolments that already exist. An
    // enrolment created between now and the cutover is not in its scope, so
    // without this the course would be minted on old pricing and stay there.
    function arrangeCutoverCourse(): CreateStudentEnrolmentDto {
      studentRepository.findStudentByIdAndLocation.mockResolvedValue({
        id: 99,
      });
      paymentFrequencyRepository.findOne.mockResolvedValue({
        id: 3,
        name: 'Monthly',
      });
      lessonRepo.getTeacherRate.mockResolvedValue(55);
      courseRepository.save.mockImplementation(async (payload: any) => ({
        ...payload,
        id: 100,
      }));
      enrolmentRepository.save.mockImplementation(async (payload: any) => ({
        ...payload,
        id: 200,
      }));
      let lessonId = 1000;
      lessonRepository.save.mockImplementation(async (payload: any) => ({
        ...payload,
        id: lessonId++,
      }));
      enrolmentRepository.findOne.mockResolvedValue({
        id: 200,
        course: { id: 100 },
      });
      studentEnrolmentTransformationService.transformEnrolmentToDto.mockReturnValue(
        { id: 200 },
      );

      programRepository.findOne.mockResolvedValue({ id: 8, type: 1 });
      programPresentation.isClassified.mockReturnValue(true);
      programPresentation.pricingCategoryFor.mockReturnValue('standard');
      pricingResolver.resolve.mockResolvedValue({ hourlyRate: '72.50' });

      // Tuesdays from 4 August, eight lessons - four in August, four from
      // 1 September onwards.
      return createDto({
        startDate: '2026-08-04',
        day: 'Tuesday',
        lessonsCount: 8,
        programRate: 65,
        discountedRatePerMonth: 120,
        // Required now that the program is classified. Tier 1 is the rate every
        // amount asserted below was written against.
        pricingTier: 1,
      });
    }

    it('splits the course rate at the cutover instead of writing one row', async () => {
      const dto = arrangeCutoverCourse();

      await service.createEnrolment(3, 'test-location', 99, dto, 7001);

      const rows = courseProgramRateRepository.create.mock.calls.map(
        (call) => call[0],
      );
      expect(rows).toHaveLength(2);
      expect(rows[0].programRate).toBe(65);
      expect(rows[0].endDate.toISOString().slice(0, 10)).toBe('2026-08-31');
      expect(rows[1].programRate).toBe(72.5);
      expect(rows[1].startDate.toISOString().slice(0, 10)).toBe('2026-09-01');
    });

    it('prices each lesson at the rate in force on its own date', async () => {
      const dto = arrangeCutoverCourse();

      await service.createEnrolment(3, 'test-location', 99, dto, 7001);

      const lessons = lessonRepository.create.mock.calls.map((call) => call[0]);
      expect(lessons.length).toBeGreaterThan(4);

      for (const lesson of lessons) {
        const day = lesson.date.toISOString().slice(0, 10);
        expect(lesson.programRate).toBe(day < '2026-09-01' ? 65 : 72.5);
      }
    });

    it('moves the lesson total with the rate, since it becomes the balance owed', async () => {
      // Lesson confirmation copies total into private_lesson.total and balance.
      // Leaving it behind would owe August money against a September invoice.
      const dto = arrangeCutoverCourse();

      await service.createEnrolment(3, 'test-location', 99, dto, 7001);

      const lessons = lessonRepository.create.mock.calls.map((call) => call[0]);
      const august = lessons.find(
        (lesson) => lesson.date.toISOString().slice(0, 10) < '2026-09-01',
      );
      const september = lessons.find(
        (lesson) => lesson.date.toISOString().slice(0, 10) >= '2026-09-01',
      );

      expect(august.total).toBe(30);
      // Not 33.46, which is what a flat 30 x 72.50 / 65 gives. The DTO carries a
      // $25.00-a-month multiple-enrolment discount - $6.25 a lesson - and a flat
      // amount does not grow because the rate did.
      //
      // 48.75 gross a lesson at the form rate, less 6.25 flat, leaves 42.50 for
      // the percentages to have acted on; the UI returned 30.00 of that. The
      // same proportion of the re-rated 54.375 - 6.25 = 48.125 is 33.97.
      expect(september.total).toBe(33.97);
    });

    it('reproduces enrolment 33587 exactly: $33.95, not $33.81', async () => {
      // The reported case, pinned with its own numbers so it cannot be confused
      // with the fixture above - which uses a 45-minute lesson and a $25.00
      // discount and lands on a coincidentally similar figure.
      //
      // Bass Guitar, tier 1, 30 minutes, Monthly, 3% payment frequency and
      // $5.00 a month multiple enrolment. The form still held the $65.00
      // program rate, so the UI sent (32.50 - 1.25 - 3% of 31.25) x 4 = 121.25,
      // and the September lessons are re-rated to $72.50.
      const dto = arrangeCutoverCourse();
      dto.duration = '00:30';
      dto.multipleEnrolDiscount = 5;
      dto.paymentFrequencyDiscount = 3;
      dto.discountedRatePerMonth = 121.25;

      await service.createEnrolment(3, 'test-location', 99, dto, 7001);

      const lessons = lessonRepository.create.mock.calls.map((call) => call[0]);
      const august = lessons.find(
        (lesson) => lesson.date.toISOString().slice(0, 10) < '2026-09-01',
      );
      const september = lessons.find(
        (lesson) => lesson.date.toISOString().slice(0, 10) >= '2026-09-01',
      );

      // August was always right: the rates match, so nothing is rescaled.
      expect(august.total).toBe(30.31);
      // September is the one that stored 33.81. Gross 36.25, less the flat
      // $1.25 that must NOT grow with the rate, less 3% of the 35.00 remaining.
      expect(september.total).toBe(33.95);
    });

    it('does not inflate a flat discount when the lesson is re-rated', async () => {
      // Reported 2026-08-24. A lesson showed a subtotal of $33.95 and a total of
      // $33.81 in the same panel: the cascade had the flat discount at $1.25
      // while the stored total had been scaled to $1.39 along with the rate.
      // The gap always favoured the customer, which is why it went unnoticed.
      const dto = arrangeCutoverCourse();

      await service.createEnrolment(3, 'test-location', 99, dto, 7001);

      const lessons = lessonRepository.create.mock.calls.map((call) => call[0]);
      const september = lessons.find(
        (lesson) => lesson.date.toISOString().slice(0, 10) >= '2026-09-01',
      );

      // What the lesson's own rate and discounts say it costs, computed the way
      // every other calculator does it: gross, less the flat amount, less the
      // percentages that the UI's figure implies.
      const grossAtLessonRate = 72.5 * 0.75;
      const flatPerLesson = 25 / 4;
      const impliedPercentageFactor = 30 / (65 * 0.75 - flatPerLesson);
      const expected =
        (grossAtLessonRate - flatPerLesson) * impliedPercentageFactor;

      expect(september.total).toBeCloseTo(expected, 2);
      // And strictly more than the old behaviour, which under-charged.
      expect(september.total).toBeGreaterThan(30 * (72.5 / 65));
    });

    it('resolves at the tier staff chose, not the tier-1 default', async () => {
      const dto = arrangeCutoverCourse();
      dto.pricingTier = 3;

      await service.createEnrolment(3, 'test-location', 99, dto, 7001);

      const calls = pricingResolver.resolve.mock.calls as Array<
        [{ pricingTier: number }]
      >;
      expect(calls.length).toBeGreaterThan(0);
      for (const [args] of calls) {
        expect(args.pricingTier).toBe(3);
      }
    });

    it('records the chosen tier as a human decision, not a default', async () => {
      const dto = arrangeCutoverCourse();
      dto.pricingTier = 2;

      await service.createEnrolment(3, 'test-location', 99, dto, 7001);

      // `change` and not `assign`: it leaves pricingTierIsDefaulted false, which
      // is what separates a staff choice from the migration's tier-1 default.
      expect(enrolmentTier.change).toHaveBeenCalledTimes(1);
      expect(enrolmentTier.change.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          enrolmentId: 200,
          tier: 2,
          changedByUserId: 7001,
        }),
      );
    });

    // Tier 1 is the cheapest price in each category, so a forgotten tier is a
    // silent undercharge for the life of the enrolment - $290.00 rather than
    // $350.00 or $410.00 on a Standard 60-minute. It does not fall back to the
    // old rate; it would still write a September rate, just the cheapest one.
    // So it is refused rather than defaulted.
    it('refuses a classified program with no tier', async () => {
      const dto = arrangeCutoverCourse();
      delete dto.pricingTier;

      await expect(
        service.createEnrolment(3, 'test-location', 99, dto, 7001),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses before it writes anything', async () => {
      const dto = arrangeCutoverCourse();
      delete dto.pricingTier;

      await expect(
        service.createEnrolment(3, 'test-location', 99, dto, 7001),
      ).rejects.toThrow(BadRequestException);

      // A half-created enrolment would be worse than a rejected one.
      expect(courseRepository.save).not.toHaveBeenCalled();
      expect(enrolmentRepository.save).not.toHaveBeenCalled();
      expect(lessonRepository.save).not.toHaveBeenCalled();
    });

    it('still accepts an unclassified program with no tier', async () => {
      const dto = arrangeCutoverCourse();
      delete dto.pricingTier;
      programPresentation.isClassified.mockReturnValue(false);

      await expect(
        service.createEnrolment(3, 'test-location', 99, dto, 7001),
      ).resolves.toBeDefined();
      expect(enrolmentTier.change).not.toHaveBeenCalled();
    });

    // Outside the pilot no catalogue rate is resolved at all, so demanding a
    // tier would reject enrolments the new pricing never touches.
    it('still accepts no tier at a location outside the rollout', async () => {
      const dto = arrangeCutoverCourse();
      delete dto.pricingTier;
      rollout.isEnabledForLocation.mockResolvedValue(false);

      await expect(
        service.createEnrolment(3, 'test-location', 99, dto, 7001),
      ).resolves.toBeDefined();
      expect(pricingResolver.resolve).not.toHaveBeenCalled();
      expect(courseProgramRateRepository.create).toHaveBeenCalledTimes(1);
    });

    // Arcadia approved grandfathering on 2026-08-18: a student who commits
    // before September may keep the previous rate. Recorded as a decision on
    // the enrolment rather than delivered as a discount - a discount cannot
    // reproduce the published prepaid totals, collides with the sibling
    // discount 191 active enrolments already carry, and would leave the
    // customer counted as being on the new pricing.
    describe('keeping the previous rate', () => {
      it('accepts a classified program with no tier when the rate is held', async () => {
        const dto = arrangeCutoverCourse();
        delete dto.pricingTier;
        dto.keepsPreviousRate = true;
        dto.previousRateReason = 'Committed before September, agreed by Ashif';

        await expect(
          service.createEnrolment(3, 'test-location', 99, dto, 7001),
        ).resolves.toBeDefined();
      });

      // The trap. A missing tier falls back to tier 1 rather than to the old
      // rate, so without the check in resolveCatalogueRate this enrolment
      // would read as grandfathered and bill the September price from 1
      // September - at the cheapest tier, so nothing would look wrong.
      it('never resolves a September rate for a held enrolment', async () => {
        const dto = arrangeCutoverCourse();
        delete dto.pricingTier;
        dto.keepsPreviousRate = true;
        dto.previousRateReason = 'Committed before September';

        await service.createEnrolment(3, 'test-location', 99, dto, 7001);

        expect(pricingResolver.resolve).not.toHaveBeenCalled();
        // One rate row, not a pair split at the cutover: the whole course
        // stays on the rate it was created with.
        expect(courseProgramRateRepository.create).toHaveBeenCalledTimes(1);
      });

      it('keeps the submitted rate on every lesson, either side of the cutover', async () => {
        const dto = arrangeCutoverCourse();
        delete dto.pricingTier;
        dto.keepsPreviousRate = true;
        dto.previousRateReason = 'Committed before September';

        await service.createEnrolment(3, 'test-location', 99, dto, 7001);

        const lessons = lessonRepository.create.mock.calls.map(
          (call) => call[0],
        );
        expect(lessons.length).toBeGreaterThan(0);
        for (const lesson of lessons) {
          expect(lesson.programRate).toBe(65);
        }
      });

      it('records who agreed it and why', async () => {
        const dto = arrangeCutoverCourse();
        delete dto.pricingTier;
        dto.keepsPreviousRate = true;
        dto.previousRateReason = 'Locked in before September';

        await service.createEnrolment(3, 'test-location', 99, dto, 7001);

        const [created] = enrolmentRepository.create.mock.calls.at(-1) as [
          Record<string, unknown>,
        ];
        expect(created.keepsPreviousRate).toBe(true);
        expect(created.previousRateReason).toBe('Locked in before September');
        expect(created.previousRateApprovedByUserId).toBe(7001);
        expect(created.previousRateApprovedOn).toBeTruthy();
      });

      // In a year the only useful question is who agreed this and on what
      // basis, and a blank reason cannot answer it.
      it('refuses to hold a rate without a reason', async () => {
        const dto = arrangeCutoverCourse();
        delete dto.pricingTier;
        dto.keepsPreviousRate = true;

        await expect(
          service.createEnrolment(3, 'test-location', 99, dto, 7001),
        ).rejects.toThrow(BadRequestException);
        expect(enrolmentRepository.save).not.toHaveBeenCalled();
      });

      it('treats whitespace as no reason at all', async () => {
        const dto = arrangeCutoverCourse();
        delete dto.pricingTier;
        dto.keepsPreviousRate = true;
        dto.previousRateReason = '   ';

        await expect(
          service.createEnrolment(3, 'test-location', 99, dto, 7001),
        ).rejects.toThrow(BadRequestException);
      });

      // The two answers differ by $90 a month on a Standard 60-minute, so
      // picking one silently would overrule whoever filled the form in.
      it('refuses a tier and the previous rate together', async () => {
        const dto = arrangeCutoverCourse();
        dto.pricingTier = 2;
        dto.keepsPreviousRate = true;
        dto.previousRateReason = 'Committed before September';

        await expect(
          service.createEnrolment(3, 'test-location', 99, dto, 7001),
        ).rejects.toThrow(BadRequestException);
        expect(enrolmentRepository.save).not.toHaveBeenCalled();
      });

      it('leaves the flag off and the audit empty for an ordinary enrolment', async () => {
        const dto = arrangeCutoverCourse();

        await service.createEnrolment(3, 'test-location', 99, dto, 7001);

        const [created] = enrolmentRepository.create.mock.calls.at(-1) as [
          Record<string, unknown>,
        ];
        expect(created.keepsPreviousRate).toBe(false);
        expect(created.previousRateReason).toBeNull();
        expect(created.previousRateApprovedByUserId).toBeNull();
        expect(created.previousRateApprovedOn).toBeNull();
      });

      it('records no tier change, because no tier was chosen', async () => {
        const dto = arrangeCutoverCourse();
        delete dto.pricingTier;
        dto.keepsPreviousRate = true;
        dto.previousRateReason = 'Committed before September';

        await service.createEnrolment(3, 'test-location', 99, dto, 7001);

        expect(enrolmentTier.change).not.toHaveBeenCalled();
        expect(enrolmentTier.assign).not.toHaveBeenCalled();
      });
    });

    // The 32 marker-prefixed programs hold a frozen older sheet - xPiano Core
    // is $57.50 an hour where Piano Core is $65.00 - so they are classified
    // but never tierable. Offering a tier would charge the September price
    // from the very program that exists to preserve the 2018 one.
    describe('a program that holds an older price sheet', () => {
      it('does not demand a tier', async () => {
        const dto = arrangeCutoverCourse();
        delete dto.pricingTier;
        programPresentation.isTierable.mockReturnValue(false);

        await expect(
          service.createEnrolment(3, 'test-location', 99, dto, 7001),
        ).resolves.toBeDefined();
      });

      it('resolves no September rate for it', async () => {
        const dto = arrangeCutoverCourse();
        delete dto.pricingTier;
        programPresentation.isTierable.mockReturnValue(false);

        await service.createEnrolment(3, 'test-location', 99, dto, 7001);

        expect(pricingResolver.resolve).not.toHaveBeenCalled();
        expect(courseProgramRateRepository.create).toHaveBeenCalledTimes(1);
      });

      // Classification is what these programs pass, which is why tierability
      // had to become a separate question rather than a rename of it.
      it('is refused on tierability, not on classification', async () => {
        const dto = arrangeCutoverCourse();
        delete dto.pricingTier;
        programPresentation.isClassified.mockReturnValue(true);
        programPresentation.isTierable.mockReturnValue(false);

        await expect(
          service.createEnrolment(3, 'test-location', 99, dto, 7001),
        ).resolves.toBeDefined();
      });
    });

    it('resolves at the tier supplied, not a default', async () => {
      const dto = arrangeCutoverCourse();

      await service.createEnrolment(3, 'test-location', 99, dto, 7001);

      const calls = pricingResolver.resolve.mock.calls as Array<
        [{ pricingTier: number }]
      >;
      expect(calls.length).toBeGreaterThan(0);
      for (const [args] of calls) {
        expect(args.pricingTier).toBe(1);
      }
    });

    it('leaves everything alone when the catalogue has no answer', async () => {
      const dto = arrangeCutoverCourse();
      programPresentation.isClassified.mockReturnValue(false);

      await service.createEnrolment(3, 'test-location', 99, dto, 7001);

      expect(courseProgramRateRepository.create).toHaveBeenCalledTimes(1);
      const lessons = lessonRepository.create.mock.calls.map((call) => call[0]);
      for (const lesson of lessons) {
        expect(lesson.programRate).toBe(65);
        expect(lesson.total).toBe(30);
      }
    });

    it('does not fail the enrolment when the resolver rejects', async () => {
      const dto = arrangeCutoverCourse();
      pricingResolver.resolve.mockRejectedValue(new Error('NO_MATCHING_PRICE'));

      await expect(
        service.createEnrolment(3, 'test-location', 99, dto as any, 7001),
      ).resolves.toBeDefined();

      expect(courseProgramRateRepository.create).toHaveBeenCalledTimes(1);
    });
  });

  it('throws BadRequestException when payment cycle start date is invalid', async () => {
    studentRepository.findStudentByIdAndLocation.mockResolvedValue({ id: 99 });
    paymentFrequencyRepository.findOne.mockResolvedValue({
      id: 3,
      name: 'Monthly',
    });
    courseRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 100,
    }));
    enrolmentRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 200,
    }));

    await expect(
      service.createEnrolment(
        3,
        'test-location',
        99,
        createDto({ paymentCycleEffectiveDate: 'invalid-date' }) as any,
        7001,
      ),
    ).rejects.toThrow(
      new BadRequestException('Invalid payment cycle start date'),
    );
  });

  it('throws BadRequestException when day name is invalid', async () => {
    studentRepository.findStudentByIdAndLocation.mockResolvedValue({ id: 99 });
    paymentFrequencyRepository.findOne.mockResolvedValue({
      id: 3,
      name: 'Monthly',
    });
    courseRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 100,
    }));

    await expect(
      service.createEnrolment(
        3,
        'test-location',
        99,
        createDto({ day: 'Funday' }) as any,
        7001,
      ),
    ).rejects.toThrow(new BadRequestException('Invalid day: Funday'));
  });

  it('falls back to zero when teacher rate is missing', async () => {
    const dto = createDto({ programRate: 140 });

    studentRepository.findStudentByIdAndLocation.mockResolvedValue({ id: 99 });
    paymentFrequencyRepository.findOne.mockResolvedValue({
      id: 3,
      name: 'Monthly',
    });
    lessonRepo.getTeacherRate.mockResolvedValue(null);
    courseRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 100,
    }));
    enrolmentRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 200,
    }));
    lessonRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 1000,
    }));
    enrolmentRepository.findOne.mockResolvedValue({
      id: 200,
      course: { id: 100 },
    });
    studentEnrolmentTransformationService.transformEnrolmentToDto.mockReturnValue(
      { id: 200 },
    );

    await service.createEnrolment(3, 'test-location', 99, dto, 7001);

    const createdLesson = lessonRepository.create.mock.calls[0][0];
    expect(createdLesson.teacherRate).toBe(0);
  });

  it('generates weekly lessons and skips the fifth weekday slot', async () => {
    const dto = createDto({
      startDate: '2026-05-01',
      day: 'Friday',
      lessonsCount: 5,
    });

    studentRepository.findStudentByIdAndLocation.mockResolvedValue({ id: 99 });
    paymentFrequencyRepository.findOne.mockResolvedValue({
      id: 3,
      name: 'Monthly',
    });
    lessonRepo.getTeacherRate.mockResolvedValue(60);
    courseRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 100,
    }));
    enrolmentRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 200,
    }));

    let lessonId = 1000;
    lessonRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: lessonId++,
    }));
    enrolmentRepository.findOne.mockResolvedValue({
      id: 200,
      course: { id: 100 },
    });
    studentEnrolmentTransformationService.transformEnrolmentToDto.mockReturnValue(
      { id: 200 },
    );

    await service.createEnrolment(3, 'test-location', 99, dto, 7001);

    expect(lessonRepository.save).toHaveBeenCalledTimes(5);
    const createdDates = lessonRepository.create.mock.calls.map((call) =>
      call[0].date.toISOString().slice(0, 10),
    );
    expect(createdDates).toEqual([
      '2026-05-01',
      '2026-05-08',
      '2026-05-15',
      '2026-05-22',
      '2026-06-05',
    ]);
  });

  it('skips holiday lesson dates by pushing to the next week', async () => {
    const dto = createDto({
      startDate: '2026-05-01',
      day: 'Friday',
      lessonsCount: 3,
    });

    studentRepository.findStudentByIdAndLocation.mockResolvedValue({ id: 99 });
    paymentFrequencyRepository.findOne.mockResolvedValue({
      id: 3,
      name: 'Monthly',
    });
    lessonRepo.getTeacherRate.mockResolvedValue(60);
    courseRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 100,
    }));
    enrolmentRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 200,
    }));
    enrolmentRepository.findOne.mockResolvedValue({
      id: 200,
      course: { id: 100 },
    });
    studentEnrolmentTransformationService.transformEnrolmentToDto.mockReturnValue(
      { id: 200 },
    );

    const holidayBuilder = {
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getMany: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 1, date: new Date('2026-05-15') }]),
    };
    holidayRepository.createQueryBuilder.mockReturnValue(holidayBuilder);

    let lessonId = 1000;
    lessonRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: lessonId++,
    }));

    await service.createEnrolment(3, 'test-location', 99, dto, 7001);

    const createdDates = lessonRepository.create.mock.calls.map((call) =>
      call[0].date.toISOString().slice(0, 10),
    );
    expect(createdDates).toEqual(['2026-05-01', '2026-05-08', '2026-05-22']);
  });

  it('throws BadRequestException when start date or time is invalid', async () => {
    studentRepository.findStudentByIdAndLocation.mockResolvedValue({ id: 99 });
    paymentFrequencyRepository.findOne.mockResolvedValue({
      id: 3,
      name: 'Monthly',
    });

    await expect(
      service.createEnrolment(
        3,
        'test-location',
        99,
        createDto({ startDate: 'not-a-date', startTime: '99:99' }) as any,
        7001,
      ),
    ).rejects.toThrow('Invalid start date or time');
  });

  it('does not save enrolment discounts when both discount values are zero', async () => {
    const dto = createDto({
      multipleEnrolDiscount: 0,
      paymentFrequencyDiscount: 0,
    });

    studentRepository.findStudentByIdAndLocation.mockResolvedValue({ id: 99 });
    paymentFrequencyRepository.findOne.mockResolvedValue({
      id: 3,
      name: 'Monthly',
    });
    lessonRepo.getTeacherRate.mockResolvedValue(60);
    courseRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 100,
    }));
    enrolmentRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 200,
    }));
    lessonRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 1000,
    }));
    enrolmentRepository.findOne.mockResolvedValue({
      id: 200,
      course: { id: 100 },
    });
    studentEnrolmentTransformationService.transformEnrolmentToDto.mockReturnValue(
      { id: 200 },
    );

    await service.createEnrolment(3, 'test-location', 99, dto, 7001);

    expect(enrolmentDiscountRepository.save).not.toHaveBeenCalled();
  });

  it('creates enrolment payment frequency row with parsed paymentCycleStartDate', async () => {
    const dto = createDto({ paymentCycleEffectiveDate: '2026-04-15' });

    studentRepository.findStudentByIdAndLocation.mockResolvedValue({ id: 99 });
    paymentFrequencyRepository.findOne.mockResolvedValue({
      id: 3,
      name: 'Monthly',
    });
    lessonRepo.getTeacherRate.mockResolvedValue(60);
    courseRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 100,
    }));
    enrolmentRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 200,
    }));
    lessonRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 1000,
    }));
    enrolmentRepository.findOne.mockResolvedValue({
      id: 200,
      course: { id: 100 },
    });
    studentEnrolmentTransformationService.transformEnrolmentToDto.mockReturnValue(
      { id: 200 },
    );

    await service.createEnrolment(3, 'test-location', 99, dto, 7001);

    expect(enrolmentPaymentFrequencyRepository.save).toHaveBeenCalledTimes(1);
    const savedPf = enrolmentPaymentFrequencyRepository.save.mock.calls[0][0];
    expect(savedPf).toEqual(
      expect.objectContaining({
        enrolmentId: 200,
        paymentFrequencyId: 3,
      }),
    );
    expect(savedPf.paymentCycleStartDate).toBeInstanceOf(Date);
    expect(savedPf.paymentCycleStartDate.toISOString().slice(0, 10)).toBe(
      '2026-04-15',
    );
    expect(savedPf.createdOn).toBeInstanceOf(Date);
    expect(savedPf.updatedOn).toBeInstanceOf(Date);
  });

  it('updates course endDate to the last generated lesson date', async () => {
    const dto = createDto({
      startDate: '2026-05-01',
      day: 'Friday',
      lessonsCount: 5,
    });

    studentRepository.findStudentByIdAndLocation.mockResolvedValue({ id: 99 });
    paymentFrequencyRepository.findOne.mockResolvedValue({
      id: 3,
      name: 'Monthly',
    });
    lessonRepo.getTeacherRate.mockResolvedValue(60);
    courseRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 100,
    }));
    enrolmentRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 200,
    }));
    let lessonId = 1000;
    lessonRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: lessonId++,
    }));
    enrolmentRepository.findOne.mockResolvedValue({
      id: 200,
      course: { id: 100 },
    });
    studentEnrolmentTransformationService.transformEnrolmentToDto.mockReturnValue(
      { id: 200 },
    );

    await service.createEnrolment(3, 'test-location', 99, dto, 7001);

    expect(courseRepository.update).toHaveBeenCalledWith(
      { id: 100 },
      expect.objectContaining({
        endDate: expect.any(Date),
      }),
    );
    const updatedEndDate = courseRepository.update.mock.calls[0][1]
      .endDate as Date;
    expect(updatedEndDate.toISOString().slice(0, 10)).toBe('2026-06-05');
  });

  it('rejects startTime with seconds because service expects HH:mm input', async () => {
    const dto = createDto({
      startTime: '15:00:30',
    });

    studentRepository.findStudentByIdAndLocation.mockResolvedValue({ id: 99 });
    paymentFrequencyRepository.findOne.mockResolvedValue({
      id: 3,
      name: 'Monthly',
    });

    await expect(
      service.createEnrolment(3, 'test-location', 99, dto as any, 7001),
    ).rejects.toThrow('Invalid start date or time');
  });

  it('propagates online flag across course, enrolment, and lesson payloads', async () => {
    const dto = createDto({ isOnline: true });

    studentRepository.findStudentByIdAndLocation.mockResolvedValue({ id: 99 });
    paymentFrequencyRepository.findOne.mockResolvedValue({
      id: 3,
      name: 'Monthly',
    });
    lessonRepo.getTeacherRate.mockResolvedValue(60);
    courseRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 100,
    }));
    enrolmentRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 200,
    }));
    lessonRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 1000,
    }));
    enrolmentRepository.findOne.mockResolvedValue({
      id: 200,
      course: { id: 100 },
    });
    studentEnrolmentTransformationService.transformEnrolmentToDto.mockReturnValue(
      { id: 200 },
    );

    await service.createEnrolment(3, 'test-location', 99, dto, 7001);

    expect(courseRepository.create.mock.calls[0][0].isOnline).toBe(1);
    expect(enrolmentRepository.create.mock.calls[0][0].isOnline).toBe(1);
    expect(lessonRepository.create.mock.calls[0][0].isOnline).toBe(true);
  });

  it('throws NotFoundException when created enrolment cannot be loaded for response transform', async () => {
    studentRepository.findStudentByIdAndLocation.mockResolvedValue({ id: 99 });
    paymentFrequencyRepository.findOne.mockResolvedValue({
      id: 3,
      name: 'Monthly',
    });
    lessonRepo.getTeacherRate.mockResolvedValue(60);
    courseRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 100,
    }));
    enrolmentRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 200,
    }));
    lessonRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 1000,
    }));
    enrolmentRepository.findOne.mockResolvedValue(null);

    await expect(
      service.createEnrolment(3, 'test-location', 99, createDto() as any, 7001),
    ).rejects.toThrow(
      new NotFoundException('Failed to load created enrolment'),
    );
  });

  it('normalizes HH:mm input to HH:mm:ss for course schedule fromTime and duration', async () => {
    const dto = createDto({
      startTime: '09:30',
      duration: '00:45',
    });

    studentRepository.findStudentByIdAndLocation.mockResolvedValue({ id: 99 });
    paymentFrequencyRepository.findOne.mockResolvedValue({
      id: 3,
      name: 'Monthly',
    });
    lessonRepo.getTeacherRate.mockResolvedValue(60);
    courseRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 100,
    }));
    enrolmentRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 200,
    }));
    lessonRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 1000,
    }));
    enrolmentRepository.findOne.mockResolvedValue({
      id: 200,
      course: { id: 100 },
    });
    studentEnrolmentTransformationService.transformEnrolmentToDto.mockReturnValue(
      { id: 200 },
    );

    await service.createEnrolment(3, 'test-location', 99, dto, 7001);

    const schedulePayload = courseScheduleRepository.create.mock.calls[0][0];
    expect(schedulePayload.fromTime).toBe('09:30:00');
    expect(schedulePayload.duration).toBe('00:45:00');
  });

  it('sets lesson total as discountedRatePerMonth divided by 4', async () => {
    const dto = createDto({ discountedRatePerMonth: 198 });

    studentRepository.findStudentByIdAndLocation.mockResolvedValue({ id: 99 });
    paymentFrequencyRepository.findOne.mockResolvedValue({
      id: 3,
      name: 'Monthly',
    });
    lessonRepo.getTeacherRate.mockResolvedValue(60);
    courseRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 100,
    }));
    enrolmentRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 200,
    }));
    lessonRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 1000,
    }));
    enrolmentRepository.findOne.mockResolvedValue({
      id: 200,
      course: { id: 100 },
    });
    studentEnrolmentTransformationService.transformEnrolmentToDto.mockReturnValue(
      { id: 200 },
    );

    await service.createEnrolment(3, 'test-location', 99, dto, 7001);

    const lessonPayload = lessonRepository.create.mock.calls[0][0];
    expect(lessonPayload.total).toBe(49.5);
  });

  it('backfills lesson originalDate via repository update after save', async () => {
    studentRepository.findStudentByIdAndLocation.mockResolvedValue({ id: 99 });
    paymentFrequencyRepository.findOne.mockResolvedValue({
      id: 3,
      name: 'Monthly',
    });
    lessonRepo.getTeacherRate.mockResolvedValue(60);
    courseRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 100,
    }));
    enrolmentRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 200,
    }));
    lessonRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 1000,
    }));
    enrolmentRepository.findOne.mockResolvedValue({
      id: 200,
      course: { id: 100 },
    });
    studentEnrolmentTransformationService.transformEnrolmentToDto.mockReturnValue(
      { id: 200 },
    );

    await service.createEnrolment(3, 'test-location', 99, createDto(), 7001);

    expect(lessonRepository.update).toHaveBeenCalledTimes(1);
    expect(lessonRepository.update).toHaveBeenCalledWith(
      { id: 1000 },
      expect.objectContaining({
        originalDate: expect.any(Date),
      }),
    );
  });

  it('does not create lessons when lessonsCount is zero', async () => {
    const dto = createDto({ lessonsCount: 0 });

    studentRepository.findStudentByIdAndLocation.mockResolvedValue({ id: 99 });
    paymentFrequencyRepository.findOne.mockResolvedValue({
      id: 3,
      name: 'Monthly',
    });
    lessonRepo.getTeacherRate.mockResolvedValue(60);
    courseRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 100,
    }));
    enrolmentRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 200,
    }));
    enrolmentRepository.findOne.mockResolvedValue({
      id: 200,
      course: { id: 100 },
    });
    studentEnrolmentTransformationService.transformEnrolmentToDto.mockReturnValue(
      { id: 200 },
    );

    await service.createEnrolment(3, 'test-location', 99, dto, 7001);

    expect(lessonRepository.create).not.toHaveBeenCalled();
    expect(lessonRepository.save).not.toHaveBeenCalled();
    expect(lessonRepository.update).not.toHaveBeenCalled();
  });

  it('does not create discount rows when discount values are undefined', async () => {
    const dto = createDto({
      multipleEnrolDiscount: undefined,
      paymentFrequencyDiscount: undefined,
    });

    studentRepository.findStudentByIdAndLocation.mockResolvedValue({ id: 99 });
    paymentFrequencyRepository.findOne.mockResolvedValue({
      id: 3,
      name: 'Monthly',
    });
    lessonRepo.getTeacherRate.mockResolvedValue(60);
    courseRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 100,
    }));
    enrolmentRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 200,
    }));
    lessonRepository.save.mockImplementation(async (payload: any) => ({
      ...payload,
      id: 1000,
    }));
    enrolmentRepository.findOne.mockResolvedValue({
      id: 200,
      course: { id: 100 },
    });
    studentEnrolmentTransformationService.transformEnrolmentToDto.mockReturnValue(
      { id: 200 },
    );

    await service.createEnrolment(3, 'test-location', 99, dto, 7001);

    expect(enrolmentDiscountRepository.save).not.toHaveBeenCalled();
  });

  // Digital enrolment quotes at tier 1 because a parent is never asked about
  // tiers (D6). The enrolment must still be created - blocking the parent is
  // worse - so the flag is what carries the "somebody needs to look at this".
  describe('a tier that was defaulted rather than chosen', () => {
    it('records it as defaulted, so it reaches the review report', async () => {
      const dto = arrangeCutoverCourseForDefaulting();
      dto.pricingTier = 1;
      dto.pricingTierIsDefaulted = true;

      await service.createEnrolment(3, 'test-location', 99, dto, 7001);

      expect(enrolmentTier.assign).toHaveBeenCalledWith(
        expect.objectContaining({ tier: 1, isDefaulted: true }),
      );
      expect(enrolmentTier.change).not.toHaveBeenCalled();
    });

    it('records a chosen tier as a human decision, not a default', async () => {
      const dto = arrangeCutoverCourseForDefaulting();
      dto.pricingTier = 2;

      await service.createEnrolment(3, 'test-location', 99, dto, 7001);

      expect(enrolmentTier.change).toHaveBeenCalledWith(
        expect.objectContaining({ tier: 2 }),
      );
      expect(enrolmentTier.assign).not.toHaveBeenCalled();
    });

    // A defaulted tier still satisfies the requirement, so a digital
    // submission is never refused for want of a tier nobody asked the parent
    // about.
    it('satisfies the required-tier rule', async () => {
      const dto = arrangeCutoverCourseForDefaulting();
      dto.pricingTier = 1;
      dto.pricingTierIsDefaulted = true;

      await expect(
        service.createEnrolment(3, 'test-location', 99, dto, 7001),
      ).resolves.toBeDefined();
    });

    function arrangeCutoverCourseForDefaulting(): CreateStudentEnrolmentDto {
      studentRepository.findStudentByIdAndLocation.mockResolvedValue({ id: 99 });
      paymentFrequencyRepository.findOne.mockResolvedValue({
        id: 3,
        name: 'Monthly',
      });
      lessonRepo.getTeacherRate.mockResolvedValue(55);
      courseRepository.save.mockImplementation(async (payload: any) => ({
        ...payload,
        id: 100,
      }));
      enrolmentRepository.save.mockImplementation(async (payload: any) => ({
        ...payload,
        id: 200,
      }));
      let lessonId = 1000;
      lessonRepository.save.mockImplementation(async (payload: any) => ({
        ...payload,
        id: lessonId++,
      }));
      enrolmentRepository.findOne.mockResolvedValue({
        id: 200,
        course: { id: 100 },
      });
      studentEnrolmentTransformationService.transformEnrolmentToDto.mockReturnValue(
        { id: 200 },
      );
      programRepository.findOne.mockResolvedValue({ id: 8, type: 1 });
      programPresentation.isClassified.mockReturnValue(true);
      programPresentation.pricingCategoryFor.mockReturnValue('standard');
      pricingResolver.resolve.mockResolvedValue({ hourlyRate: '72.50' });

      return createDto({
        startDate: '2026-09-01',
        lessonsCount: 4,
        programRate: 65,
        discountedRatePerMonth: 120,
      });
    }
  });
});

/**
 * The final lessons of a long course land after the estimated course end,
 * because the generator skips holidays by adding another week each time. They
 * are covered by no planned period, and used to take the submitted - August -
 * rate, billing September lessons at the pre-cutover price.
 *
 * Observed on dev 2026-08-19: enrolments 33560 and 33561 had their last 7 and
 * 4 lessons at $65.00 instead of $87.50.
 */
describe('rateForDay, past the last planned period', () => {
  const rateForDay = (
    rates: Array<{ startDate: string; endDate: string; programRate: number }>,
    day: string,
    fallback: number,
  ) =>
    (
      StudentEnrolmentService.prototype as unknown as {
        rateForDay: (
          r: typeof rates,
          d: string,
          f: number,
        ) => number;
      }
    ).rateForDay.call({}, rates, day, fallback);

  const split = [
    { startDate: '2026-08-24', endDate: '2026-08-31', programRate: 65 },
    { startDate: '2026-09-01', endDate: '2028-07-30', programRate: 87.5 },
  ];

  it('prices a day inside the first period at the old rate', () => {
    expect(rateForDay(split, '2026-08-25', 65)).toBe(65);
  });

  it('prices a day inside the second period at the new rate', () => {
    expect(rateForDay(split, '2027-01-11', 65)).toBe(87.5);
  });

  it('prices a day past the last period at the LAST rate, not the submitted one', () => {
    // The bug: this returned 65 - the August rate - on a September lesson.
    expect(rateForDay(split, '2028-08-26', 65)).toBe(87.5);
  });

  it('does not depend on the order the periods are given in', () => {
    const reversed = [...split].reverse();
    expect(rateForDay(reversed, '2028-08-26', 65)).toBe(87.5);
  });

  it('still uses the submitted rate when there are no periods at all', () => {
    expect(rateForDay([], '2028-08-26', 65)).toBe(65);
  });

  it('leaves a single-period course alone', () => {
    const one = [
      { startDate: '2026-08-24', endDate: '2028-07-30', programRate: 65 },
    ];
    expect(rateForDay(one, '2028-08-26', 65)).toBe(65);
  });
});
