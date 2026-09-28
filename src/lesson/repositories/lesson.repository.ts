import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { getCurrentESTDate } from '../../utils/date-utils';
import { Lesson } from '../entities/lesson.entity';
import { Location } from '../../location/entities/location.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { Course } from '../../course/entities/course.entity';
import { Student } from '../../student/entities/student.entity';
import { CourseType } from '../../course/enums/course-type';
import { LessonStatusEnum } from '../enums/lesson-status';
import { CourseProgramRate } from '../../course/entities/course-program-rate.entity';
import { PrivateLesson } from '../entities/private-lesson.entity';
import { LessonHierarchy } from '../entities/lesson-hierarchy.entity';
import { LessonPayment } from '../entities/lesson-payment.entity';
import { CourseSchedule } from '../../course/entities/course-schedule.entity';
import { Qualification } from '../../qualification/entities/qualification.entity';
import { Program } from '../../program/entities/program.entity';
import { Payment } from '../../payment/entities/payment.entity';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { CourseExtra } from '../../course/entities/course-extra.entity';
import { RoundingUtils } from '../../utils/rounding.utils';
import { LessonDiscount } from '../entities/lesson-discount.entity';

export interface ExplodedLessonLineageRow {
  lessonId: number | string;
  explodedParentId: number | string;
  explodedBranchId: number | string;
  explodedBranchDate: Date | string;
  parentDuration: string;
  descendantDepth: number | string;
  splitCount: number | string;
}

@Injectable()
export class LessonRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(CourseProgramRate)
    private readonly courseProgramRateRepository: Repository<CourseProgramRate>,
    @InjectRepository(PrivateLesson)
    private readonly privateLessonRepository: Repository<PrivateLesson>,
    @InjectRepository(LessonHierarchy)
    private readonly lessonHierarchyRepository: Repository<LessonHierarchy>,
    @InjectRepository(CourseSchedule)
    private readonly courseScheduleRepository: Repository<CourseSchedule>,
    @InjectRepository(Qualification)
    private readonly qualificationRepository: Repository<Qualification>,
    @InjectRepository(Program)
    private readonly programRepository: Repository<Program>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(CourseExtra)
    private readonly courseExtraRepository: Repository<CourseExtra>,
  ) {}


  /**
   * Find lesson by ID with all relations
   */
  async findLessonById(lessonId: number, locationId: number): Promise<any> {
    return await this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.course', 'course')
      .leftJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('course.enrolments', 'enrolments')
      .leftJoinAndSelect('enrolments.student', 'student')
      .leftJoinAndSelect('student.user', 'user')
      .leftJoinAndSelect('user.customerAccount', 'customerAccount')
      .leftJoinAndSelect('lesson.privateLesson', 'privateLesson')
      .leftJoinAndSelect('lesson.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'teacherProfile')
      .leftJoinAndSelect('lesson.classroom', 'classroom')
      .leftJoinAndSelect('lesson.lessonHierarchy', 'lessonHierarchy')
      .leftJoinAndSelect('lessonHierarchy.lesson', 'rootLesson')
      .leftJoinAndSelect('lesson.bulkRescheduleLesson', 'bulkRescheduleLesson')
      .leftJoinAndSelect('course.lessons', 'courseLessons')
      .where('lesson.id = :lessonId', { lessonId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('course.locationId = :locationId', { locationId})
      .getOne();
  }

  /**
   * Find student enrolment by programId and studentId
   */
  async findStudentEnrolmentByProgram(
    studentId: number,
    programId: number,
  ): Promise<Enrolment | null> {
    return await this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .leftJoinAndSelect('enrolment.course', 'course', 'course.isDeleted = FALSE')
      .where('enrolment.studentId = :studentId', { studentId })
      .andWhere('course.programId = :programId', { programId })
      .andWhere('course.isConfirmed = :courseIsConfirmed', { courseIsConfirmed: true })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      .getOne();
  }

  /**
   * Check for overlapping lessons (conflicts) for a student at a given time
   * Two datetime ranges overlap if: start1 < end2 AND start2 < end1
   */
  async checkLessonConflict(
    studentId: number,
    date: Date,
    duration: string,
    locationId: number,
    excludeLessonId?: number,
  ): Promise<Lesson | null> {
    // Format date as MySQL datetime string using UTC to match database storage
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    const dateTimeStr = `${dateStr} ${hours}:${minutes}:${seconds}`;

    const queryBuilder = this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoin('lesson.course', 'course', 'course.isDeleted = FALSE')
      .leftJoin('course.enrolments', 'enrolment')
      .where('lesson.status IN (:...statuses)', { statuses: [1, 2] }) // 1=RESCHEDULED, 2=SCHEDULED
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      // .andWhere('lesson.isPresent = :isPresent', { isPresent: true })
      .andWhere('DATE(lesson.date) = :dateStr', { dateStr })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      .andWhere('enrolment.studentId = :studentId', { studentId })
      .andWhere('enrolment.isConfirmed = :enrolmentIsConfirmed', { enrolmentIsConfirmed: true })
      .andWhere('enrolment.isDeleted = :enrolmentIsDeleted', { enrolmentIsDeleted: false })
      .andWhere(
        // Simplified overlap check: lesson.date < (new lesson end) AND (new lesson start) < (existing lesson end)
        `lesson.date < ADDTIME(:dateTime, :duration) AND :dateTime < ADDTIME(lesson.date, lesson.duration)`,
        { dateTime: dateTimeStr, duration }
      );

    if (excludeLessonId) {
      queryBuilder.andWhere('lesson.id != :excludeLessonId', { excludeLessonId });
    }

    const result = await queryBuilder.getOne();
    
    // Optional debug logging (uncomment if needed for debugging)
    // if (result) {
    //   console.log('[checkLessonConflict] Conflict found:', {
    //     conflictingLessonId: result.id,
    //     conflictingLessonDate: result.date,
    //     conflictingLessonDuration: result.duration,
    //   });
    // }

    return result;
  }

  /**
   * Find student by ID
   */
  async findStudentById(studentId: number, includeRelations: boolean = false): Promise<Student | null> {
    // For logging, we only need the student's basic info (firstName, lastName)
    // which is already in the Student entity, so we don't need to load relations
    return await this.studentRepository.findOne({
      where: { id: studentId },
    });
  }

  /**
   * Find regular course for student/program
   * Matches legacy: Course::getStudentRegularCourse()
   */
  async findStudentRegularCourse(
    studentId: number,
    programId: number,
    locationId: number,
  ): Promise<Course | null> {
    return await this.courseRepository
      .createQueryBuilder('course')
      .innerJoin('course.enrolments', 'enrolment')
      .where('course.programId = :programId', { programId })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.type = :type', { type: CourseType.REGULAR })
      .andWhere('course.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('course.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('enrolment.studentId = :studentId', { studentId })
      .andWhere('enrolment.isDeleted = :enrolmentIsDeleted', { enrolmentIsDeleted: false })
      .andWhere('enrolment.isConfirmed = :enrolmentIsConfirmed', { enrolmentIsConfirmed: true })
      .getOne();
  }

  /**
   * Preserve the legacy relationship between a student's regular course and
   * the separate course that owns their extra lessons.
   *
   * Legacy calls regularCourse->extendTo(extraCourse) when it first creates an
   * extra course. V2 previously found the regular course but skipped the
   * course_extra write, leaving the extra course detached. This method is also
   * run for an existing extra course so a later lesson creation repairs data
   * produced by the old V2 flow.
   */
  private async ensureExtraCourseLink(
    studentId: number,
    programId: number,
    locationId: number,
    extraCourseId: number,
  ): Promise<void> {
    const regularCourse = await this.findStudentRegularCourse(
      studentId,
      programId,
      locationId,
    );
    if (!regularCourse) {
      return;
    }

    const existingLinks = await this.courseExtraRepository.find({
      where: { extraCourseId },
      order: { id: 'ASC' },
    });

    // An extra course represents one extension. If it already has an active
    // owner, do not create a second relationship even if historical enrolment
    // data now makes a different regular course the first query result.
    if (existingLinks.some((link) => !link.isDeleted)) {
      return;
    }

    const deletedMatchingLink = existingLinks.find(
      (link) => link.courseId === regularCourse.id,
    );
    if (deletedMatchingLink) {
      await this.courseExtraRepository.update(
        { id: deletedMatchingLink.id },
        { isDeleted: false },
      );
      return;
    }

    const link = this.courseExtraRepository.create({
      courseId: regularCourse.id,
      extraCourseId,
      isDeleted: false,
    });
    await this.courseExtraRepository.save(link);
  }

  /**
   * Find or create extra course for student/program
   * Matches legacy: Course::checkExtraCourseExist() and getExtraCourse()
   */
  async findOrCreateExtraCourse(
    studentId: number,
    programId: number,
    teacherId: number,
    locationId: number,
    startDate: Date,
    programRate?: number,
  ): Promise<Course> {
    // Check if extra course exists for this student/program (matches legacy getExtraCourse)
    const existingCourse = await this.courseRepository
      .createQueryBuilder('course')
      .innerJoin('course.enrolments', 'enrolment')
      .where('course.programId = :programId', { programId })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.type = :type', { type: CourseType.EXTRA })
      .andWhere('course.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('course.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('enrolment.studentId = :studentId', { studentId })
      .andWhere('enrolment.isDeleted = :enrolmentIsDeleted', { enrolmentIsDeleted: false })
      .getOne();

    if (existingCourse) {
      await this.ensureExtraCourseLink(
        studentId,
        programId,
        locationId,
        existingCourse.id,
      );
      return existingCourse;
    }

    // Create new extra course
    // Calculate endDate dynamically: startDate + 23 months, then end of that month
    // Matches legacy: (new Carbon($this->startDate))->addMonths(23)->endOfMonth()
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 23);
    // Set to end of month (last day, 23:59:59)
    endDate.setMonth(endDate.getMonth() + 1, 0); // Move to next month, then day 0 = last day of previous month
    endDate.setHours(23, 59, 59, 999);
    
    const newCourse = this.courseRepository.create({
      programId,
      teacherId,
      locationId,
      startDate,
      endDate,
      type: CourseType.EXTRA,
      isConfirmed: 1,
      isDeleted: false,
      lessonsCount: 0,
      isOnline: 0,
    });

    const savedCourse = await this.courseRepository.save(newCourse);

    // Note: course_program_rate will be created later if needed (after getting rate from program)

    // Match legacy hasRegularCourse() + regularCourse->extendTo(extraCourse).
    await this.ensureExtraCourseLink(
      studentId,
      programId,
      locationId,
      savedCourse.id,
    );

    return savedCourse;
  }

  /**
   * Create course_program_rate record
   */
  async createCourseProgramRate(
    courseId: number,
    startDate: Date,
    programRate: number,
  ): Promise<CourseProgramRate> {
    // Get course to use its endDate (should already be calculated when course was created)
    const course = await this.courseRepository.findOne({
      where: { id: courseId },
      select: ['id', 'endDate'],
    });
    
    if (!course) {
      throw new Error(`Course with ID ${courseId} not found`);
    }
    
    // Use course endDate (already calculated dynamically in findOrCreateExtraCourse)
    // Fallback calculation if somehow missing (shouldn't happen)
    let endDate = course.endDate;
    if (!endDate) {
      // Calculate endDate: startDate + 23 months, then end of that month
      // Matches legacy: (new Carbon($this->startDate))->addMonths(23)->endOfMonth()
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 23);
      endDate.setMonth(endDate.getMonth() + 1, 0); // End of month
      endDate.setHours(23, 59, 59, 999);
    }
    
    const courseProgramRate = this.courseProgramRateRepository.create({
      courseId,
      startDate: new Date(startDate.toISOString().split('T')[0]),
      endDate: new Date(endDate.toISOString().split('T')[0]), // Date only (no time)
      programRate,
      applyFullDiscount: false,
    });

    return await this.courseProgramRateRepository.save(courseProgramRate);
  }

  /**
   * Create enrolment for extra course
   * Matches legacy: Course::createExtraLessonEnrolment()
   */
  async createExtraCourseEnrolment(
    courseId: number,
    studentId: number,
    loggedUserId: number,
  ): Promise<Enrolment> {
    const now = getCurrentESTDate();
    
    const enrolment = this.enrolmentRepository.create({
      courseId,
      studentId,
      isDeleted: false,
      isConfirmed: 1,
      paymentFrequencyId: 0, // Matches legacy: paymentFrequencyId = 0
      isAutoRenew: 0,
      isOnline: 0,
      createdByUserId: loggedUserId,
      updatedByUserId: loggedUserId,
      createdAt: now,
      updatedAt: now,
    });

    return await this.enrolmentRepository.save(enrolment);
  }

  /**
   * Create course schedule
   * Matches legacy: ExtraLesson::courseSchedule()
   */
  async createCourseSchedule(
    courseId: number,
    studentId: number,
    date: Date,
    duration: string,
  ): Promise<CourseSchedule> {
    // Get day of week (1=Monday, 7=Sunday) - matches legacy format('N')
    const dayOfWeek = date.getDay();
    const day = dayOfWeek === 0 ? 7 : dayOfWeek;

    // Format time as HH:mm:ss
    const fromTime = date.toTimeString().split(' ')[0];
    
    // Duration is already in HH:mm:ss format

    const courseSchedule = this.courseScheduleRepository.create({
      courseId,
      day,
      fromTime,
      duration,
      startDate: date,
      endDate: undefined,
      teacherId: undefined, // Can be set from course if needed
      isRecent: true,
    });

    return await this.courseScheduleRepository.save(courseSchedule);
  }

  /**
   * Get program rate from course_program_rate table
   * Matches legacy query 42: SELECT * FROM course_program_rate WHERE courseId=12334
   */
  /**
   * The student's REGULAR enrolment for a program, for pricing an extra lesson.
   *
   * Deliberately not `findStudentEnrolmentByProgram`, which also matches the
   * EXTRA course itself - the very course whose price is being decided.
   */
  async findRegularEnrolmentForPricing(
    studentId: number,
    programId: number,
    locationId: number,
  ): Promise<Enrolment | null> {
    return await this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .leftJoinAndSelect('enrolment.course', 'course')
      .leftJoinAndSelect('enrolment.paymentFrequency', 'paymentFrequency')
      .where('enrolment.studentId = :studentId', { studentId })
      .andWhere('enrolment.isDeleted = FALSE')
      .andWhere('course.programId = :programId', { programId })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.type = :type', { type: CourseType.REGULAR })
      .andWhere('course.isDeleted = FALSE')
      // A student can have overlapping regular enrolments for the same
      // program. Prefer one carrying an explicit pricing decision before the
      // longest-running unclassified enrolment; otherwise a tiered Vocal
      // enrolment can be hidden by an older $72.50 course that ends later.
      // Tier and "keep previous rate" are equally explicit: retain the prior
      // end-date ordering between them so this lookup cannot silently undo a
      // grandfathering decision.
      .orderBy(
        `CASE
          WHEN enrolment.pricingTier IS NOT NULL
            OR enrolment.keepsPreviousRate = TRUE THEN 0
          ELSE 1
        END`,
        'ASC',
      )
      .addOrderBy('course.endDate', 'DESC')
      .addOrderBy('enrolment.id', 'DESC')
      .getOne();
  }

  /**
   * The closest regular lesson carrying enrolment reductions that an extra
   * lesson should follow. Prefer the same duration so an ordinary add copies
   * the exact reductions; another duration is still a valid basis and is
   * scaled by ExtraLessonRateService.
   */
  async findRegularLessonWithEnrolmentDiscounts(
    enrolmentId: number,
    courseId: number,
    onDate: Date,
    duration: string,
    pricingTier: number,
  ): Promise<Lesson | null> {
    const day = onDate.toISOString().slice(0, 10);

    return await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoinAndSelect(
        'lesson.discounts',
        'discount',
        'discount.enrolmentId = :enrolmentId AND discount.type IN (:...discountTypes)',
        {
          enrolmentId,
          discountTypes: [
            LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
            LessonDiscount.TYPE_PREPAID_CYCLE,
            LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
          ],
        },
      )
      .where('lesson.courseId = :courseId', { courseId })
      .andWhere('lesson.isDeleted = FALSE')
      // A tier can be applied retroactively after older lessons have already
      // earned a different multiple-enrolment amount. Follow a lesson from the
      // current tier's effective period, even when the replacement lesson is
      // dated before staff recorded that pricing decision.
      .andWhere(
        `lesson.date >= COALESCE((
          SELECT tierChange.effectiveFrom
          FROM enrolment_tier_change tierChange
          WHERE tierChange.enrolmentId = :enrolmentId
            AND tierChange.newTier = :pricingTier
          ORDER BY tierChange.changedOn DESC, tierChange.id DESC
          LIMIT 1
        ), lesson.date)`,
        { pricingTier },
      )
      .setParameters({
        day,
        duration,
        prepaidType: LessonDiscount.TYPE_PREPAID_CYCLE,
      })
      .orderBy(
        'CASE WHEN discount.type = :prepaidType THEN 0 ELSE 1 END',
        'ASC',
      )
      .addOrderBy(
        'CASE WHEN lesson.duration = :duration THEN 0 ELSE 1 END',
        'ASC',
      )
      .addOrderBy('ABS(DATEDIFF(lesson.date, :day))', 'ASC')
      .addOrderBy('lesson.date', 'DESC')
      .addOrderBy('lesson.id', 'DESC')
      .getOne();
  }

  async createExtraLessonDiscount(input: {
    lessonId: number;
    enrolmentId: number;
    type: number;
    valueType: number;
    value: number;
  }): Promise<LessonDiscount> {
    const repository =
      this.lessonRepository.manager.getRepository(LessonDiscount);
    return await repository.save(repository.create(input));
  }

  /**
   * The rate a course charges on a given day.
   *
   * `getProgramRate` takes whichever row starts last regardless of the date
   * asked about, which is fine for a course with one row and wrong for a course
   * split across the September cutover.
   */
  async getProgramRateForDate(
    courseId: number,
    onDate: Date,
  ): Promise<number> {
    const day = onDate.toISOString().slice(0, 10);

    const rows = await this.courseProgramRateRepository
      .createQueryBuilder('rate')
      .where('rate.courseId = :courseId', { courseId })
      .andWhere('rate.startDate <= :day', { day })
      .orderBy('rate.startDate', 'DESC')
      .addOrderBy('rate.id', 'DESC')
      .limit(1)
      .getMany();

    return rows.length > 0 ? Number(rows[0].programRate) || 0 : 0;
  }

  async getProgramRate(courseId: number): Promise<number> {
    const courseProgramRate = await this.courseProgramRateRepository.findOne({
      where: { courseId },
      order: { startDate: 'DESC' },
    });
    return courseProgramRate?.programRate || 0;
  }

  /**
   * Get program rate from program table
   * Matches legacy: used when creating a new course and course_program_rate doesn't exist yet
   */
  async getProgramRateFromProgram(programId: number): Promise<number> {
    const program = await this.programRepository.findOne({
      where: { id: programId },
    });
    return program?.rate || 0;
  }

  /**
   * Get teacher rate from qualification
   * Matches legacy query 45: SELECT * FROM qualification WHERE teacher_id='6621' AND program_id=1
   */
  async getTeacherRate(teacherId: number, programId: number): Promise<number> {
    const qualification = await this.qualificationRepository.findOne({
      where: {
        teacherId,
        programId,
        isDeleted: false,
      },
    });
    return qualification?.rate || 0;
  }

  /**
   * Create lesson
   * Matches legacy query 49
   */
  async createLesson(
    courseId: number,
    teacherId: number,
    date: Date,
    duration: string,
    programId: number,
    locationId: number,
    isOnline: boolean,
    loggedUserId: number,
    programRate?: number, // Optional: if provided, use it; otherwise fetch from course
    status: LessonStatusEnum = LessonStatusEnum.UNSCHEDULED, // Allow caller to set status when needed
  ): Promise<Lesson> {
    // Get program rate from course_program_rate if not provided (matches legacy query 42)
    // If provided, use it (ensures correct rate even if course_program_rate wasn't set yet)
    const lessonProgramRate = programRate !== undefined && programRate > 0
      ? programRate
      : await this.getProgramRate(courseId);

    // Get teacher rate (matches legacy query 45)
    const teacherRate = await this.getTeacherRate(teacherId, programId);

    const now = getCurrentESTDate();
    
    // Format dueDate as today's date (YYYY-MM-DD) - matches legacy: (new \DateTime())->format('Y-m-d')
    // Use EST date for consistency with legacy system
    const dueDate = new Date(now.toISOString().split('T')[0]);
    
    // Create lesson with provided status (defaults to UNSCHEDULED to match legacy behaviour)
    const lesson = this.lessonRepository.create({
      courseId,
      teacherId,
      date,
      duration,
      status,
      isPresent: true, // Matches legacy query 49 - isPresent = 1
      isDeleted: false,
      isConfirmed: true,
      type: 2, // TYPE_EXTRA
      isExploded: 0,
      isOnline,
      createdByUserId: loggedUserId,
      updatedByUserId: loggedUserId,
      programRate: lessonProgramRate || 0,
      teacherRate,
      teacherRateOld: 0, // Matches legacy query 49
      tax: 0,
      total: 0,
      dueDate,
      paidStatus: 0,
      originalDate: date, // Set originalDate = date (matches legacy query 54)
      createdOn: now,
      updatedOn: now,
    });

    const savedLesson = await this.lessonRepository.save(lesson);
    
    // Note: originalDate is already set in the create() call above, no need for separate update

    return savedLesson;
  }

  /**
   * Make lesson as root (set up lesson hierarchy)
   * Matches legacy query 56: INSERT INTO lesson_hierarchy (lessonId, childLessonId, depth) VALUES (lessonId, lessonId, 0)
   */
  async makeLessonAsRoot(lessonId: number): Promise<void> {
    // Create hierarchy entry where lessonId = childLessonId and depth = 0
    const hierarchy = this.lessonHierarchyRepository.create({
      lessonId,
      childLessonId: lessonId,
      depth: 0,
    });
    await this.lessonHierarchyRepository.save(hierarchy);
  }

  /**
   * Create private lesson record
   * Matches legacy query 65: INSERT INTO private_lesson
   */
  async createPrivateLessonRecord(
    lessonId: number,
    date: Date,
    duration: string,
    providedProgramRate?: number,
    providedTax?: number,
    providedDiscount?: number,
  ): Promise<PrivateLesson> {
    // Use provided programRate and tax to avoid extra query
    // If not provided, fetch from lesson (fallback for backward compatibility)
    let lessonProgramRate = providedProgramRate ?? 0;
    let lessonTax = providedTax ?? 0;
    
    if (providedProgramRate === undefined || providedTax === undefined) {
      const lesson = await this.lessonRepository.findOne({
        where: { id: lessonId },
        select: ['id', 'programRate', 'tax'], // Explicitly select needed fields
      });

      if (!lesson) {
        throw new Error(`Lesson with ID ${lessonId} not found`);
      }
      
      if (providedProgramRate === undefined) {
        if (lesson.programRate != null) {
          const rateValue = Number(lesson.programRate);
          if (!isNaN(rateValue) && isFinite(rateValue)) {
            lessonProgramRate = rateValue;
          }
        }
      }
      
      if (providedTax === undefined) {
        if (lesson.tax != null) {
          const taxValue = Number(lesson.tax);
          if (!isNaN(taxValue) && isFinite(taxValue)) {
            lessonTax = taxValue;
          }
        }
      }
    }


    // Calculate expiry date (90 days from lesson date, matching legacy: modify('90 days'))
    const expiryDate = new Date(date);
    expiryDate.setDate(expiryDate.getDate() + 90);

    // Calculate unit (duration in hours) - matches legacy getUnit()
    const durationParts = duration.split(':');
    const hours = parseInt(durationParts[0] || '0', 10) || 0;
    const minutes = parseInt(durationParts[1] || '0', 10) || 0;
    const unit = (hours * 60 + minutes) / 60;
    
    // Ensure unit is a valid number
    if (isNaN(unit) || !isFinite(unit) || unit < 0) {
      throw new Error(`Invalid duration format: ${duration}`);
    }

    // Use the provided programRate and tax (ensure they are numbers)
    const programRate = Number(lessonProgramRate);
    const tax = Number(lessonTax);

    // Validate programRate and tax are valid numbers
    if (isNaN(programRate) || !isFinite(programRate)) {
      throw new Error(`Invalid programRate: ${lessonProgramRate}`);
    }
    if (isNaN(tax) || !isFinite(tax)) {
      throw new Error(`Invalid tax: ${lessonTax}`);
    }

    // Calculate grossPrice = programRate * unit (matches legacy getGrossPrice for private lessons)
    const grossPrice = RoundingUtils.roundDecimal(programRate * unit, 2);
    
    // Ensure grossPrice is a valid number
    if (isNaN(grossPrice) || !isFinite(grossPrice)) {
      console.error('Invalid grossPrice calculation:', {
        programRate,
        unit,
        lessonId,
      });
      throw new Error(`Invalid grossPrice calculation: programRate=${programRate}, unit=${unit}`);
    }

    // Calculate netPrice = grossPrice - discount + tax. Add Lesson persists its
    // payment-frequency reduction before this record, and passes the exact
    // dollar amount so the balance shown immediately matches invoicing.
    const discount = Math.max(0, Number(providedDiscount ?? 0) || 0);
    const netPrice = grossPrice - discount + tax;
    
    // Ensure netPrice is a valid number
    if (isNaN(netPrice) || !isFinite(netPrice)) {
      console.error('Invalid netPrice calculation:', {
        grossPrice,
        discount,
        tax,
        netPrice,
      });
      throw new Error(`Invalid netPrice calculation: grossPrice=${grossPrice}, discount=${discount}, tax=${tax}`);
    }

    // Set total and balance to netPrice (matches legacy beforeSave: this->total = round($this->lesson->netPrice, 2))
    const total = RoundingUtils.roundDecimal(netPrice, 2);
    const balance = total;
    
    // Final validation to ensure total and balance are valid numbers
    if (isNaN(total) || !isFinite(total)) {
      console.error('Invalid total calculation:', {
        netPrice,
        total,
        balance,
      });
      throw new Error(`Invalid total calculation: netPrice=${netPrice}`);
    }

    // Format dueDate as date only
    const dueDate = new Date(date);
    dueDate.setHours(0, 0, 0, 0);

    const privateLesson = this.privateLessonRepository.create({
      lessonId,
      expiryDate,
      total,
      balance,
      dueDate,
    });

    return await this.privateLessonRepository.save(privateLesson);
  }

  /**
   * Find lessons by IDs with their course and enrolment relations
   * Used for changing lessons from group to private
   */
  async findLessonsByIds(lessonIds: number[], locationId: number): Promise<Lesson[]> {
    return await this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.course', 'course')
      .leftJoinAndSelect('course.enrolments', 'enrolments')
      .leftJoinAndSelect('enrolments.student', 'student')
      .where('lesson.id IN (:...lessonIds)', { lessonIds })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('course.locationId = :locationId', { locationId })
      .getMany();
  }

  /**
   * Return the nearest original explode branch for each selected descendant.
   * The split count lets callers distinguish a complete family from a partial
   * selection without changing ordinary standalone lessons.
   */
  async findExplodedLineageForLessons(
    lessonIds: number[],
  ): Promise<ExplodedLessonLineageRow[]> {
    if (lessonIds.length === 0) {
      return [];
    }

    const placeholders = lessonIds.map(() => '?').join(',');
    return this.lessonRepository.manager.query(
      `SELECT descendants.childLessonId AS lessonId,
              direct.lessonId AS explodedParentId,
              direct.childLessonId AS explodedBranchId,
              splitChild.date AS explodedBranchDate,
              parent.duration AS parentDuration,
              descendants.depth AS descendantDepth,
              (SELECT COUNT(*)
                 FROM lesson_hierarchy sibling
                 INNER JOIN lesson siblingLesson
                         ON siblingLesson.id = sibling.childLessonId
                        AND siblingLesson.isExploded = 1
                WHERE sibling.lessonId = direct.lessonId
                  AND sibling.depth = 1) AS splitCount
         FROM lesson_hierarchy direct
         INNER JOIN lesson parent
                 ON parent.id = direct.lessonId
         INNER JOIN lesson splitChild
                 ON splitChild.id = direct.childLessonId
                AND splitChild.isExploded = 1
         INNER JOIN lesson_hierarchy descendants
                 ON descendants.lessonId = direct.childLessonId
        WHERE direct.depth = 1
          AND descendants.childLessonId IN (${placeholders})
        ORDER BY descendants.childLessonId, descendants.depth`,
      lessonIds,
    );
  }

  /**
   * Apply an aggregate-preserving rate to a converted lesson. The balance is
   * moved by the same delta as the total so existing payment allocations and
   * available credit are not overwritten.
   */
  async updateChangedLessonPricing(
    lessonId: number,
    programRate: number,
    total: number,
  ): Promise<void> {
    await this.lessonRepository.update({ id: lessonId }, { programRate });
    await this.privateLessonRepository.query(
      `UPDATE private_lesson
          SET balance = ROUND(balance + ? - total, 4),
              total = ?
        WHERE lessonId = ?`,
      [total, total, lessonId],
    );
  }

  /**
   * Find course by ID with enrolment and student
   */
  async findCourseWithEnrolment(courseId: number): Promise<Course | null> {
    return await this.courseRepository
      .createQueryBuilder('course')
      .leftJoinAndSelect('course.enrolments', 'enrolments', 'enrolments.isDeleted = FALSE AND enrolments.isConfirmed = TRUE')
      .leftJoinAndSelect('enrolments.student', 'student')
      .where('course.id = :courseId', { courseId })
      .andWhere('course.isDeleted = :isDeleted', { isDeleted: false })
      .getOne();
  }

  /**
   * Get lesson payments for a lesson
   * Returns lesson_payment records that are not deleted
   */
  async getLessonPayments(lessonId: number): Promise<any[]> {
    return await this.lessonRepository
      .createQueryBuilder()
      .select([
        'lp.id as id',
        'lp.lessonId as lessonId',
        'lp.paymentId as paymentId',
        'lp.enrolmentId as enrolmentId',
        'lp.amount as amount',
        'lp.date as date',
        'lp.isDeleted as isDeleted',
        'p.id as payment_id',
        'p.reference as reference',
        'p.amount as payment_amount',
      ])
      .from('lesson_payment', 'lp')
      .innerJoin('payment', 'p', 'p.id = lp.paymentId')
      .where('lp.lessonId = :lessonId', { lessonId })
      .andWhere('lp.isDeleted = :isDeleted', { isDeleted: 0 })
      .getRawMany();
  }

  /**
   * Transfer lesson payments from old lesson to new lesson
   * Updates lesson_payment.lessonId to new lesson ID
   * Matches legacy: updates each payment individually by ID
   */
  async transferLessonPayments(oldLessonId: number, newLessonId: number): Promise<void> {
    // Get all lesson payment IDs for the old lesson
    const lessonPayments = await this.lessonRepository
      .createQueryBuilder()
      .select('lp.id', 'id')
      .from('lesson_payment', 'lp')
      .where('lp.lessonId = :oldLessonId', { oldLessonId })
      .andWhere('lp.isDeleted = :isDeleted', { isDeleted: 0 })
      .getRawMany();

    // Update each payment individually by ID (matches legacy behavior)
    for (const lp of lessonPayments) {
      await this.lessonRepository
        .createQueryBuilder()
        .update('lesson_payment')
        .set({ lessonId: newLessonId })
        .where('id = :paymentId', { paymentId: lp.id })
        .execute();
    }
  }

  /**
   * Update payment reference for credit usage
   * Updates payment.reference to new lesson number
   */
  async updatePaymentReferenceForCreditUsage(paymentId: number, lessonNumber: string): Promise<void> {
    // First, check if payment has credit usage
    const creditUsage = await this.lessonRepository
      .createQueryBuilder()
      .select(['cu.id', 'cu.debit_payment_id'])
      .from('credit_usage', 'cu')
      .where('cu.credit_payment_id = :paymentId', { paymentId })
      .getRawOne();
    
    if (creditUsage && creditUsage.debit_payment_id) {
      // Update the debit payment reference
      await this.paymentRepository
        .createQueryBuilder()
        .update()
        .set({ reference: lessonNumber })
        .where('id = :debitPaymentId', { debitPaymentId: creditUsage.debit_payment_id })
        .execute();
    }
  }

  /**
   * Cancel a lesson (set status to CANCELED)
   */
  async cancelLesson(lessonId: number): Promise<void> {
    await this.lessonRepository.update(
      { id: lessonId },
      { status: LessonStatusEnum.CANCELED },
    );
  }

  /**
   * Get lesson number for a lesson
   * Note: lessonNumber is the same as lesson ID
   */
  async getLessonNumber(lessonId: number): Promise<string | null> {
    // lessonNumber is the same as the lesson ID
    return lessonId.toString();
  }

  /**
   * Update lesson status
   */
  async updateLessonStatus(
    lessonId: number,
    status: LessonStatusEnum,
  ): Promise<void> {
    await this.lessonRepository.update(
      { id: lessonId },
      { status },
    );
  }

  /**
   * Get lesson credit amount for a lesson and enrolment.
   * Sums LessonPayment amounts where payment is not deleted (excluding credit-used payments).
   * Matches legacy: getCreditAppliedAmount()
   */
  async getLessonCreditAmount(
    lessonId: number,
    enrolmentId: number,
    manager?: EntityManager,
  ): Promise<number> {
    const db = manager ?? this.lessonRepository.manager;
    const result = await db
      .createQueryBuilder()
      .select('COALESCE(SUM(lp.amount), 0)', 'total')
      .from('lesson_payment', 'lp')
      .innerJoin(
        'payment',
        'p',
        'p.id = lp.paymentId AND (p.isDeleted = 0 OR p.isDeleted IS NULL)',
      )
      .innerJoin('payment_method', 'pm', 'pm.id = p.payment_method_id')
      .where('lp.lessonId = :lessonId', { lessonId })
      .andWhere('lp.enrolmentId = :enrolmentId', { enrolmentId })
      .andWhere('lp.isDeleted = 0')
      .andWhere('pm.id != :creditUsed', {
        creditUsed: PaymentMethod.TYPE_CREDIT_USED,
      })
      .getRawOne();

    return result?.total ? parseFloat(String(result.total)) : 0;
  }

  /**
   * Legacy-equivalent lesson credit used by invoice credit transfer.
   * Includes all lesson payment amounts (credit-applied positives and credit-used negatives)
   * with only soft-delete filters.
   * Matches legacy: Lesson::getLessonCreditAmount()
   */
  async getLessonNetCreditAmount(
    lessonId: number,
    enrolmentId: number,
    manager?: EntityManager,
  ): Promise<number> {
    const db = manager ?? this.lessonRepository.manager;
    const result = await db
      .createQueryBuilder()
      .select('COALESCE(SUM(lp.amount), 0)', 'total')
      .from('lesson_payment', 'lp')
      .innerJoin(
        'payment',
        'p',
        'p.id = lp.paymentId AND (p.isDeleted = 0 OR p.isDeleted IS NULL)',
      )
      .where('lp.lessonId = :lessonId', { lessonId })
      .andWhere('lp.enrolmentId = :enrolmentId', { enrolmentId })
      .andWhere('lp.isDeleted = 0')
      .getRawOne();

    return result?.total ? parseFloat(String(result.total)) : 0;
  }
}
