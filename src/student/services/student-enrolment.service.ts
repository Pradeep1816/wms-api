import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentRepository } from '../repositories/student.repository';
import { StudentEnrolmentsRequestDto } from '../dto/student-enrolments-request.dto';
import {
  StudentEnrolmentsDataDto,
  StudentEnrolmentDto,
} from '../dto/student-enrolments-response.dto';
import { EnrolmentStudentRepository } from '../../enrolment/repositories/enrolment-student.repository';
import { StudentEnrolmentTransformationService } from './transformations/student-enrolment-transformation.service';
import { Course } from '../../course/entities/course.entity';
import { CourseSchedule } from '../../course/entities/course-schedule.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { PaymentFrequency } from '../../payment/entities/payment-frequency.entity';
import { EnrolmentPaymentFrequency } from '../../enrolment/entities/enrolment-payment-frequency.entity';
import { CourseProgramRate } from '../../course/entities/course-program-rate.entity';
import { EnrolmentDiscount } from '../../enrolment/entities/enrolment-discount.entity';
import { CreateStudentEnrolmentDto } from '../dto/create-student-enrolment.dto';
import {
  getWeekdaysList,
  parseLocalDateTime,
  calculateLessonTotal,
  isProfessionalDevelopmentDay,
  getCurrentESTDate,
} from '../../utils/date-utils';
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { LessonRepository } from '../../lesson/repositories/lesson.repository';
import { Holiday } from '../../holiday/entities/holiday.entity';
import { Program } from '../../program/entities/program.entity';
import { PricingResolverService } from '../../pricing/services/pricing-resolver.service';
import { RoundingUtils } from '../../utils/rounding.utils';
import { ProgramPresentationService } from '../../pricing/services/program-presentation.service';
import { CourseRateResolverService } from '../../pricing/services/course-rate-resolver.service';
import {
  DEFAULT_PRICING_TIER,
  EnrolmentTierService,
} from '../../pricing/services/enrolment-tier.service';
import { SEPTEMBER_2026_EFFECTIVE_FROM } from '../../pricing/constants/september-2026-tuition';
import { PricingRolloutService } from '../../pricing/services/pricing-rollout.service';

@Injectable()
export class StudentEnrolmentService {
  constructor(
    private readonly studentRepository: StudentRepository,
    private readonly enrolmentStudentRepository: EnrolmentStudentRepository,
    private readonly studentEnrolmentTransformationService: StudentEnrolmentTransformationService,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(CourseSchedule)
    private readonly courseScheduleRepository: Repository<CourseSchedule>,
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    @InjectRepository(PaymentFrequency)
    private readonly paymentFrequencyRepository: Repository<PaymentFrequency>,
    @InjectRepository(EnrolmentPaymentFrequency)
    private readonly enrolmentPaymentFrequencyRepository: Repository<EnrolmentPaymentFrequency>,
    @InjectRepository(CourseProgramRate)
    private readonly courseProgramRateRepository: Repository<CourseProgramRate>,
    @InjectRepository(EnrolmentDiscount)
    private readonly enrolmentDiscountRepository: Repository<EnrolmentDiscount>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(Holiday)
    private readonly holidayRepository: Repository<Holiday>,
    private readonly lessonRepo: LessonRepository,
    // Appended last on purpose: this service's spec constructs it positionally,
    // so inserting a parameter earlier silently shifts every mock along one.
    @InjectRepository(Program)
    private readonly programRepository: Repository<Program>,
    private readonly pricingResolver: PricingResolverService,
    private readonly programPresentation: ProgramPresentationService,
    private readonly courseRateResolver: CourseRateResolverService,
    private readonly enrolmentTier: EnrolmentTierService,
    private readonly rollout: PricingRolloutService,
  ) {}

  async getEnrolmentsByStudentId(
    locationId: number,
    locationSlug: string,
    studentId: number,
    query: StudentEnrolmentsRequestDto,
  ): Promise<StudentEnrolmentsDataDto> {
    try {
      // Get student
      const student = await this.studentRepository.findStudentByIdAndLocation(
        studentId,
        locationId,
      );
      if (!student) {
        throw new NotFoundException(
          `student with ID ${studentId} not found in location ${locationSlug}`,
        );
      }

      // Get enrolments with pagination
      const { enrolments, total } =
        await this.enrolmentStudentRepository.getEnrolmentsByStudentId(
          studentId,
          locationId,
          query.page,
          query.limit,
          query.showAll ?? false,
        );

      // Transform enrolments to DTOs using transformation service
      const { page = 1, limit = 20 } = query;
      const enrolmentTransformData =
        this.studentEnrolmentTransformationService.transformEnrolmentsData(
          enrolments,
          total,
          page,
          limit,
        );

      return enrolmentTransformData;
    } catch (error) {
      console.error('Error in getEnrolmentsByStudentId service:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to retrieve student enrolments: ${error.message}`,
      );
    }
  }

  /**
   * A classified program must be given a tier.
   *
   * `pricingTier` is optional on the DTO because most programs have no tier -
   * a group course, or anything the client never classified. It cannot be
   * required there, because whether it applies depends on the program, which
   * class-validator cannot see. So the rule lives here.
   *
   * ## Why this is a rejection rather than a default
   *
   * `resolveCatalogueRate` falls back to tier 1 when none is supplied. That
   * was the right call while a migration was going to set every tier and
   * erring cheap was the safe direction across 2,829 accounts. It is the
   * wrong one now: the tier is the entire pricing mechanism, so a forgotten
   * tier is a silent undercharge for the life of the enrolment - $290.00
   * instead of $350.00 or $410.00 on a Standard 60-minute, with no error and
   * nothing flagged. Note it does not fall back to the *old* rate; it still
   * writes a September catalogue rate, just the cheapest one.
   *
   * Only applies where the structure is live. Outside the rollout no
   * catalogue rate is resolved at all, so demanding a tier would reject
   * enrolments the pricing never touches.
   */
  private async assertTierSuppliedIfRequired(
    locationId: number,
    programId: number,
    pricingTier?: number,
    keepsPreviousRate?: boolean,
    previousRateReason?: string,
  ): Promise<void> {
    // A tier and the previous rate are opposite answers to the same question.
    // Resolving the contradiction either way would silently overrule whoever
    // filled the form in, and the two outcomes differ by $90 a month.
    if (pricingTier && keepsPreviousRate) {
      throw new BadRequestException(
        'Choose either a pricing tier or the previous rate, not both.',
      );
    }

    if (keepsPreviousRate && !previousRateReason?.trim()) {
      throw new BadRequestException(
        'Give a reason for keeping the previous rate.',
      );
    }

    if (pricingTier || keepsPreviousRate) {
      return;
    }

    if (!(await this.rollout.isEnabledForLocation(locationId))) {
      return;
    }

    const program = await this.programRepository.findOne({
      where: { id: programId },
    });

    if (!program || !this.programPresentation.isTierable(program)) {
      return;
    }

    throw new BadRequestException(
      'A pricing tier is required for this program. Choose tier 1, 2 or 3, ' +
        'or keep the previous rate and say why.',
    );
  }

  /**
   * The catalogue rate for a program on a given date, or `null` when the
   * catalogue has no answer.
   *
   * `null` is the gate that keeps every existing behaviour intact: an
   * unclassified program, a lesson length outside 30/45/60, or a date before
   * the new structure begins all leave the caller's own rate in place.
   */
  private async resolveCatalogueRate(
    locationId: number,
    programId: number,
    duration: string,
    effectiveDate: string,
    pricingTier?: number,
    keepsPreviousRate?: boolean,
  ): Promise<number | null> {
    // Grandfathering, and the reason it has to be checked *here* as well as in
    // the guard. Below, a missing tier falls back to tier 1 rather than to the
    // old rate - so without this line an enrolment that skipped the tier
    // because it keeps the previous rate would still be handed a September
    // catalogue rate from 1 September, at the cheapest tier. It would look
    // grandfathered on the record and bill the new price.
    if (keepsPreviousRate) {
      return null;
    }

    // The rollout gate. Until a location is in the pilot, no catalogue rate
    // is resolved for it and the caller keeps the rate it submitted - which
    // is exactly the behaviour every location had before this existed.
    if (!(await this.rollout.isEnabledForLocation(locationId))) {
      return null;
    }

    const program = await this.programRepository.findOne({
      where: { id: programId },
    });

    // `isTierable`, not `isClassified` - a marker-prefixed program holds a
    // frozen older sheet and keeps the rate it already carries.
    if (!program || !this.programPresentation.isTierable(program)) {
      return null;
    }

    const [hoursRaw = '0', minutesRaw = '0'] = duration.split(':');
    const durationMinutes =
      (Number(hoursRaw) || 0) * 60 + (Number(minutesRaw) || 0);

    try {
      const resolved = await this.pricingResolver.resolve({
        locationId,
        pricingCategory: this.programPresentation.pricingCategoryFor(program),
        // The tier staff chose. Falls back to tier 1 only when the caller sent
        // none, which is the cheapest price - a missing tier under-charges
        // rather than billing someone more than they were quoted.
        pricingTier: pricingTier ?? DEFAULT_PRICING_TIER,
        durationMinutes,
        termMonths: 1,
        effectiveDate,
        programType: program.type,
      });

      return Number(resolved.hourlyRate);
    } catch {
      // The resolver fails closed by design. Here that means "no catalogue
      // answer", which is a fallback rather than an error.
      return null;
    }
  }

  /**
   * The planned rate covering a day.
   *
   * ## Why a day past the last period takes the last period's rate
   *
   * The periods are planned from the course end date, which is an estimate -
   * start plus `lessonsCount` weeks, rounded to the month end. The lesson loop
   * then skips holidays and professional-development days by adding another
   * week each time, so the real last lessons land *after* that estimate and are
   * covered by no period at all.
   *
   * Those lessons used to fall back to `dto.programRate`, which is the rate the
   * wizard submitted - the **pre-September** one. On a course that crosses the
   * cutover that is the wrong end of the split: the final lessons, which belong
   * to the September period, were billed at the August price. Observed on dev
   * 2026-08-19 on enrolments 33560 and 33561, where the last 7 and 4 lessons
   * priced at $65.00 instead of $87.50.
   *
   * The caller already stretches the stored period to cover the real last
   * lesson, but that runs *after* the lessons are written, so it repairs the
   * row and leaves the money wrong. Resolving it here fixes the lessons
   * themselves, which is what the customer is billed from.
   *
   * A day *before* the first period cannot occur - lessons start on the course
   * start date - so that case still takes the submitted rate.
   */
  private rateForDay(
    plannedRates: Array<{
      startDate: string;
      endDate: string;
      programRate: number;
    }>,
    day: string,
    fallbackRate: number,
  ): number {
    const covering = plannedRates.find(
      (planned) => planned.startDate <= day && day <= planned.endDate,
    );

    if (covering) {
      return covering.programRate;
    }

    // Chosen by latest end date rather than by position, so this does not
    // depend on the planner's ordering.
    const latest = plannedRates.reduce<
      { startDate: string; endDate: string; programRate: number } | null
    >(
      (furthest, planned) =>
        furthest === null || planned.endDate > furthest.endDate
          ? planned
          : furthest,
      null,
    );

    if (latest && day > latest.endDate) {
      return latest.programRate;
    }

    return fallbackRate;
  }

  /**
   * Create a new private enrolment for a student.
   * This mirrors the legacy multi-step wizard but is implemented as a single
   * transactional operation.
   */
  async createEnrolment(
    locationId: number,
    locationSlug: string,
    studentId: number,
    dto: CreateStudentEnrolmentDto,
    loggedUserId: number,
  ): Promise<StudentEnrolmentDto> {
    try {
      // Ensure student exists in this location
      const student = await this.studentRepository.findStudentByIdAndLocation(
        studentId,
        locationId,
      );
      if (!student) {
        throw new NotFoundException(
          `student with ID ${studentId} not found in location ${locationSlug}`,
        );
      }

      // Resolve payment frequency by name
      const paymentFrequency = await this.paymentFrequencyRepository.findOne({
        where: { name: dto.paymentFrequency },
      });
      if (!paymentFrequency) {
        throw new BadRequestException(
          `Invalid payment frequency: ${dto.paymentFrequency}`,
        );
      }

      await this.assertTierSuppliedIfRequired(
        locationId,
        dto.programId,
        dto.pricingTier,
        dto.keepsPreviousRate,
        dto.previousRateReason,
      );

      // Compute course start/end dates
      // Use parseLocalDateTime to handle timezone correctly (treats input as exact time to store)
      // Format: "YYYY-MM-DD HH:mm:ss" - will be stored as UTC without timezone conversion
      // This ensures 9:00 PM EST is stored as 9:00 PM UTC (exact time, no conversion)
      let startDateTime: Date;
      try {
        const dateTimeString = `${dto.startDate} ${dto.startTime}:00`;
        startDateTime = parseLocalDateTime(dateTimeString);
      } catch (error) {
        throw new BadRequestException(
          `Invalid start date or time: ${error.message}`,
        );
      }

      const lessonsCount = dto.lessonsCount;
      const endDateCandidate = new Date(startDateTime);
      // Approximate legacy behaviour: add N weeks then move to end of that month
      endDateCandidate.setDate(endDateCandidate.getDate() + lessonsCount * 7);
      const endDate = new Date(
        endDateCandidate.getFullYear(),
        endDateCandidate.getMonth() + 1,
        0,
        23,
        59,
        59,
      );

      // Create course (unconfirmed, like legacy)
      const course = this.courseRepository.create({
        programId: dto.programId,
        teacherId: dto.teacherId,
        locationId,
        type: Course.TYPE_REGULAR,
        startDate: startDateTime,
        endDate,
        isConfirmed: 0,
        lessonsCount,
        isOnline: dto.isOnline ? 1 : 0,
        createdByUserId: loggedUserId,
        updatedByUserId: loggedUserId,
        isDeleted: false,
      });
      const savedCourse = await this.courseRepository.save(course);

      // Map day name to weekday number (1-7)
      const weekdays = getWeekdaysList();
      const weekdayEntry = Object.entries(weekdays).find(
        ([, name]) => name.toLowerCase() === dto.day.toLowerCase(),
      );
      if (!weekdayEntry) {
        throw new BadRequestException(`Invalid day: ${dto.day}`);
      }
      const dayNumber = Number(weekdayEntry[0]);

      const lessonDurationTime =
        dto.duration.length === 5 ? `${dto.duration}:00` : dto.duration;
      // Lesson length in hours. Needed to turn a per-hour rate into what one
      // lesson costs, which is the basis the flat discount has to be held
      // against when the rate changes mid-enrolment.
      const [durationHours = '0', durationMinutes = '0'] =
        lessonDurationTime.split(':');
      const lessonUnit =
        ((Number(durationHours) || 0) * 60 + (Number(durationMinutes) || 0)) / 60;
      const fromTime =
        dto.startTime.length === 5 ? `${dto.startTime}:00` : dto.startTime;

      // Create course schedule
      const courseSchedule = this.courseScheduleRepository.create({
        courseId: savedCourse.id,
        day: dayNumber,
        fromTime,
        duration: lessonDurationTime,
        startDate: startDateTime,
        endDate,
        teacherId: dto.teacherId,
        isRecent: true,
      });
      await this.courseScheduleRepository.save(courseSchedule);

      const now = getCurrentESTDate();

      // Create enrolment
      const enrolment = this.enrolmentRepository.create({
        courseId: savedCourse.id,
        studentId,
        isDeleted: false,
        endDateTime: endDate,
        paymentFrequencyId: paymentFrequency.id,
        isConfirmed: 0,
        isAutoRenew: dto.autoRenew ? 1 : 0,
        isOnline: dto.isOnline ? 1 : 0,
        createdByUserId: loggedUserId,
        updatedByUserId: loggedUserId,
        isEnableInfo: false,
        isEnableRescheduleInfo: false,
        // Grandfathering, recorded on the row rather than inferred from the
        // absence of a tier. Approved by Arcadia on 2026-08-18 for students
        // who commit before September; the guard above has already refused a
        // blank reason, so these three are populated together or not at all.
        keepsPreviousRate: Boolean(dto.keepsPreviousRate),
        previousRateReason: dto.keepsPreviousRate
          ? (dto.previousRateReason?.trim() ?? null)
          : null,
        previousRateApprovedByUserId: dto.keepsPreviousRate
          ? loggedUserId
          : null,
        previousRateApprovedOn: dto.keepsPreviousRate ? now : null,
        createdAt: now,
        updatedAt: now,
      });
      const savedEnrolment = await this.enrolmentRepository.save(enrolment);

      // Record the tier, and record whether a person chose it.
      //
      // `change` clears `pricingTierIsDefaulted`, which is right for a staff
      // selection; `assign` with `isDefaulted` is right for digital enrolment,
      // which quotes at tier 1 because a parent is never asked about tiers.
      // The distinction is the whole point of the flag: it is what puts a
      // defaulted enrolment on the location's review report instead of letting
      // the cheapest price disappear into the population.
      if (dto.pricingTier) {
        if (dto.pricingTierIsDefaulted) {
          await this.enrolmentTier.assign({
            enrolmentId: savedEnrolment.id,
            tier: dto.pricingTier,
            effectiveFrom: dto.startDate,
            reason: 'Defaulted when the enrolment was created',
            changedByUserId: loggedUserId,
            isDefaulted: true,
          });
        } else {
          await this.enrolmentTier.change({
            enrolmentId: savedEnrolment.id,
            tier: dto.pricingTier,
            effectiveFrom: dto.startDate,
            reason: 'Selected when the enrolment was created',
            changedByUserId: loggedUserId,
          });
        }
      }

      // Create course program rate (used by legacy for lesson pricing).
      //
      // One row used to cover the whole course, which prices September lessons
      // at August's rate as soon as a course crosses 1 September 2026. The
      // migration does not close this gap - it stages rates for enrolments that
      // already existed - so anything created between now and the cutover would
      // otherwise be minted on old pricing and stay there.
      const courseStartDay = savedCourse.startDate.toISOString().slice(0, 10);
      const courseEndDay = savedCourse.endDate.toISOString().slice(0, 10);
      const cutoverRate = await this.resolveCatalogueRate(
        locationId,
        dto.programId,
        lessonDurationTime,
        SEPTEMBER_2026_EFFECTIVE_FROM,
        dto.pricingTier,
        dto.keepsPreviousRate,
      );
      const plannedRates = this.courseRateResolver.planNewCourseRateRows(
        courseStartDay,
        courseEndDay,
        dto.programRate,
        SEPTEMBER_2026_EFFECTIVE_FROM,
        cutoverRate,
      );

      for (const planned of plannedRates) {
        const cpr = this.courseProgramRateRepository.create({
          courseId: savedCourse.id,
          startDate: new Date(planned.startDate),
          endDate: new Date(planned.endDate),
          programRate: planned.programRate,
          applyFullDiscount: false,
        });
        await this.courseProgramRateRepository.save(cpr);
      }

      // Create enrolment payment frequency record
      const paymentCycleStart = new Date(dto.paymentCycleEffectiveDate);
      if (Number.isNaN(paymentCycleStart.getTime())) {
        throw new BadRequestException('Invalid payment cycle start date');
      }

      const enrolmentPaymentFrequency =
        this.enrolmentPaymentFrequencyRepository.create({
          enrolmentId: savedEnrolment.id,
          paymentFrequencyId: paymentFrequency.id,
          paymentCycleStartDate: paymentCycleStart,
          createdOn: now,
          updatedOn: now,
          createdByUserId: loggedUserId,
          updatedByUserId: loggedUserId,
          isDeleted: false,
        });
      await this.enrolmentPaymentFrequencyRepository.save(
        enrolmentPaymentFrequency,
      );

      // Persist enrolment discounts like legacy enrolment_discount
      const multiEnrol = dto.multipleEnrolDiscount ?? 0;
      const pfDiscount = dto.paymentFrequencyDiscount ?? 0;

      if (multiEnrol) {
        const multiDiscount = this.enrolmentDiscountRepository.create({
          enrolmentId: savedEnrolment.id,
          discount: multiEnrol,
          // The screen computes this as a monthly dollar amount - it divides by
          // four to get a per-lesson figure - so it must be stored as dollars.
          // The constants are used rather than literals because the two sides
          // are inverted: dollar is 1 on an enrolment discount and 0 on a
          // lesson discount, which is what made this easy to get backwards.
          discountType: EnrolmentDiscount.VALUE_TYPE_DOLLAR,
          type: EnrolmentDiscount.TYPE_MULTIPLE_ENROLMENT,
        });
        await this.enrolmentDiscountRepository.save(multiDiscount);
      }

      if (pfDiscount) {
        const pfEnrolDiscount = this.enrolmentDiscountRepository.create({
          enrolmentId: savedEnrolment.id,
          discount: pfDiscount,
          // The screen applies this as a percentage of the lesson price.
          discountType: EnrolmentDiscount.VALUE_TYPE_PERCENTAGE,
          type: EnrolmentDiscount.TYPE_PAYMENT_FREQUENCY,
        });
        await this.enrolmentDiscountRepository.save(pfEnrolDiscount);
      }

      // Create lessons for the enrolment (one per week, matching legacy behavior)
      let lastLessonDate = startDateTime;
      let currentLessonDate = dayjs.utc(startDateTime);

      // Get teacher rate once (legacy fallback to 0 when teacher qualification is missing)
      const teacherRate =
        (await this.lessonRepo.getTeacherRate(dto.teacherId, dto.programId)) ||
        0;

      // Helper function to check if a date is a holiday (matching legacy isHolidayLesson logic)
      // Legacy: Holiday::find()->notDeleted()->andWhere(['DATE(date)' => date])->all()
      const isHolidayDate = async (date: Date): Promise<boolean> => {
        const dateOnly = dayjs.utc(date).format('YYYY-MM-DD');

        // Check if any holiday matches the date (comparing date part only, matching legacy DATE(date) comparison)
        const holidays = await this.holidayRepository
          .createQueryBuilder('holiday')
          .where('holiday.isDeleted = :isDeleted', { isDeleted: false })
          .andWhere('DATE(holiday.date) = :date', { date: dateOnly })
          .getMany();

        return holidays.length > 0;
      };

      for (let i = 0; i < lessonsCount; i++) {
        // For the first lesson, use the start date
        // For subsequent lessons, add 7 days from the previous lesson date
        if (i > 0) {
          currentLessonDate = currentLessonDate.add(7, 'day');

          // Check if this date is a professional development day (5th occurrence of weekday)
          // If so, skip it by adding another 7 days (matching legacy behavior)
          if (isProfessionalDevelopmentDay(currentLessonDate.toDate())) {
            currentLessonDate = currentLessonDate.add(7, 'day');
          }

          // Check if this date is a holiday
          // If so, skip it by adding another 7 days (matching legacy behavior)
          // Note: Legacy doesn't check holidays during creation, but we're adding it for better UX
          const isHoliday = await isHolidayDate(currentLessonDate.toDate());
          if (isHoliday) {
            currentLessonDate = currentLessonDate.add(7, 'day');
          }
        }

        const lessonDate = currentLessonDate.toDate();

        // Format dueDate as the lesson date (YYYY-MM-DD) - set to midnight UTC
        const dueDate = dayjs.utc(lessonDate).startOf('day').toDate();

        const now = getCurrentESTDate();

        // Each lesson carries the rate in force on its own date, so a course
        // spanning the cutover bills August lessons at the old price and
        // September lessons at the new one.
        const lessonDay = dayjs.utc(lessonDate).format('YYYY-MM-DD');
        const lessonProgramRate = this.rateForDay(
          plannedRates,
          lessonDay,
          dto.programRate,
        );
        // `total` is not cosmetic: lesson confirmation copies it into
        // private_lesson.total and balance, so it is what the customer owes. It
        // has to move with the rate, or the balance and the invoice line -
        // which is computed from programRate - would disagree.
        //
        // ## Why this is not simply `submitted x lessonRate / formRate`
        //
        // It was, until 2026-08-24. That scaled the WHOLE discounted figure,
        // including any flat-dollar part, so a $5.00 multiple-enrolment discount
        // on a $65.00 form rate became $5.58 once the lesson was re-rated to
        // $72.50. The lesson then stored a total the cascade disagrees with -
        // the Totals panel showed a subtotal of $33.95 against a total of
        // $33.81 - and the difference was silently in the customer's favour.
        //
        // A percentage scales with the rate; a flat amount does not. So the flat
        // part is taken out before scaling and put back afterwards, which is
        // also what the enrolment-detail screen does when a discount is removed
        // and re-added - the path that always produced the right answer.
        //
        // Any percentage the UI applied still survives exactly, including the
        // customer discount, which is folded into `discountedRatePerMonth` and
        // never sent as a field. That is why this rescales the submitted figure
        // rather than recomputing the cascade from the DTO: recomputing would
        // drop the customer discount and OVERCHARGE.
        const submittedTotal = dto.discountedRatePerMonth / 4;
        const flatPerLesson = (dto.multipleEnrolDiscount ?? 0) / 4;
        const formPerLesson = dto.programRate * lessonUnit;
        const lessonPerLesson = lessonProgramRate * lessonUnit;
        const scalableBase = formPerLesson - flatPerLesson;

        const lessonTotal =
          dto.programRate > 0 && scalableBase > 0
            ? ((lessonPerLesson - flatPerLesson) * submittedTotal) / scalableBase
            : submittedTotal;

        const lesson = this.lessonRepository.create({
          courseId: savedCourse.id,
          teacherId: dto.teacherId,
          date: lessonDate,
          duration: lessonDurationTime,
          status: LessonStatusEnum.SCHEDULED, // status=2 (SCHEDULED) matching legacy
          isPresent: true, // isPresent=1 matching legacy
          isDeleted: false,
          isConfirmed: false, // isConfirmed=0 matching legacy
          type: 1, // type=1 (regular lesson, not extra) matching legacy
          isExploded: 0, // 0 = false matching legacy
          isOnline: dto.isOnline, // boolean
          createdByUserId: loggedUserId,
          updatedByUserId: loggedUserId,
          programRate: lessonProgramRate, // number (decimal)
          teacherRate: teacherRate, // Missing qualification rate defaults to 0 via repository lookup
          teacherRateOld: 0,
          tax: 0,
          // Use discountedRatePerMonth from UI: per lesson price =
          // discountedRatePerMonth / 4, rescaled above when this lesson falls
          // on the far side of the cutover
          total: RoundingUtils.roundDecimal(lessonTotal, 2),
          dueDate,
          paidStatus: 0,
          originalDate: lessonDate, // Set originalDate = date (will be updated after save)
          createdOn: now,
          updatedOn: now,
        });

        const savedLesson = await this.lessonRepository.save(lesson);

        // Update originalDate after save (matching legacy UPDATE queries)
        await this.lessonRepository.update(
          { id: savedLesson.id },
          { originalDate: lessonDate },
        );

        lastLessonDate = lessonDate;
      }

      // Update course endDate to match the last lesson date (matching legacy UPDATE)
      await this.courseRepository.update(
        { id: savedCourse.id },
        { endDate: lastLessonDate },
      );

      // ...and stretch the final rate period to match, or the lessons past the
      // original estimate are covered by no period at all and fall back to the
      // program's flat rate.
      //
      // The course end written above is an estimate - start plus lessonsCount
      // weeks, rounded to the month end - but the lesson loop skips holidays and
      // professional-development days by adding another week each time, so the
      // real last lesson lands later. Found 2026-08-12 driving the wizard: a
      // 96-lesson enrolment ended its rate period on 2028-07-30 while lessons
      // ran to 2028-08-26, and the last four priced at $65.00 instead of $87.50.
      const latestRate = await this.courseProgramRateRepository.findOne({
        where: { courseId: savedCourse.id },
        order: { startDate: 'DESC', id: 'DESC' },
      });

      if (latestRate && new Date(latestRate.endDate) < lastLessonDate) {
        await this.courseProgramRateRepository.update(
          { id: latestRate.id },
          { endDate: lastLessonDate },
        );
      }

      // Reload with relations required for transformation
      const loadedEnrolment = await this.enrolmentRepository.findOne({
        where: { id: savedEnrolment.id },
        relations: [
          'course',
          'course.program',
          'course.courseSchedule',
          'course.teacher',
          'course.teacher.profile',
          'course.lessons',
          'course.lessons.teacher',
          'course.lessons.teacher.profile',
        ],
      });

      if (!loadedEnrolment) {
        throw new NotFoundException('Failed to load created enrolment');
      }

      return this.studentEnrolmentTransformationService.transformEnrolmentToDto(
        loadedEnrolment,
      );
    } catch (error) {
      console.error('Error in createEnrolment service:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      // Anything reaching here is a fault on our side - a failed write, a
      // missing relation - not something the caller can correct. It was
      // previously wrapped as a BadRequestException, which was harmless only
      // because the controller matched on the message and turned it back into a
      // 500. Now that the controller honours the exception type, wrapping an
      // internal fault as "bad request" would tell staff they had mistyped
      // something and would echo the underlying error to them. The detail is
      // logged above; the caller gets a 500 and no internals.
      throw new InternalServerErrorException(
        'Failed to create student enrolment',
      );
    }
  }
}
