import { closeCourseScheduleHistory } from '../../course/course-schedule-history';
import { ensurePrivateLessonEmailStatuses } from '../helpers/ensure-lesson-email-statuses';
import { PrivateLessonEmailStatus } from '../entities/private-lesson-email-status.entity';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Course } from '../../course/entities/course.entity';
import { CourseSchedule } from '../../course/entities/course-schedule.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { PaymentCycleLesson } from '../../enrolment/entities/payment-cycle-lesson.entity';
import { Qualification } from '../../qualification/entities/qualification.entity';
import { Lesson } from '../entities/lesson.entity';
import { PrivateLesson } from '../entities/private-lesson.entity';
import { LessonHierarchy } from '../entities/lesson-hierarchy.entity';
import { LessonDiscount } from '../entities/lesson-discount.entity';
import { BulkRescheduleLesson } from '../entities/bulk-reschedule-lesson.entity';
import { LessonPayment } from '../entities/lesson-payment.entity';
import { LessonStatusEnum } from '../enums/lesson-status';
import { RoundingUtils } from '../../utils/rounding.utils';

@Injectable()
export class LessonTeacherChangeRepository {
  /**
   * Injects the repositories needed to query and update lesson, course, and payment data.
   */
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(CourseSchedule)
    private readonly courseScheduleRepository: Repository<CourseSchedule>,
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    @InjectRepository(PaymentCycleLesson)
    private readonly paymentCycleLessonRepository: Repository<PaymentCycleLesson>,
    @InjectRepository(Qualification)
    private readonly qualificationRepository: Repository<Qualification>,
    @InjectRepository(Lesson)
    public readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(PrivateLesson)
    private readonly privateLessonRepository: Repository<PrivateLesson>,
    @InjectRepository(LessonHierarchy)
    private readonly lessonHierarchyRepository: Repository<LessonHierarchy>,
    @InjectRepository(LessonDiscount)
    private readonly lessonDiscountRepository: Repository<LessonDiscount>,
    @InjectRepository(BulkRescheduleLesson)
    private readonly bulkRescheduleLessonRepository: Repository<BulkRescheduleLesson>,
    @InjectRepository(LessonPayment)
    private readonly lessonPaymentRepository: Repository<LessonPayment>,
  ) {}

  /**
   * Initialize reminders after the replacement lesson is confirmed.
   */
  async ensurePrivateLessonEmailStatuses(lessonId: number, manager?: EntityManager): Promise<void> {
    const { lessonRepository } = this.getScopedRepositories(manager);
    await ensurePrivateLessonEmailStatuses(
      (manager ?? lessonRepository.manager).getRepository(PrivateLessonEmailStatus),
      [lessonId],
    );
  }

  /** Returns repositories scoped to the active transaction. */
  private getScopedRepositories(manager?: EntityManager) {
    return {
      courseRepository: manager ? manager.getRepository(Course) : this.courseRepository,
      courseScheduleRepository: manager ? manager.getRepository(CourseSchedule) : this.courseScheduleRepository,
      enrolmentRepository: manager ? manager.getRepository(Enrolment) : this.enrolmentRepository,
      paymentCycleLessonRepository: manager ? manager.getRepository(PaymentCycleLesson) : this.paymentCycleLessonRepository,
      qualificationRepository: manager ? manager.getRepository(Qualification) : this.qualificationRepository,
      lessonRepository: manager ? manager.getRepository(Lesson) : this.lessonRepository,
      privateLessonRepository: manager ? manager.getRepository(PrivateLesson) : this.privateLessonRepository,
      lessonHierarchyRepository: manager ? manager.getRepository(LessonHierarchy) : this.lessonHierarchyRepository,
      lessonDiscountRepository: manager ? manager.getRepository(LessonDiscount) : this.lessonDiscountRepository,
      bulkRescheduleLessonRepository: manager ? manager.getRepository(BulkRescheduleLesson) : this.bulkRescheduleLessonRepository,
      lessonPaymentRepository: manager ? manager.getRepository(LessonPayment) : this.lessonPaymentRepository,
    };
  }

  /**
   * Runs repository work inside the underlying database transaction when supported.
   */
  async runInTransaction<T>(callback: (manager?: EntityManager) => Promise<T>): Promise<T> {
    const transactionManager = this.lessonRepository.manager;
    if (typeof transactionManager?.transaction !== 'function') {
      return callback(undefined);
    }

    return transactionManager.transaction(async (manager) => callback(manager));
  }

  /**
   * Loads the enrolment and its course for teacher-change confirmation.
   */
  async findEnrolmentWithCourse(enrolmentId: number, manager?: EntityManager): Promise<Enrolment | null> {
    const { enrolmentRepository } = this.getScopedRepositories(manager);
    return enrolmentRepository.findOne({
      where: { id: enrolmentId, isDeleted: false },
      relations: ['course'],
    });
  }

  /**
   * Returns the confirmed lessons that need to be replaced during teacher change.
   */
  async findConfirmedLessonsForEnrolment(
    enrolmentId: number,
    changesFromDateStr: string,
    manager?: EntityManager,
  ): Promise<Lesson[]> {
    const { lessonRepository } = this.getScopedRepositories(manager);
    return lessonRepository
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.course', 'course', 'course.isDeleted = false')
      .leftJoinAndSelect('lesson.discounts', 'discounts')
      .leftJoin('course.enrolments', 'enrolment', 'enrolment.id = :enrolmentId', { enrolmentId })
      .where('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('DATE(lesson.date) >= :changesFrom', { changesFrom: changesFromDateStr })
      .andWhere('lesson.status != :canceled', { canceled: LessonStatusEnum.CANCELED })
      .andWhere('course.isDeleted = false')
      .andWhere('enrolment.id = :enrolmentId', { enrolmentId })
      .orderBy('lesson.date', 'ASC')
      .getMany();
  }

  /**
   * Returns the draft lessons generated for the new teacher during preview.
   */
  async findDraftLessonsForEnrolment(
    enrolmentId: number,
    teacherId: number,
    changesFromDateStr: string,
    manager?: EntityManager,
  ): Promise<Lesson[]> {
    const { lessonRepository } = this.getScopedRepositories(manager);
    return lessonRepository
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.course', 'course', 'course.isDeleted = false')
      .leftJoinAndSelect('course.program', 'program')
      .leftJoin('course.enrolments', 'enrolment', 'enrolment.id = :enrolmentId', { enrolmentId })
      .where('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: false })
      .andWhere('DATE(lesson.date) >= :changesFrom', { changesFrom: changesFromDateStr })
      .andWhere('lesson.status != :canceled', { canceled: LessonStatusEnum.CANCELED })
      .andWhere('course.isDeleted = false')
      .andWhere('enrolment.id = :enrolmentId', { enrolmentId })
      .andWhere('lesson.teacherId = :teacherId', { teacherId })
      .orderBy('lesson.date', 'ASC')
      .getMany();
  }

  /**
   * Loads a course by ID for course-level updates after confirmation.
   */
  async findCourseById(courseId: number, manager?: EntityManager): Promise<Course | null> {
    const { courseRepository } = this.getScopedRepositories(manager);
    return courseRepository.findOne({ where: { id: courseId } });
  }

  /**
   * Loads a lesson with its course and program so the service can recalculate rates.
   */
  async findLessonWithCourseProgram(lessonId: number, manager?: EntityManager): Promise<Lesson | null> {
    const { lessonRepository } = this.getScopedRepositories(manager);
    return lessonRepository.findOne({
      where: { id: lessonId },
      relations: ['course', 'course.program'],
    });
  }

  /**
   * Loads all discounts already attached to a lesson.
   */
  async findLessonDiscounts(lessonId: number, manager?: EntityManager): Promise<LessonDiscount[]> {
    const { lessonDiscountRepository } = this.getScopedRepositories(manager);
    return lessonDiscountRepository.find({
      where: { lessonId },
    });
  }

  /**
   * Copies old lesson discounts to the replacement lesson when the draft has none yet.
   */
  async copyLessonDiscounts(oldLessonId: number, newLessonId: number, manager?: EntityManager): Promise<void> {
    const { lessonDiscountRepository } = this.getScopedRepositories(manager);
    const oldDiscounts = await lessonDiscountRepository.find({
      where: { lessonId: oldLessonId },
    });

    if (oldDiscounts.length === 0) {
      return;
    }

    for (const oldDiscount of oldDiscounts) {
      const newDiscount = lessonDiscountRepository.create({
        lessonId: newLessonId,
        value: oldDiscount.value,
        enrolmentId: oldDiscount.enrolmentId,
        valueType: oldDiscount.valueType,
        type: oldDiscount.type,
      });
      await lessonDiscountRepository.save(newDiscount);
    }
  }

  /**
   * Marks a lesson as canceled so the old lesson is retired after the teacher switch.
   */
  async cancelLesson(lessonId: number, manager?: EntityManager): Promise<void> {
    const { lessonRepository } = this.getScopedRepositories(manager);
    await lessonRepository.update({ id: lessonId }, { status: LessonStatusEnum.CANCELED });
  }

  /**
   * Sums active payments on the old lesson so they can be transferred to the new one.
   */
  async getLessonPaymentsTotal(oldLessonId: number, manager?: EntityManager): Promise<number> {
    const { lessonPaymentRepository } = this.getScopedRepositories(manager);
    const paidAmountResult = await lessonPaymentRepository
      .createQueryBuilder('lp')
      .select('COALESCE(SUM(lp.amount), 0)', 'total')
      .where('lp.lessonId = :oldLessonId', { oldLessonId })
      .andWhere('lp.isDeleted = :isDeleted', { isDeleted: 0 })
      .getRawOne();

    return parseFloat(paidAmountResult?.total || '0') || 0;
  }

  /**
   * Moves active payment rows from the old lesson to the replacement lesson.
   */
  async moveLessonPayments(oldLessonId: number, newLessonId: number, manager?: EntityManager): Promise<void> {
    const { lessonPaymentRepository } = this.getScopedRepositories(manager);
    await lessonPaymentRepository
      .createQueryBuilder()
      .update(LessonPayment)
      .set({ lessonId: newLessonId })
      .where('lessonId = :oldLessonId', { oldLessonId })
      .andWhere('isDeleted = :isDeleted', { isDeleted: 0 })
      .execute();
  }

  /**
   * Creates the lesson hierarchy entries that link the old lesson to the replacement lesson.
   */
  async createRescheduleHierarchy(oldLessonId: number, newLessonId: number, manager?: EntityManager): Promise<void> {
    const { lessonHierarchyRepository } = this.getScopedRepositories(manager);

    const existingHierarchy = await lessonHierarchyRepository.findOne({
      where: {
        lessonId: oldLessonId,
        childLessonId: newLessonId,
      },
    });

    if (existingHierarchy) {
      return;
    }

    const parentHierarchies = await lessonHierarchyRepository.find({
      where: { childLessonId: oldLessonId },
    });

    const newHierarchies = parentHierarchies.map((h) =>
      lessonHierarchyRepository.create({
        lessonId: h.lessonId,
        childLessonId: newLessonId,
        depth: h.depth + 1,
      }),
    );

    const rootHierarchy = lessonHierarchyRepository.create({
      lessonId: newLessonId,
      childLessonId: newLessonId,
      depth: 0,
    });

    if (newHierarchies.length > 0) {
      await lessonHierarchyRepository.save(newHierarchies);
    }
    await lessonHierarchyRepository.save(rootHierarchy);
  }

  /**
   * Loads the teacher qualification so the replacement lesson can inherit the correct rate.
   */
  async findQualificationByTeacherAndProgram(
    teacherId: number,
    programId: number,
    manager?: EntityManager,
  ): Promise<Qualification | null> {
    const { qualificationRepository } = this.getScopedRepositories(manager);
    return qualificationRepository.findOne({
      where: {
        teacherId,
        programId,
        isDeleted: false,
      },
    });
  }

  /**
   * Updates the teacher rate on the replacement lesson record.
   */
  async updateLessonTeacherRate(
    lessonId: number,
    teacherRate: number,
    manager?: EntityManager,
  ): Promise<void> {
    const { lessonRepository } = this.getScopedRepositories(manager);
    await lessonRepository.update(
      { id: lessonId },
      { teacherRate },
    );
  }

  /**
   * Inserts or updates the private lesson summary for the replacement lesson.
   */
  async upsertPrivateLesson(
    lessonId: number,
    expiryDate: Date,
    total: number,
    balance: number,
    dueDate: Date,
    manager?: EntityManager,
  ): Promise<void> {
    const { privateLessonRepository } = this.getScopedRepositories(manager);
    const existingPrivateLesson = await privateLessonRepository.findOne({
      where: { lessonId },
    });

    if (existingPrivateLesson) {
      await privateLessonRepository.update(
        { id: existingPrivateLesson.id },
        {
          total: RoundingUtils.roundDecimal(total, 2),
          balance: RoundingUtils.roundDecimal(balance, 2),
        },
      );
      return;
    }

    const roundedTotal = RoundingUtils.roundDecimal(total, 2);
    const roundedBalance = RoundingUtils.roundDecimal(balance, 2);
    const privateLesson = privateLessonRepository.create({
      lessonId,
      expiryDate,
      total: roundedTotal,
      balance: roundedBalance,
      dueDate,
    });
    await privateLessonRepository.save(privateLesson);
  }

  /**
   * Reassigns payment-cycle lesson rows from the old lesson to the replacement lesson.
   */
  async updatePaymentCycleLessons(oldLessonId: number, newLessonId: number, manager?: EntityManager): Promise<void> {
    const { paymentCycleLessonRepository } = this.getScopedRepositories(manager);
    await paymentCycleLessonRepository
      .createQueryBuilder()
      .update(PaymentCycleLesson)
      .set({ lessonId: newLessonId })
      .where('lessonId = :oldLessonId', { oldLessonId })
      .execute();
  }

  /**
   * Creates the bulk-reschedule marker for the replacement lesson if one does not already exist.
   */
  async saveBulkRescheduleIfMissing(
    lessonId: number,
    userId?: number,
    manager?: EntityManager,
  ): Promise<void> {
    const { bulkRescheduleLessonRepository } = this.getScopedRepositories(manager);
    const existingBulkReschedule = await bulkRescheduleLessonRepository.findOne({
      where: { lessonId },
    });

    if (existingBulkReschedule) {
      return;
    }

    const bulkReschedule = bulkRescheduleLessonRepository.create({
      lessonId,
      createdByUserId: userId,
      updatedByUserId: userId,
    });
    await bulkRescheduleLessonRepository.save(bulkReschedule);
  }

  /**
   * Updates the course teacher when the teacher-change confirmation should also move course ownership.
   */
  async updateCourseTeacherIfChanged(
    courseId: number,
    teacherId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const { courseRepository } = this.getScopedRepositories(manager);
    const course = await courseRepository.findOne({
      where: { id: courseId },
    });

    if (course && course.teacherId !== teacherId) {
      await courseRepository.update(
        { id: courseId },
        { teacherId },
      );
    }
  }

  /**
   * Marks the replacement lesson as confirmed after all related data has been moved.
   */
  async confirmLesson(lessonId: number, manager?: EntityManager): Promise<void> {
    const { lessonRepository } = this.getScopedRepositories(manager);
    await lessonRepository.update(
      { id: lessonId },
      { isConfirmed: true },
    );
  }

  /**
   * Adjusts the course schedule window after the teacher-change reschedule is finalized.
   */
  async updateCourseScheduleForReschedule(
    lesson: Lesson,
    startDate: Date,
    endDate: Date,
    manager?: EntityManager,
  ): Promise<void> {
    const {
      courseRepository,
      courseScheduleRepository,
    } = this.getScopedRepositories(manager);

    const recentSchedule = await courseScheduleRepository.findOne({
      where: { courseId: lesson.courseId, isRecent: true },
    });

    await closeCourseScheduleHistory(courseScheduleRepository, lesson.courseId, startDate);

    let scheduleStartDate: Date;
    if (recentSchedule) {
      scheduleStartDate = new Date(startDate);
      scheduleStartDate.setUTCHours(0, 0, 0, 0);
    } else {
      const course = await courseRepository.findOne({ where: { id: lesson.courseId } });
      scheduleStartDate = course?.startDate ? new Date(course.startDate) : new Date(startDate);
      scheduleStartDate.setUTCHours(0, 0, 0, 0);
    }

    const lessonDate = new Date(lesson.date);
    const fromTime = `${String(lessonDate.getUTCHours()).padStart(2, '0')}:${String(lessonDate.getUTCMinutes()).padStart(2, '0')}:${String(lessonDate.getUTCSeconds()).padStart(2, '0')}`;
    const duration = lesson.duration || '00:30:00';
    const dayOfWeek = lessonDate.getUTCDay() === 0 ? 7 : lessonDate.getUTCDay();

    const newSchedule = courseScheduleRepository.create({
      courseId: lesson.courseId,
      teacherId: lesson.teacherId,
      day: dayOfWeek,
      fromTime,
      duration: duration.includes(':') && duration.split(':').length === 2 ? duration + ':00' : duration,
      startDate: scheduleStartDate,
      endDate,
      isRecent: true,
    });

    await courseScheduleRepository
      .createQueryBuilder()
      .update(CourseSchedule)
      .set({ isRecent: false })
      .where('courseId = :courseId', { courseId: lesson.courseId })
      .execute();

    await courseScheduleRepository.save(newSchedule);
  }
}
