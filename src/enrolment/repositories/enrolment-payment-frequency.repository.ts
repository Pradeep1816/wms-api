import { ensurePrivateLessonEmailStatuses } from '../../lesson/helpers/ensure-lesson-email-statuses';
import { PrivateLessonEmailStatus } from '../../lesson/entities/private-lesson-email-status.entity';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, EntityTarget, ObjectLiteral, Repository } from 'typeorm';
import { getCurrentESTDate } from '../../utils/date-utils';
import { Enrolment } from '../entities/enrolment.entity';
import { Course } from '../../course/entities/course.entity';
import { Program } from '../../program/entities/program.entity';
import { EnrolmentPaymentFrequency } from '../entities/enrolment-payment-frequency.entity';
import { PaymentFrequency } from '../../payment/entities/payment-frequency.entity';
import { PaymentCycle } from '../../payment/entities/payment-cycle.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { AutoRenewal } from '../entities/auto-renewal.entity';
import { AutoRenewalLessons } from '../entities/auto-renewal-lessons.entity';
import { AutoRenewalPaymentCycle } from '../entities/auto-renewal-payment-cycle.entity';
import { CourseProgramRate } from '../../course/entities/course-program-rate.entity';
import { CourseSchedule } from '../../course/entities/course-schedule.entity';
import { PaymentCycleLesson } from '../entities/payment-cycle-lesson.entity';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { LessonHierarchy } from '../../lesson/entities/lesson-hierarchy.entity';
import { LessonDiscount } from '../../lesson/entities/lesson-discount.entity';
import { EnrolmentDiscount } from '../entities/enrolment-discount.entity';
import { Student } from '../../student/entities/student.entity';
import { CustomerDiscount } from '../../customer/entities/customer-discount.entity';
import { Qualification } from '../../qualification/entities/qualification.entity';
import { PrivateLesson } from '../../lesson/entities/private-lesson.entity';
import { RoundingUtils } from '../../utils/rounding.utils';

@Injectable()
export class EnrolmentPaymentFrequencyRepository {
  constructor(
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    @InjectRepository(EnrolmentPaymentFrequency)
    private readonly enrolmentPaymentFrequencyRepository: Repository<EnrolmentPaymentFrequency>,
    @InjectRepository(PaymentFrequency)
    private readonly paymentFrequencyRepository: Repository<PaymentFrequency>,
    @InjectRepository(PaymentCycle)
    private readonly paymentCycleRepository: Repository<PaymentCycle>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(AutoRenewal)
    private readonly autoRenewalRepository: Repository<AutoRenewal>,
    @InjectRepository(AutoRenewalLessons)
    private readonly autoRenewalLessonsRepository: Repository<AutoRenewalLessons>,
    @InjectRepository(AutoRenewalPaymentCycle)
    private readonly autoRenewalPaymentCycleRepository: Repository<AutoRenewalPaymentCycle>,
    @InjectRepository(CourseProgramRate)
    private readonly courseProgramRateRepository: Repository<CourseProgramRate>,
    @InjectRepository(CourseSchedule)
    private readonly courseScheduleRepository: Repository<CourseSchedule>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(PaymentCycleLesson)
    private readonly paymentCycleLessonRepository: Repository<PaymentCycleLesson>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(LessonHierarchy)
    private readonly lessonHierarchyRepository: Repository<LessonHierarchy>,
    @InjectRepository(LessonDiscount)
    private readonly lessonDiscountRepository: Repository<LessonDiscount>,
    @InjectRepository(EnrolmentDiscount)
    private readonly enrolmentDiscountRepository: Repository<EnrolmentDiscount>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(CustomerDiscount)
    private readonly customerDiscountRepository: Repository<CustomerDiscount>,
    @InjectRepository(Qualification)
    private readonly qualificationRepository: Repository<Qualification>,
    @InjectRepository(PrivateLesson)
    private readonly privateLessonRepository: Repository<PrivateLesson>,
  ) {}

  private resolveRepository<T extends ObjectLiteral>(
    repository: Repository<T>,
    entity: EntityTarget<T>,
    manager?: EntityManager,
  ): Repository<T> {
    return manager ? manager.getRepository<T>(entity) : repository;
  }

  /**
   * Get enrollment with payment frequency for Payment Frequency section
   * Only for private programs (program.type = 1)
   */
  async getEnrolmentWithPaymentFrequency(
    enrolmentId: number,
    locationId: number,
  ): Promise<Enrolment | null> {
    return this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .innerJoinAndSelect('enrolment.course', 'course')
      .innerJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('enrolment.paymentFrequency', 'paymentFrequency')
      .where('enrolment.id = :enrolmentId', { enrolmentId })
      .andWhere('enrolment.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.type = :courseType', { courseType: Course.TYPE_REGULAR })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      // Only private programs
      .andWhere('program.type = :programType', { programType: Program.TYPE_PRIVATE_PROGRAM })
      .getOne();
  }

  /**
   * Find PaymentFrequency by id
   */
  async findPaymentFrequencyById(id: number): Promise<PaymentFrequency | null> {
    return this.paymentFrequencyRepository.findOne({
      where: { id },
    });
  }

  /**
   * Find teacher qualification rate for a specific program.
   * Matches legacy: Lesson::beforeSave() derived teacherRate from qualification.
   */
  async getTeacherQualificationRate(
    teacherId: number,
    programId: number,
    manager?: EntityManager,
  ): Promise<number> {
    const qualificationRepository = this.resolveRepository(
      this.qualificationRepository,
      Qualification,
      manager,
    );

    const qualification = await qualificationRepository.findOne({
      where: {
        teacherId,
        programId,
      },
    });

    return Number(qualification?.rate ?? 0);
  }

  /**
   * Get enrolment with course for payment frequency change
   * Only for private programs (program.type = 1)
   */
  async getEnrolmentForPaymentFrequencyChange(
    enrolmentId: number,
    locationId: number,
  ): Promise<Enrolment | null> {
    return this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .innerJoinAndSelect('enrolment.course', 'course')
      .innerJoinAndSelect('course.program', 'program')
      .where('enrolment.id = :enrolmentId', { enrolmentId })
      .andWhere('enrolment.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.type = :courseType', { courseType: Course.TYPE_REGULAR })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      // Only private programs
      .andWhere('program.type = :programType', { programType: Program.TYPE_PRIVATE_PROGRAM })
      .getOne();
  }

  /**
   * Find or create EnrolmentPaymentFrequency record
   */
  async findOrCreateEnrolmentPaymentFrequency(
    enrolmentId: number,
    paymentFrequencyId: number,
    paymentCycleStartDate: Date,
    userId: number,
    manager?: EntityManager,
  ): Promise<EnrolmentPaymentFrequency> {
    const enrolmentPaymentFrequencyRepository = this.resolveRepository(
      this.enrolmentPaymentFrequencyRepository,
      EnrolmentPaymentFrequency,
      manager,
    );

    // Try to find existing active record
    let enrolmentPaymentFrequency = await enrolmentPaymentFrequencyRepository.findOne({
      where: {
        enrolmentId,
        isDeleted: false,
      },
    });

    if (enrolmentPaymentFrequency) {
      // Update existing record
      enrolmentPaymentFrequency.paymentFrequencyId = paymentFrequencyId;
      enrolmentPaymentFrequency.paymentCycleStartDate = paymentCycleStartDate;
      enrolmentPaymentFrequency.updatedByUserId = userId;
      enrolmentPaymentFrequency.updatedOn = getCurrentESTDate();
    } else {
      const now = getCurrentESTDate();
      // Create new record
      enrolmentPaymentFrequency = enrolmentPaymentFrequencyRepository.create({
        enrolmentId,
        paymentFrequencyId,
        paymentCycleStartDate,
        createdOn: now,
        updatedOn: now,
        createdByUserId: userId,
        updatedByUserId: userId,
        isDeleted: false,
      });
    }

    return enrolmentPaymentFrequencyRepository.save(enrolmentPaymentFrequency);
  }

  /**
   * Update enrolment paymentFrequencyId
   */
  async updateEnrolmentPaymentFrequency(
    enrolmentId: number,
    paymentFrequencyId: number,
    userId: number,
    manager?: EntityManager,
  ): Promise<Enrolment> {
    const enrolmentRepository = this.resolveRepository(
      this.enrolmentRepository,
      Enrolment,
      manager,
    );

    const enrolment = await enrolmentRepository.findOne({
      where: { id: enrolmentId },
    });

    if (!enrolment) {
      throw new Error(`Enrolment not found: ${enrolmentId}`);
    }

    enrolment.paymentFrequencyId = paymentFrequencyId;
    enrolment.updatedByUserId = userId;
    enrolment.updatedAt = new Date();

    return enrolmentRepository.save(enrolment);
  }

  /**
   * Get enrolment with payment cycles and course for payment cycle reset
   */
  async getEnrolmentWithPaymentCycles(
    enrolmentId: number,
    locationId: number,
    manager?: EntityManager,
  ): Promise<Enrolment | null> {
    const enrolmentRepository = this.resolveRepository(
      this.enrolmentRepository,
      Enrolment,
      manager,
    );

    return enrolmentRepository
      .createQueryBuilder('enrolment')
      .innerJoinAndSelect('enrolment.course', 'course')
      .innerJoinAndSelect('course.program', 'program')
      .innerJoinAndSelect('enrolment.student', 'student')
      .leftJoinAndSelect('enrolment.paymentFrequency', 'paymentFrequency')
      .leftJoinAndSelect('enrolment.paymentCycles', 'paymentCycles', 'paymentCycles.isDeleted = :isDeleted', { isDeleted: 0 })
      .where('enrolment.id = :enrolmentId', { enrolmentId })
      .andWhere('enrolment.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.type = :courseType', { courseType: Course.TYPE_REGULAR })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      .andWhere('program.type = :programType', { programType: Program.TYPE_PRIVATE_PROGRAM })
      .orderBy('paymentCycles.startDate', 'DESC')
      .getOne();
  }

  /**
   * Get last payment cycle for an enrolment
   */
  async getLastPaymentCycle(
    enrolmentId: number,
    manager?: EntityManager,
  ): Promise<PaymentCycle | null> {
    const paymentCycleRepository = this.resolveRepository(
      this.paymentCycleRepository,
      PaymentCycle,
      manager,
    );

    return paymentCycleRepository.findOne({
      where: {
        enrolmentId,
        isDeleted: 0,
      },
      order: {
        startDate: 'DESC',
      },
    });
  }

  /**
   * Delete payment cycles from effective date onwards
   */
  async deletePaymentCyclesFromDate(
    enrolmentId: number,
    effectiveDate: Date,
    manager?: EntityManager,
  ): Promise<void> {
    const paymentCycleRepository = this.resolveRepository(
      this.paymentCycleRepository,
      PaymentCycle,
      manager,
    );
    const firstDayOfMonth = new Date(effectiveDate.getFullYear(), effectiveDate.getMonth(), 1);
    const firstDayOfMonthString = this.formatDateForQuery(firstDayOfMonth);
    
    // Get payment cycles that will be deleted
    const cyclesToDelete = await paymentCycleRepository
      .createQueryBuilder('pc')
      .where('pc.enrolmentId = :enrolmentId', { enrolmentId })
      .andWhere('pc.isDeleted = :isDeleted', { isDeleted: 0 })
      .andWhere('pc.startDate >= :startDate', { startDate: firstDayOfMonthString })
      .getMany();

    if (cyclesToDelete.length === 0) {
      return;
    }

    const cycleIds = cyclesToDelete.map(cycle => cycle.id);
    await this.softDeletePaymentCycles(cycleIds, manager);
  }

  /**
   * Soft-delete payment cycles with legacy parity cleanup.
   * Legacy behavior deletes linked proforma invoice only when it has no payments.
   */
  private async softDeletePaymentCycles(
    cycleIds: number[],
    manager?: EntityManager,
  ): Promise<void> {
    if (cycleIds.length === 0) {
      return;
    }

    const paymentCycleRepository = this.resolveRepository(
      this.paymentCycleRepository,
      PaymentCycle,
      manager,
    );
    const paymentCycleLessonRepository = this.resolveRepository(
      this.paymentCycleLessonRepository,
      PaymentCycleLesson,
      manager,
    );
    const invoiceRepository = this.resolveRepository(this.invoiceRepository, Invoice, manager);

    // Legacy parity: delete proforma invoices only when they have no non-deleted payments.
    const deletableProformaInvoices = await invoiceRepository
      .createQueryBuilder('invoice')
      .innerJoin('invoice_line_item', 'ili', 'ili.invoice_id = invoice.id AND ili.isDeleted = 0')
      .innerJoin('invoice_item_payment_cycle_lesson', 'iipcl', 'iipcl.invoiceLineItemId = ili.id')
      .innerJoin('payment_cycle_lesson', 'pcl', 'iipcl.paymentCycleLessonId = pcl.id AND pcl.isDeleted = 0')
      .leftJoin('invoice_payment', 'ip', 'ip.invoice_id = invoice.id AND ip.isDeleted = 0')
      .leftJoin('payment', 'payment', 'payment.id = ip.payment_id AND payment.isDeleted = 0')
      .where('pcl.paymentCycleId IN (:...cycleIds)', { cycleIds })
      .andWhere('invoice.type = :invoiceType', { invoiceType: Invoice.TYPE_PRO_FORMA_INVOICE })
      .andWhere('invoice.isDeleted = :invoiceIsDeleted', { invoiceIsDeleted: 0 })
      .groupBy('invoice.id')
      .having('COUNT(payment.id) = 0')
      .getMany();

    const deletableInvoiceIds = deletableProformaInvoices.map(invoice => invoice.id);
    if (deletableInvoiceIds.length > 0) {
      await invoiceRepository
        .createQueryBuilder()
        .update(Invoice)
        .set({ tax: 0, isTaxAdjusted: 0, isDeleted: true })
        .where('id IN (:...invoiceIds)', { invoiceIds: deletableInvoiceIds })
        .execute();
    }

    // Soft-delete payment_cycle_lesson links for these cycles.
    await paymentCycleLessonRepository
      .createQueryBuilder()
      .update(PaymentCycleLesson)
      .set({ isDeleted: 1 })
      .where('paymentCycleId IN (:...cycleIds)', { cycleIds })
      .andWhere('isDeleted = :isDeleted', { isDeleted: 0 })
      .execute();

    // Soft-delete payment cycles.
    await paymentCycleRepository
      .createQueryBuilder()
      .update(PaymentCycle)
      .set({ isDeleted: 1 })
      .where('id IN (:...cycleIds)', { cycleIds })
      .execute();
  }

  /**
   * Create a new payment cycle
   */
  async createPaymentCycle(
    enrolmentId: number,
    startDate: Date,
    endDate: Date,
    manager?: EntityManager,
  ): Promise<PaymentCycle> {
    const paymentCycleRepository = this.resolveRepository(
      this.paymentCycleRepository,
      PaymentCycle,
      manager,
    );
    const paymentCycle = paymentCycleRepository.create({
      enrolmentId,
      startDate,
      endDate,
      isDeleted: 0,
      isPreferredPaymentEnabled: false,
    });

    return paymentCycleRepository.save(paymentCycle);
  }

  /**
   * Update payment cycle end date
   */
  async updatePaymentCycleEndDate(
    paymentCycleId: number,
    endDate: Date,
    manager?: EntityManager,
  ): Promise<void> {
    const paymentCycleRepository = this.resolveRepository(
      this.paymentCycleRepository,
      PaymentCycle,
      manager,
    );
    await paymentCycleRepository.update(
      { id: paymentCycleId },
      { endDate },
    );
  }

  /**
   * Update course schedule end date
   */
  async updateCourseScheduleEndDate(
    courseScheduleId: number,
    endDate: Date,
    manager?: EntityManager,
  ): Promise<void> {
    const courseScheduleRepository = this.resolveRepository(
      this.courseScheduleRepository,
      CourseSchedule,
      manager,
    );

    await courseScheduleRepository.update(
      { id: courseScheduleId },
      { endDate },
    );
  }

  /**
   * Get confirmed, non-canceled lessons for an enrolment with payment cycles
   * Matches legacy: Lesson::find()->enrolment()->isConfirmed()->notCanceled()
   */
  async getConfirmedLessonsForEnrolment(
    enrolmentId: number,
    manager?: EntityManager,
  ): Promise<
    Array<{
      lesson: Lesson;
      paymentCycleId: number | null;
      paymentCycleStartDate: Date | string | null;
    }>
  > {
    const lessonRepository = this.resolveRepository(this.lessonRepository, Lesson, manager);

    // Matches legacy: Lesson::find()->enrolment($id)->isConfirmed()->notCanceled()
    // STATUS_CANCELED = 4 in legacy
    const lessons = await lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course')
      .innerJoin('course.enrolments', 'enrolment')
      .leftJoin('payment_cycle_lesson', 'pcl', 'pcl.lessonId = lesson.id AND pcl.isDeleted = 0')
      .leftJoin('payment_cycle', 'pc', 'pc.id = pcl.paymentCycleId AND pc.isDeleted = 0')
      .select([
        'lesson.id',
        'lesson.dueDate',
        'lesson.date',
        'lesson.originalDate',
        'pc.id AS paymentCycleId',
        'pc.startDate AS paymentCycleStartDate',
      ])
      .where('enrolment.id = :enrolmentId', { enrolmentId })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status != :canceledStatus', { canceledStatus: 4 }) // STATUS_CANCELED = 4
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .getRawMany();

    return lessons.map((row) => ({
      lesson: {
        id: row.lesson_id,
        dueDate: row.lesson_dueDate,
        date: row.lesson_date,
        originalDate: row.lesson_originalDate,
      } as Lesson,
      paymentCycleId: row.paymentCycleId || null,
      paymentCycleStartDate: row.paymentCycleStartDate || null,
    }));
  }

  /**
   * Update lesson due date
   */
  async updateLessonDueDate(
    lessonId: number,
    dueDate: Date,
    manager?: EntityManager,
  ): Promise<void> {
    const lessonRepository = this.resolveRepository(this.lessonRepository, Lesson, manager);

    await lessonRepository.update(
      { id: lessonId },
      { dueDate },
    );
  }

  /**
   * Batch update lesson due dates
   * More efficient than updating one by one
   */
  async batchUpdateLessonDueDates(
    lessonIds: number[],
    dueDate: Date,
    manager?: EntityManager,
  ): Promise<void> {
    if (lessonIds.length === 0) {
      return;
    }
    const lessonRepository = this.resolveRepository(this.lessonRepository, Lesson, manager);
    await lessonRepository
      .createQueryBuilder()
      .update(Lesson)
      .set({ dueDate })
      .where('id IN (:...lessonIds)', { lessonIds })
      .execute();
  }

  /**
   * Clone payment cycle (for legacy pattern)
   */
  async clonePaymentCycle(
    paymentCycle: PaymentCycle,
    manager?: EntityManager,
  ): Promise<PaymentCycle> {
    const paymentCycleRepository = this.resolveRepository(
      this.paymentCycleRepository,
      PaymentCycle,
      manager,
    );
    const cloned = paymentCycleRepository.create({
      enrolmentId: paymentCycle.enrolmentId,
      startDate: paymentCycle.startDate,
      endDate: paymentCycle.endDate,
      isDeleted: 0,
      isPreferredPaymentEnabled: paymentCycle.isPreferredPaymentEnabled,
    });
    return paymentCycleRepository.save(cloned);
  }

  /**
   * Format a date as YYYY-MM-DD without converting to UTC.
   */
  private formatDateForQuery(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  /**
   * Delete payment cycle (soft delete)
   */
  async deletePaymentCycle(paymentCycleId: number, manager?: EntityManager): Promise<void> {
    await this.softDeletePaymentCycles([paymentCycleId], manager);
  }

  /**
   * The rate the course is already charging just before `beforeDate`.
   *
   * This is what an extension carries forward when the catalogue has no
   * opinion - an enrolment nobody put on a tier, or one held on its previous
   * rate. Returns `null` when the course has no rate row at all, and the
   * caller falls back to the program's list price as it always did.
   */
  async findRateInEffectBefore(
    courseId: number,
    beforeDate: string,
    manager?: EntityManager,
  ): Promise<number | null> {
    const repository = this.resolveRepository(
      this.courseProgramRateRepository,
      CourseProgramRate,
      manager,
    );

    const rows = await repository
      .createQueryBuilder('rate')
      .where('rate.courseId = :courseId', { courseId })
      .andWhere('rate.startDate <= :beforeDate', { beforeDate })
      .orderBy('rate.startDate', 'DESC')
      .addOrderBy('rate.id', 'DESC')
      .limit(1)
      .getMany();

    if (rows.length === 0) {
      return null;
    }

    const rate = Number(rows[0].programRate);
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  }

  /**
   * Create CourseProgramRate
   */
  async createCourseProgramRate(
    courseId: number,
    startDate: Date,
    endDate: Date,
    programRate: number,
    manager?: EntityManager,
  ): Promise<CourseProgramRate> {
    const courseProgramRateRepository = this.resolveRepository(
      this.courseProgramRateRepository,
      CourseProgramRate,
      manager,
    );
    const courseProgramRate = courseProgramRateRepository.create({
      courseId,
      startDate,
      endDate,
      programRate,
      applyFullDiscount: false,
    });
    return courseProgramRateRepository.save(courseProgramRate);
  }

  /**
   * Create AutoRenewal record
   */
  async createAutoRenewal(
    enrolmentId: number,
    paymentFrequency: number,
    enrolmentEndDateCurrent: Date,
    enrolmentEndDateNew: Date,
    lastPaymentCycleStartDate: Date,
    lastPaymentCycleEndDate: Date,
    userId: number,
    manager?: EntityManager,
  ): Promise<AutoRenewal> {
    const autoRenewalRepository = this.resolveRepository(
      this.autoRenewalRepository,
      AutoRenewal,
      manager,
    );
    const autoRenewal = autoRenewalRepository.create({
      enrolmentId,
      paymentFrequency,
      enrolmentEndDateCurrent,
      enrolmentEndDateNew,
      lastPaymentCycleStartDate,
      lastPaymentCycleEndDate,
      createdByUserId: userId,
    });
    return autoRenewalRepository.save(autoRenewal);
  }

  /**
   * Create AutoRenewalLessons record
   */
  async createAutoRenewalLesson(
    autoRenewalId: number,
    lessonId: number,
    userId: number,
    manager?: EntityManager,
  ): Promise<AutoRenewalLessons> {
    const autoRenewalLessonsRepository = this.resolveRepository(
      this.autoRenewalLessonsRepository,
      AutoRenewalLessons,
      manager,
    );
    const autoRenewalLesson = autoRenewalLessonsRepository.create({
      autoRenewalId,
      lessonId,
      createdByUserId: userId,
    });
    return autoRenewalLessonsRepository.save(autoRenewalLesson);
  }

  /**
   * Get last auto-renewal lesson ID
   */
  async getLastAutoRenewalLessonId(autoRenewalId: number): Promise<number | null> {
    const result = await this.autoRenewalLessonsRepository.findOne({
      where: { autoRenewalId },
      order: { lessonId: 'DESC' },
    });
    return result?.lessonId || null;
  }

  /**
   * Create CourseSchedule
   */
  async createCourseSchedule(
    courseId: number,
    fromTime: string,
    duration: string,
    day: number,
    startDate: Date,
    endDate: Date,
    teacherId: number,
    manager?: EntityManager,
  ): Promise<CourseSchedule> {
    const courseScheduleRepository = this.resolveRepository(
      this.courseScheduleRepository,
      CourseSchedule,
      manager,
    );
    const courseSchedule = courseScheduleRepository.create({
      courseId,
      fromTime,
      duration,
      day,
      startDate,
      endDate,
      teacherId,
      isRecent: true,
    });
    return courseScheduleRepository.save(courseSchedule);
  }

  /**
   * Create AutoRenewalPaymentCycle record
   */
  async createAutoRenewalPaymentCycle(
    autoRenewalId: number,
    paymentCycleId: number,
    userId: number,
    manager?: EntityManager,
  ): Promise<AutoRenewalPaymentCycle> {
    const autoRenewalPaymentCycleRepository = this.resolveRepository(
      this.autoRenewalPaymentCycleRepository,
      AutoRenewalPaymentCycle,
      manager,
    );
    const autoRenewalPaymentCycle = autoRenewalPaymentCycleRepository.create({
      autoRenewalId,
      paymentCycleId,
      createdByUserId: userId,
    });
    return autoRenewalPaymentCycleRepository.save(autoRenewalPaymentCycle);
  }

  /**
   * Update course end date
   */
  async updateCourseEndDate(courseId: number, endDate: Date, manager?: EntityManager): Promise<void> {
    const courseRepository = this.resolveRepository(this.courseRepository, Course, manager);
    await courseRepository.update(
      { id: courseId },
      { endDate },
    );
  }

  /**
   * Update enrolment end date
   */
  async updateEnrolmentEndDate(
    enrolmentId: number,
    endDateTime: Date,
    manager?: EntityManager,
  ): Promise<void> {
    const enrolmentRepository = this.resolveRepository(
      this.enrolmentRepository,
      Enrolment,
      manager,
    );
    await enrolmentRepository.update(
      { id: enrolmentId },
      { endDateTime },
    );
  }

  /**
   * Get course with program
   */
  async getCourseWithProgram(courseId: number, manager?: EntityManager): Promise<Course | null> {
    const courseRepository = this.resolveRepository(this.courseRepository, Course, manager);
    return courseRepository.findOne({
      where: { id: courseId },
      relations: ['program'],
    });
  }

  /**
   * Create lesson for auto-renewal
   */
  async createLessonForAutoRenewal(
    courseId: number,
    enrolmentId: number,
    studentId: number,
    teacherId: number,
    date: Date,
    duration: string,
    programRate: number,
    teacherRate: number,
    isOnline: number,
    userId: number,
    manager?: EntityManager,
  ): Promise<Lesson> {
    const lessonRepository = this.resolveRepository(this.lessonRepository, Lesson, manager);
    const now = getCurrentESTDate();
    
    const lesson = lessonRepository.create({
      courseId,
      teacherId,
      date,
      duration,
      status: 2, // CONFIRMED
      isPresent: true,
      isDeleted: false,
      isConfirmed: true,
      type: 1, // PRIVATE
      isExploded: 0,
      isOnline: isOnline === 1,
      createdByUserId: userId,
      updatedByUserId: userId,
      programRate,
      teacherRate,
      teacherRateOld: 0,
      tax: 0,
      paidStatus: 0,
      total: 0,
      dueDate: date,
      originalDate: date,
      createdOn: now,
      updatedOn: now,
    });
    const savedLesson = await lessonRepository.save(lesson);

    // Legacy parity: createAutoRenewalLesson() calls makeAsRoot() and setDiscount().
    await this.makeLessonAsRoot(savedLesson.id, manager);
    await this.applyLegacyAutoRenewalLessonDiscounts(
      savedLesson.id,
      enrolmentId,
      studentId,
      manager,
    );

    return savedLesson;
  }

  /**
   * Legacy: Lesson::makeAsRoot() -> setExpiry() creates private_lesson
   * (price, leftover, expiry, dueDate). Same insert as the auto-renewal cron.
   */
  async createPrivateLessonsForAutoRenewal(
    lessons: Lesson[],
    manager?: EntityManager,
  ): Promise<void> {
    if (lessons.length === 0) {
      return;
    }

    const privateLessonRepository = this.resolveRepository(
      this.privateLessonRepository,
      PrivateLesson,
      manager,
    );
    const lessonIds = lessons.map((lesson) => lesson.id);
    await ensurePrivateLessonEmailStatuses(
      (manager ?? this.lessonRepository.manager).getRepository(PrivateLessonEmailStatus),
      lessonIds,
    );
    const existingPrivateLessons = await privateLessonRepository.find({
      where: lessonIds.map((lessonId) => ({ lessonId })),
    });
    const existingLessonIds = new Set(
      existingPrivateLessons.map((item) => item.lessonId),
    );
    const lessonRepository = this.resolveRepository(
      this.lessonRepository,
      Lesson,
      manager,
    );
    const inserts: Array<{
      lessonId: number;
      expiryDate: Date;
      total: number;
      balance: number;
      dueDate: string;
    }> = [];

    for (const lesson of lessons) {
      if (existingLessonIds.has(lesson.id)) {
        continue;
      }

      const lessonDate = new Date(lesson.date);
      const expiryDate = new Date(lessonDate);
      expiryDate.setUTCDate(expiryDate.getUTCDate() + 90);
      const lessonForNetPrice = await lessonRepository.findOne({
        where: { id: lesson.id },
        relations: ['discounts'],
      });
      const total = RoundingUtils.roundDecimal(
        Number((lessonForNetPrice ?? lesson).getNetPrice()),
        2,
      );

      inserts.push({
        lessonId: lesson.id,
        expiryDate,
        total,
        balance: total,
        dueDate: this.formatDateForQuery(new Date(lesson.dueDate ?? lesson.date)),
      });
    }

    if (inserts.length > 0) {
      await privateLessonRepository
        .createQueryBuilder()
        .insert()
        .into(PrivateLesson)
        .values(inserts)
        .execute();
    }
  }

  /**
   * Legacy parity: Lesson::makeAsRoot()
   */
  private async makeLessonAsRoot(
    lessonId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const lessonHierarchyRepository = this.resolveRepository(
      this.lessonHierarchyRepository,
      LessonHierarchy,
      manager,
    );

    const existingRoot = await lessonHierarchyRepository.findOne({
      where: {
        lessonId,
        childLessonId: lessonId,
      },
    });

    if (!existingRoot) {
      await lessonHierarchyRepository
        .createQueryBuilder()
        .insert()
        .into(LessonHierarchy)
        .values({
          lessonId,
          childLessonId: lessonId,
          depth: 0,
        })
        .execute();
    }
  }

  /**
   * Legacy parity: Lesson::setDiscount() for private auto-renewal lessons.
   */
  private async applyLegacyAutoRenewalLessonDiscounts(
    lessonId: number,
    enrolmentId: number,
    studentId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const lessonDiscountRepository = this.resolveRepository(
      this.lessonDiscountRepository,
      LessonDiscount,
      manager,
    );
    const enrolmentDiscountRepository = this.resolveRepository(
      this.enrolmentDiscountRepository,
      EnrolmentDiscount,
      manager,
    );
    const studentRepository = this.resolveRepository(
      this.studentRepository,
      Student,
      manager,
    );
    const customerDiscountRepository = this.resolveRepository(
      this.customerDiscountRepository,
      CustomerDiscount,
      manager,
    );

    const existingDiscounts = await lessonDiscountRepository.find({
      where: { lessonId },
    });
    const existingKeys = new Set(
      existingDiscounts.map((discount) => `${discount.type}-${discount.enrolmentId ?? ''}`),
    );

    const discountInserts: Array<{
      lessonId: number;
      type: number;
      value: number;
      valueType: number;
      enrolmentId: number;
    }> = [];

    const student = await studentRepository.findOne({
      where: { id: studentId },
      relations: ['user'],
    });
    const customerId = student?.user?.id;
    if (customerId) {
      const customerDiscount = await customerDiscountRepository.findOne({
        where: {
          customerId,
          isDeleted: false,
        },
      });
      if (customerDiscount && customerDiscount.value !== null && customerDiscount.value !== undefined) {
        const customerKey = `${LessonDiscount.TYPE_CUSTOMER}-${enrolmentId}`;
        if (!existingKeys.has(customerKey)) {
          discountInserts.push({
            lessonId,
            type: LessonDiscount.TYPE_CUSTOMER,
            value: Number(customerDiscount.value),
            valueType: 1,
            enrolmentId,
          });
          existingKeys.add(customerKey);
        }
      }
    }

    const enrolmentDiscounts = await enrolmentDiscountRepository.find({
      where: { enrolmentId },
    });
    for (const discount of enrolmentDiscounts) {
      if (!discount.discount) {
        continue;
      }

      const lessonDiscountType = this.mapEnrolmentDiscountTypeToLessonDiscountType(
        discount.type,
      );
      const discountKey = `${lessonDiscountType}-${enrolmentId}`;
      if (existingKeys.has(discountKey)) {
        continue;
      }

      let discountValue = Number(discount.discount);
      if (lessonDiscountType === LessonDiscount.TYPE_MULTIPLE_ENROLMENT) {
        discountValue = discountValue / 4;
      }
      const discountValueType =
        discount.discountType === EnrolmentDiscount.VALUE_TYPE_DOLLAR ? 0 : 1;

      discountInserts.push({
        lessonId,
        type: lessonDiscountType,
        value: discountValue,
        valueType: discountValueType,
        enrolmentId,
      });
      existingKeys.add(discountKey);
    }

    if (discountInserts.length > 0) {
      await lessonDiscountRepository
        .createQueryBuilder()
        .insert()
        .into(LessonDiscount)
        .values(discountInserts)
        .execute();
    }
  }

  /**
   * Map enrolment discount type to lesson discount type.
   */
  private mapEnrolmentDiscountTypeToLessonDiscountType(
    enrolmentDiscountType: number,
  ): number {
    if (enrolmentDiscountType === EnrolmentDiscount.TYPE_PAYMENT_FREQUENCY) {
      return LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY;
    }
    if (enrolmentDiscountType === EnrolmentDiscount.TYPE_MULTIPLE_ENROLMENT) {
      return LessonDiscount.TYPE_MULTIPLE_ENROLMENT;
    }
    return enrolmentDiscountType;
  }

  /**
   * Create payment cycle for auto-renewal
   */
  async createPaymentCycleForAutoRenewal(
    enrolmentId: number,
    startDate: Date,
    endDate: Date,
    manager?: EntityManager,
  ): Promise<PaymentCycle> {
    const paymentCycleRepository = this.resolveRepository(
      this.paymentCycleRepository,
      PaymentCycle,
      manager,
    );
    const paymentCycle = paymentCycleRepository.create({
      enrolmentId,
      startDate,
      endDate,
      isDeleted: 0,
      isPreferredPaymentEnabled: false,
    });
    return paymentCycleRepository.save(paymentCycle);
  }

  /**
   * Create payment cycle lesson link
   * If link already exists (even if deleted), restore it; otherwise create new one
   * NOTE: This method is kept for backward compatibility but should use batch operations when possible
   */
  async createPaymentCycleLesson(
    paymentCycleId: number,
    lessonId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const paymentCycleLessonRepository = this.resolveRepository(
      this.paymentCycleLessonRepository,
      PaymentCycleLesson,
      manager,
    );
    // Check if link already exists (including deleted ones)
    const existing = await paymentCycleLessonRepository.findOne({
      where: {
        paymentCycleId,
        lessonId,
      },
    });
    
    if (existing) {
      if (existing.isDeleted === 0) {
        // Link already exists and is active
        return;
      } else {
        // Link exists but is deleted - restore it
        existing.isDeleted = 0;
        await paymentCycleLessonRepository.save(existing);
        return;
      }
    }
    
    // Create new link
    const paymentCycleLesson = paymentCycleLessonRepository.create({
      paymentCycleId,
      lessonId,
      isDeleted: 0,
    });
    await paymentCycleLessonRepository.save(paymentCycleLesson);
  }

  /**
   * Link lessons to a payment cycle by their preserved billing occurrence.
   *
   * Rescheduling changes when the lesson is delivered, not the cycle that
   * bills it. A payment-frequency reset must therefore rebuild membership from
   * originalDate, falling back to date only for lessons without an original
   * occurrence.
   */
  async linkLessonsToPaymentCycle(
    paymentCycleId: number,
    courseId: number,
    startDate: Date,
    endDate: Date,
    manager?: EntityManager,
  ): Promise<{ linkedLessonIds: number[] }> {
    const lessonRepository = this.resolveRepository(this.lessonRepository, Lesson, manager);
    const paymentCycleLessonRepository = this.resolveRepository(
      this.paymentCycleLessonRepository,
      PaymentCycleLesson,
      manager,
    );

    // Normalize dates to start/end of day for proper comparison
    const startDateNormalized = new Date(startDate);
    startDateNormalized.setHours(0, 0, 0, 0);
    
    const endDateNormalized = new Date(endDate);
    endDateNormalized.setHours(23, 59, 59, 999);

    // Find confirmed, active lessons whose billing occurrence is in this cycle.
    const lessons = await lessonRepository
      .createQueryBuilder('lesson')
      .where('lesson.courseId = :courseId', { courseId })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.status != :canceledStatus', { canceledStatus: 4 })
      .andWhere('COALESCE(lesson.originalDate, lesson.date) >= :startDate', {
        startDate: startDateNormalized,
      })
      .andWhere('COALESCE(lesson.originalDate, lesson.date) <= :endDate', {
        endDate: endDateNormalized,
      })
      .orderBy('COALESCE(lesson.originalDate, lesson.date)', 'ASC')
      .addOrderBy('lesson.date', 'ASC')
      .getMany();

    if (lessons.length === 0) {
      return { linkedLessonIds: [] };
    }

    // Batch check for existing links
    const lessonIds = lessons.map(l => l.id);
    const existingLinks = await paymentCycleLessonRepository
      .createQueryBuilder('pcl')
      .where('pcl.paymentCycleId = :paymentCycleId', { paymentCycleId })
      .andWhere('pcl.lessonId IN (:...lessonIds)', { lessonIds })
      .getMany();
    
    const existingMap = new Map(existingLinks.map(link => [`${link.paymentCycleId}-${link.lessonId}`, link]));
    const linksToCreate: Array<{ paymentCycleId: number; lessonId: number; isDeleted: number }> = [];
    const linksToRestore: PaymentCycleLesson[] = [];
    
    for (const lesson of lessons) {
      const key = `${paymentCycleId}-${lesson.id}`;
      const existing = existingMap.get(key);
      
      if (existing) {
        if (existing.isDeleted === 0) {
          continue;
        } else {
          linksToRestore.push(existing);
        }
      } else {
        linksToCreate.push({
          paymentCycleId,
          lessonId: lesson.id,
          isDeleted: 0,
        });
      }
    }

    // Batch restore deleted links
    if (linksToRestore.length > 0) {
      for (const link of linksToRestore) {
        link.isDeleted = 0;
      }
      await paymentCycleLessonRepository.save(linksToRestore);
    }

    // Batch create new links using bulk insert for better performance
    if (linksToCreate.length > 0) {
      // Use insert for better performance than save
      await paymentCycleLessonRepository
        .createQueryBuilder()
        .insert()
        .into(PaymentCycleLesson)
        .values(linksToCreate)
        .execute();
    }

    return { linkedLessonIds: lessonIds };
  }

  /**
   * Get recent course schedule
   */
  async getRecentCourseSchedule(courseId: number, manager?: EntityManager): Promise<CourseSchedule | null> {
    const courseScheduleRepository = this.resolveRepository(
      this.courseScheduleRepository,
      CourseSchedule,
      manager,
    );
    return courseScheduleRepository.findOne({
      where: {
        courseId,
        isRecent: true,
      },
      order: { startDate: 'DESC' },
    });
  }

  /**
   * Update course schedule to set isRecent=0
   */
  async updateCourseScheduleIsRecent(
    courseScheduleId: number,
    isRecent: boolean,
    manager?: EntityManager,
  ): Promise<void> {
    const courseScheduleRepository = this.resolveRepository(
      this.courseScheduleRepository,
      CourseSchedule,
      manager,
    );
    await courseScheduleRepository.update(
      { id: courseScheduleId },
      { isRecent },
    );
  }

  /**
   * Get first lesson for a course
   */
  async getFirstLessonForCourse(courseId: number, manager?: EntityManager): Promise<Lesson | null> {
    const lessonRepository = this.resolveRepository(this.lessonRepository, Lesson, manager);
    return lessonRepository.findOne({
      where: { courseId, isDeleted: false },
      order: { date: 'ASC' },
    });
  }
}
