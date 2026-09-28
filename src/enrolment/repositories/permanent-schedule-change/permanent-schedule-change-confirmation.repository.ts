/**
 * Transaction-scoped TypeORM persistence for confirming permanent schedule
 * changes. This file contains database operations only; confirmation ordering
 * and business decisions remain in the PSC confirmer.
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Not, Repository } from 'typeorm';
import { closeCourseScheduleHistory } from '../../../course/course-schedule-history';
import { Course } from '../../../course/entities/course.entity';
import { CourseSchedule } from '../../../course/entities/course-schedule.entity';
import { BulkRescheduleLesson } from '../../../lesson/entities/bulk-reschedule-lesson.entity';
import { Lesson } from '../../../lesson/entities/lesson.entity';
import { LessonDiscount } from '../../../lesson/entities/lesson-discount.entity';
import { LessonHierarchy } from '../../../lesson/entities/lesson-hierarchy.entity';
import { LessonPayment } from '../../../lesson/entities/lesson-payment.entity';
import { LessonSplitUsage } from '../../../lesson/entities/lesson-split-usage.entity';
import { PrivateLesson } from '../../../lesson/entities/private-lesson.entity';
import { PrivateLessonEmailStatus } from '../../../lesson/entities/private-lesson-email-status.entity';
import { LessonStatusEnum } from '../../../lesson/enums/lesson-status';
import { ensurePrivateLessonEmailStatuses } from '../../../lesson/helpers/ensure-lesson-email-statuses';
import { CreditUsage } from '../../../payment/entities/credit-usage.entity';
import { Payment } from '../../../payment/entities/payment.entity';
import { PaymentCycle } from '../../../payment/entities/payment-cycle.entity';
import { Qualification } from '../../../qualification/entities/qualification.entity';
import { Enrolment } from '../../entities/enrolment.entity';
import { EnrolmentPaymentFrequency } from '../../entities/enrolment-payment-frequency.entity';
import { PaymentCycleLesson } from '../../entities/payment-cycle-lesson.entity';
import { applyPermanentScheduleLessonEligibility } from '../../permanent-schedule-change/domain/permanent-schedule-eligibility.policy';

/** Repository set required to persist every relation affected by confirmation. */
export interface PermanentScheduleChangeConfirmationRepositories {
  courseRepository: Repository<Course>;
  lessonRepository: Repository<Lesson>;
  privateLessonRepository: Repository<PrivateLesson>;
  lessonHierarchyRepository: Repository<LessonHierarchy>;
  lessonDiscountRepository: Repository<LessonDiscount>;
  bulkRescheduleLessonRepository: Repository<BulkRescheduleLesson>;
  courseScheduleRepository: Repository<CourseSchedule>;
  paymentCycleLessonRepository: Repository<PaymentCycleLesson>;
  qualificationRepository: Repository<Qualification>;
  lessonPaymentRepository: Repository<LessonPayment>;
  enrolmentRepository: Repository<Enrolment>;
  enrolmentPaymentFrequencyRepository: Repository<EnrolmentPaymentFrequency>;
  paymentCycleRepository: Repository<PaymentCycle>;
  privateLessonEmailStatusRepository: Repository<PrivateLessonEmailStatus>;
}

/** Builds a PSC repository set for the optional transaction entity manager. */
export type PermanentScheduleChangeRepositoryProvider = (
  manager?: EntityManager,
) => PermanentScheduleChangeConfirmationRepositories;

/**
 * Database contract used by the PSC confirmation business workflow. Keeping
 * this interface in the repository file prevents services from reaching into
 * TypeORM repositories directly.
 */
export interface PermanentScheduleChangeConfirmationPersistence {
  findCourse(courseId: number, locationId: number): Promise<Course | null>;
  findUnconfirmedLessons(courseId: number): Promise<Lesson[]>;
  markCourseConfirmed(courseId: number): Promise<void>;
  markLessonsConfirmed(lessonIds: number[]): Promise<void>;
  ensureLessonEmailStatuses(lessonIds: number[]): Promise<void>;
  updateCourseEndDate(courseId: number, endDate: Date): Promise<void>;
  findEnrolment(
    enrolmentId: number,
    courseId: number,
  ): Promise<Enrolment | null>;
  confirmEnrolment(enrolmentId: number, endDate: Date): Promise<void>;
  findEnrolmentId(
    enrolmentId: number,
    courseId: number,
  ): Promise<number | null>;
  findEnrolmentPaymentFrequency(
    enrolmentId: number,
  ): Promise<EnrolmentPaymentFrequency | null>;
  findPaymentCycles(enrolmentId: number): Promise<PaymentCycle[]>;
  savePaymentCycle(values: Partial<PaymentCycle>): Promise<PaymentCycle>;
  createPaymentCycleLessonLinks(
    paymentCycleId: number,
    courseId: number,
    startDate: Date,
    endDate: Date,
  ): Promise<void>;
  findConfirmedLessonsForDueDate(courseId: number): Promise<Lesson[]>;
  updateLessonDueDates(
    updates: Array<{ lessonId: number; dueDate: Date }>,
  ): Promise<void>;
  findNewLessons(ids: number[]): Promise<Lesson[]>;
  findOldRescheduledLessons(
    courseId: number,
    boundary: Date,
  ): Promise<Lesson[]>;
  findOldLessons(
    courseId: number,
    boundary: Date,
    excludedLessonIds: number[],
  ): Promise<Lesson[]>;
  updateCourseTeacher(courseId: number, teacherId: number): Promise<unknown>;
  findPaidAmounts(lessonIds: number[]): Promise<Map<number, number>>;
  findDiscounts(lessonIds: number[]): Promise<LessonDiscount[]>;
  findPrivateLessons(lessonIds: number[]): Promise<PrivateLesson[]>;
  findBulkRescheduleLessonIds(lessonIds: number[]): Promise<Set<number>>;
  cancelLesson(lessonId: number): Promise<void>;
  updateLessonDueDate(lessonId: number, dueDate: string): Promise<void>;
  moveSplitUsage(oldLessonId: number, newLessonId: number): Promise<void>;
  findTeacherRate(teacherId: number, programId: number): Promise<number>;
  updateTeacherRate(lessonId: number, teacherRate: number): Promise<void>;
  moveLessonPayments(
    oldLessonId: number,
    newLessonId: number,
  ): Promise<number[]>;
  updateDebitPaymentReferences(
    paymentIds: number[],
    newLessonId: number,
  ): Promise<void>;
  saveDiscountCopies(
    lessonId: number,
    discounts: LessonDiscount[],
  ): Promise<LessonDiscount[]>;
  savePrivateLesson(values: Partial<PrivateLesson>): Promise<PrivateLesson>;
  updatePrivateLesson(
    criteria: { id?: number; lessonId?: number },
    values: Partial<PrivateLesson>,
  ): Promise<void>;
  movePaymentCycle(oldLessonId: number, newLessonId: number): Promise<void>;
  saveBulkRescheduleLesson(lessonId: number, userId: number): Promise<void>;
  resolvePrivateLessonRoot(
    lessonId: number,
  ): Promise<{ rootLessonId: number; rootExpiryDate: Date | null }>;
  updateCourseSchedule(
    lesson: Lesson,
    startDate: Date,
    endDate: Date,
  ): Promise<void>;
  createRescheduleHierarchy(
    oldLessonId: number,
    newLessonId: number,
  ): Promise<void>;
}

/** TypeORM adapter scoped to one PSC confirmation transaction. */
export class PermanentScheduleChangeConfirmationPersistenceAdapter implements PermanentScheduleChangeConfirmationPersistence {
  private readonly repositories: PermanentScheduleChangeConfirmationRepositories;

  /** Resolve all repositories against the confirmation transaction when given. */
  constructor(
    getRepositories: PermanentScheduleChangeRepositoryProvider,
    manager?: EntityManager,
  ) {
    this.repositories = getRepositories(manager);
  }

  /** Load the PSC course and its program inside the confirmation transaction. */
  findCourse(courseId: number, locationId: number): Promise<Course | null> {
    return this.repositories.courseRepository.findOne({
      where: { id: courseId, locationId, isDeleted: false },
      relations: ['program'],
    });
  }

  /** Load only the current unconfirmed PSC replacement lessons in date order. */
  findUnconfirmedLessons(courseId: number): Promise<Lesson[]> {
    return this.repositories.lessonRepository.find({
      where: { courseId, isConfirmed: false, isDeleted: false },
      order: { date: 'ASC' },
    });
  }

  /** Mark the owning course confirmed without overwriting schedule fields. */
  async markCourseConfirmed(courseId: number): Promise<void> {
    await this.repositories.courseRepository.update(
      { id: courseId },
      { isConfirmed: 1 },
    );
  }

  /** Mark replacement lessons confirmed after PSC relationship migration. */
  async markLessonsConfirmed(lessonIds: number[]): Promise<void> {
    for (const lessonId of lessonIds) {
      await this.repositories.lessonRepository.update(
        { id: lessonId },
        { isConfirmed: true },
      );
    }
  }

  /** Create only missing reminder statuses for replacement private lessons. */
  ensureLessonEmailStatuses(lessonIds: number[]): Promise<void> {
    return ensurePrivateLessonEmailStatuses(
      this.repositories.privateLessonEmailStatusRepository,
      lessonIds,
    );
  }

  /** Extend the course to the final replacement while preserving its start. */
  async updateCourseEndDate(courseId: number, endDate: Date): Promise<void> {
    await this.repositories.courseRepository.update(
      { id: courseId },
      { endDate },
    );
  }

  /** Load the route enrolment and billing relations needed after confirmation. */
  findEnrolment(
    enrolmentId: number,
    courseId: number,
  ): Promise<Enrolment | null> {
    return this.repositories.enrolmentRepository.findOne({
      where: { id: enrolmentId, courseId, isDeleted: false },
      relations: ['student', 'student.user', 'paymentFrequency'],
    });
  }

  /** Confirm the enrolment and expose PSC information at the new end date. */
  async confirmEnrolment(enrolmentId: number, endDate: Date): Promise<void> {
    await this.repositories.enrolmentRepository.update(
      { id: enrolmentId },
      {
        isConfirmed: 1,
        endDateTime: endDate,
        isEnableRescheduleInfo: true,
      },
    );
  }

  /** Resolve the route enrolment ID without loading unrelated relations. */
  async findEnrolmentId(
    enrolmentId: number,
    courseId: number,
  ): Promise<number | null> {
    const enrolment = await this.repositories.enrolmentRepository.findOne({
      where: { id: enrolmentId, courseId, isDeleted: false },
      select: ['id'],
    });
    return enrolment?.id ?? null;
  }

  /** Load the active billing-frequency configuration for this enrolment. */
  findEnrolmentPaymentFrequency(
    enrolmentId: number,
  ): Promise<EnrolmentPaymentFrequency | null> {
    return this.repositories.enrolmentPaymentFrequencyRepository.findOne({
      where: { enrolmentId, isDeleted: false },
    });
  }

  /** Load active payment cycles in their billing order. */
  findPaymentCycles(enrolmentId: number): Promise<PaymentCycle[]> {
    return this.repositories.paymentCycleRepository.find({
      where: { enrolmentId, isDeleted: 0 },
      order: { startDate: 'ASC' },
    });
  }

  /** Create and persist one payment cycle in the current transaction. */
  savePaymentCycle(values: Partial<PaymentCycle>): Promise<PaymentCycle> {
    return this.repositories.paymentCycleRepository.save(
      this.repositories.paymentCycleRepository.create(values),
    );
  }

  /**
   * Link all confirmed lessons in a cycle range, restoring soft-deleted links
   * instead of introducing duplicates.
   */
  async createPaymentCycleLessonLinks(
    paymentCycleId: number,
    courseId: number,
    startDate: Date,
    endDate: Date,
  ): Promise<void> {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const lessons = await this.repositories.lessonRepository
      .createQueryBuilder('lesson')
      .where('lesson.courseId = :courseId', { courseId })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.status != :canceledStatus', {
        canceledStatus: LessonStatusEnum.CANCELED,
      })
      .andWhere('lesson.date >= :startDate', { startDate: start })
      .andWhere('lesson.date <= :endDate', { endDate: end })
      .orderBy('COALESCE(lesson.originalDate, lesson.date)', 'ASC')
      .addOrderBy('lesson.date', 'ASC')
      .getMany();
    if (lessons.length === 0) return;

    const lessonIds = lessons.map(({ id }) => id);
    const existingLinks = await this.repositories.paymentCycleLessonRepository
      .createQueryBuilder('pcl')
      .where('pcl.paymentCycleId = :paymentCycleId', { paymentCycleId })
      .andWhere('pcl.lessonId IN (:...lessonIds)', { lessonIds })
      .getMany();
    const existingByLessonId = new Map(
      existingLinks.map((link) => [link.lessonId, link]),
    );
    const linksToRestore: PaymentCycleLesson[] = [];
    const linksToCreate: Array<{
      paymentCycleId: number;
      lessonId: number;
      isDeleted: number;
    }> = [];

    for (const lessonId of lessonIds) {
      const existing = existingByLessonId.get(lessonId);
      if (!existing) {
        linksToCreate.push({ paymentCycleId, lessonId, isDeleted: 0 });
      } else if (existing.isDeleted !== 0) {
        existing.isDeleted = 0;
        linksToRestore.push(existing);
      }
    }
    if (linksToRestore.length > 0) {
      await this.repositories.paymentCycleLessonRepository.save(linksToRestore);
    }
    if (linksToCreate.length > 0) {
      await this.repositories.paymentCycleLessonRepository
        .createQueryBuilder()
        .insert()
        .into(PaymentCycleLesson)
        .values(linksToCreate)
        .execute();
    }
  }

  /** Load all active confirmed lessons used for payment-cycle due dates. */
  findConfirmedLessonsForDueDate(courseId: number): Promise<Lesson[]> {
    return this.repositories.lessonRepository.find({
      where: {
        courseId,
        isConfirmed: true,
        isDeleted: false,
        status: Not(LessonStatusEnum.CANCELED),
      },
      order: { date: 'ASC' },
    });
  }

  /** Persist due dates in bounded chunks to avoid an unbounded write burst. */
  async updateLessonDueDates(
    updates: Array<{ lessonId: number; dueDate: Date }>,
  ): Promise<void> {
    const chunkSize = 25;
    for (let index = 0; index < updates.length; index += chunkSize) {
      const chunk = updates.slice(index, index + chunkSize);
      await Promise.all(
        chunk.map(({ lessonId, dueDate }) =>
          this.repositories.lessonRepository.update(
            { id: lessonId },
            { dueDate },
          ),
        ),
      );
    }
  }

  /** Load replacement lessons with the course and program data used by rules. */
  findNewLessons(ids: number[]): Promise<Lesson[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.repositories.lessonRepository.find({
      where: ids.map((id) => ({ id })),
      relations: ['course', 'course.program'],
    });
  }

  /** Find eligible old rescheduled lessons that are not actively invoiced. */
  findOldRescheduledLessons(
    courseId: number,
    boundary: Date,
  ): Promise<Lesson[]> {
    return applyPermanentScheduleLessonEligibility(
      this.repositories.lessonRepository.createQueryBuilder('lesson'),
      courseId,
      boundary,
    )
      .andWhere('lesson.status = :status', {
        status: LessonStatusEnum.RESCHEDULED,
      })
      .leftJoin('lesson.invoiceItemLessons', 'iil')
      .leftJoin('iil.invoiceLineItem', 'ili')
      .leftJoin('ili.invoice', 'inv')
      .andWhere('(ili.id IS NULL OR ili.isDeleted = :iliIsDeleted)', {
        iliIsDeleted: true,
      })
      .andWhere(
        '(inv.id IS NULL OR inv.isDeleted = :invIsDeleted OR inv.isVoid = :invIsVoid)',
        { invIsDeleted: true, invIsVoid: 1 },
      )
      .orderBy('lesson.date', 'ASC')
      .getMany();
  }

  /** Find old lessons to replace, excluding lessons restored by PSC policy. */
  findOldLessons(
    courseId: number,
    boundary: Date,
    excludedLessonIds: number[],
  ): Promise<Lesson[]> {
    const query = applyPermanentScheduleLessonEligibility(
      this.repositories.lessonRepository.createQueryBuilder('lesson'),
      courseId,
      boundary,
    )
      .leftJoin('lesson.invoiceItemLessons', 'iil')
      .leftJoin('iil.invoiceLineItem', 'ili')
      .leftJoin('ili.invoice', 'inv')
      .leftJoinAndSelect('lesson.discounts', 'discounts')
      .andWhere('(ili.id IS NULL OR ili.isDeleted = :iliIsDeleted)', {
        iliIsDeleted: true,
      })
      .andWhere(
        '(inv.id IS NULL OR inv.isDeleted = :invIsDeleted OR inv.isVoid = :invIsVoid)',
        { invIsDeleted: true, invIsVoid: 1 },
      );

    if (excludedLessonIds.length > 0) {
      query.andWhere('lesson.id NOT IN (:...lessonIds)', {
        lessonIds: excludedLessonIds,
      });
    }

    return query.orderBy('lesson.date', 'ASC').getMany();
  }

  /** Assign the replacement lesson's teacher to the course. */
  updateCourseTeacher(courseId: number, teacherId: number): Promise<unknown> {
    return this.repositories.courseRepository.update(
      { id: courseId },
      { teacherId },
    );
  }

  /** Aggregate non-deleted payment amounts by old lesson ID. */
  async findPaidAmounts(lessonIds: number[]): Promise<Map<number, number>> {
    if (lessonIds.length === 0) return new Map();
    const rows = await this.repositories.lessonPaymentRepository
      .createQueryBuilder('lp')
      .select('lp.lessonId', 'lessonId')
      .addSelect('COALESCE(SUM(lp.amount), 0)', 'total')
      .where('lp.lessonId IN (:...lessonIds)', { lessonIds })
      .andWhere('lp.isDeleted = :isDeleted', { isDeleted: 0 })
      .groupBy('lp.lessonId')
      .getRawMany<{ lessonId: number | string; total: number | string }>();

    return new Map(
      rows.map(({ lessonId, total }) => [
        Number(lessonId),
        parseFloat(String(total ?? '0')) || 0,
      ]),
    );
  }

  /** Load discounts attached to any of the supplied lessons. */
  findDiscounts(lessonIds: number[]): Promise<LessonDiscount[]> {
    if (lessonIds.length === 0) return Promise.resolve([]);
    return this.repositories.lessonDiscountRepository.find({
      where: { lessonId: In(lessonIds) },
    });
  }

  /** Load private-lesson records attached to any supplied lessons. */
  findPrivateLessons(lessonIds: number[]): Promise<PrivateLesson[]> {
    if (lessonIds.length === 0) return Promise.resolve([]);
    return this.repositories.privateLessonRepository.find({
      where: { lessonId: In(lessonIds) },
    });
  }

  /** Return replacement lesson IDs already recorded as bulk reschedules. */
  async findBulkRescheduleLessonIds(lessonIds: number[]): Promise<Set<number>> {
    if (lessonIds.length === 0) return new Set();
    const rows = await this.repositories.bulkRescheduleLessonRepository.find({
      where: { lessonId: In(lessonIds) },
      select: ['lessonId'],
    });
    return new Set(rows.map(({ lessonId }) => lessonId));
  }

  /** Mark an old lesson as cancelled after its replacement is prepared. */
  async cancelLesson(lessonId: number): Promise<void> {
    await this.repositories.lessonRepository.update(
      { id: lessonId },
      { status: LessonStatusEnum.CANCELED },
    );
  }

  /** Preserve the old lesson's due date on its replacement. */
  async updateLessonDueDate(lessonId: number, dueDate: string): Promise<void> {
    await this.repositories.lessonRepository.update(
      { id: lessonId },
      { dueDate },
    );
  }

  /** Move split-lesson usage from the old lesson to its replacement. */
  async moveSplitUsage(
    oldLessonId: number,
    newLessonId: number,
  ): Promise<void> {
    await this.repositories.lessonRepository
      .createQueryBuilder()
      .update(LessonSplitUsage)
      .set({ extendedLessonId: newLessonId })
      .where('extendedLessonId = :oldLessonId', { oldLessonId })
      .execute();
  }

  /** Resolve the active qualification rate for a teacher and program. */
  async findTeacherRate(teacherId: number, programId: number): Promise<number> {
    const qualification =
      await this.repositories.qualificationRepository.findOne({
        where: { teacherId, programId, isDeleted: false },
      });
    return Number(qualification?.rate ?? 0);
  }

  /** Store the resolved teacher rate on a replacement lesson. */
  async updateTeacherRate(
    lessonId: number,
    teacherRate: number,
  ): Promise<void> {
    await this.repositories.lessonRepository.update(
      { id: lessonId },
      { teacherRate },
    );
  }

  /** Move active lesson payments and return their distinct payment IDs. */
  async moveLessonPayments(
    oldLessonId: number,
    newLessonId: number,
  ): Promise<number[]> {
    const lessonPayments = await this.repositories.lessonPaymentRepository.find(
      {
        where: { lessonId: oldLessonId, isDeleted: 0 },
        select: ['paymentId'],
      },
    );
    await this.repositories.lessonPaymentRepository
      .createQueryBuilder()
      .update(LessonPayment)
      .set({ lessonId: newLessonId })
      .where('lessonId = :oldLessonId', { oldLessonId })
      .andWhere('isDeleted = :isDeleted', { isDeleted: 0 })
      .execute();
    return Array.from(
      new Set(lessonPayments.map(({ paymentId }) => paymentId)),
    );
  }

  /** Point related debit-payment references at the replacement lesson. */
  async updateDebitPaymentReferences(
    paymentIds: number[],
    newLessonId: number,
  ): Promise<void> {
    if (paymentIds.length === 0) return;
    const rows = await this.repositories.lessonRepository
      .createQueryBuilder()
      .select([
        'cu.credit_payment_id AS creditPaymentId',
        'cu.debit_payment_id AS debitPaymentId',
      ])
      .from(CreditUsage, 'cu')
      .where('cu.credit_payment_id IN (:...paymentIds)', { paymentIds })
      .getRawMany<{ debitPaymentId: number | string }>();
    const debitPaymentIds = Array.from(
      new Set(
        rows
          .map(({ debitPaymentId }) => Number(debitPaymentId))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    );
    if (debitPaymentIds.length === 0) return;
    await this.repositories.lessonRepository
      .createQueryBuilder()
      .update(Payment)
      .set({ reference: `L-${newLessonId.toString().padStart(6, '0')}` })
      .where('id IN (:...debitPaymentIds)', { debitPaymentIds })
      .execute();
  }

  /** Copy missing lesson discounts to a replacement lesson. */
  async saveDiscountCopies(
    lessonId: number,
    discounts: LessonDiscount[],
  ): Promise<LessonDiscount[]> {
    const copies = discounts.map((discount) =>
      this.repositories.lessonDiscountRepository.create({
        lessonId,
        value: discount.value,
        enrolmentId: discount.enrolmentId,
        valueType: discount.valueType,
        type: discount.type,
      }),
    );
    return copies.length
      ? this.repositories.lessonDiscountRepository.save(copies)
      : [];
  }

  /** Create a private-lesson record for a replacement lesson. */
  async savePrivateLesson(
    values: Partial<PrivateLesson>,
  ): Promise<PrivateLesson> {
    return this.repositories.privateLessonRepository.save(
      this.repositories.privateLessonRepository.create(values),
    );
  }

  /** Update selected fields on an existing private-lesson record. */
  async updatePrivateLesson(
    criteria: { id?: number; lessonId?: number },
    values: Partial<PrivateLesson>,
  ): Promise<void> {
    await this.repositories.privateLessonRepository.update(criteria, values);
  }

  /** Move the payment-cycle association to the replacement lesson. */
  async movePaymentCycle(
    oldLessonId: number,
    newLessonId: number,
  ): Promise<void> {
    await this.repositories.paymentCycleLessonRepository
      .createQueryBuilder()
      .update(PaymentCycleLesson)
      .set({ lessonId: newLessonId })
      .where('lessonId = :oldLessonId', { oldLessonId })
      .andWhere('isDeleted = :isDeleted', { isDeleted: 0 })
      .execute();
  }

  /** Record a replacement lesson in the bulk-reschedule audit relation. */
  async saveBulkRescheduleLesson(
    lessonId: number,
    userId: number,
  ): Promise<void> {
    await this.repositories.bulkRescheduleLessonRepository.save(
      this.repositories.bulkRescheduleLessonRepository.create({
        lessonId,
        createdByUserId: userId,
        updatedByUserId: userId,
      }),
    );
  }

  /** Resolve the hierarchy root and its private-lesson expiry, when present. */
  async resolvePrivateLessonRoot(
    lessonId: number,
  ): Promise<{ rootLessonId: number; rootExpiryDate: Date | null }> {
    const rows = await this.repositories.lessonHierarchyRepository.find({
      where: { childLessonId: lessonId },
      order: { depth: 'DESC', lessonId: 'ASC' },
    });
    const rootLessonId = rows[0]?.lessonId ?? lessonId;
    if (rootLessonId === lessonId) {
      return { rootLessonId, rootExpiryDate: null };
    }
    const root = await this.repositories.privateLessonRepository.findOne({
      where: { lessonId: rootLessonId },
    });
    return {
      rootLessonId,
      rootExpiryDate: root?.expiryDate ? new Date(root.expiryDate) : null,
    };
  }

  /** Close schedule history and persist the replacement schedule as current. */
  async updateCourseSchedule(
    lesson: Lesson,
    startDate: Date,
    endDate: Date,
  ): Promise<void> {
    const { courseRepository, courseScheduleRepository } = this.repositories;
    const recentSchedule = await courseScheduleRepository.findOne({
      where: { courseId: lesson.courseId, isRecent: true },
    });
    await closeCourseScheduleHistory(
      courseScheduleRepository,
      lesson.courseId,
      startDate,
    );

    let scheduleStartDate = new Date(startDate);
    if (!recentSchedule) {
      const course = await courseRepository.findOne({
        where: { id: lesson.courseId },
      });
      scheduleStartDate = course?.startDate
        ? new Date(course.startDate)
        : new Date(startDate);
    }
    scheduleStartDate.setUTCHours(0, 0, 0, 0);

    const lessonDate = new Date(lesson.date);
    const fromTime = `${String(lessonDate.getUTCHours()).padStart(2, '0')}:${String(lessonDate.getUTCMinutes()).padStart(2, '0')}:${String(lessonDate.getUTCSeconds()).padStart(2, '0')}`;
    const duration = lesson.duration || '00:30:00';
    const schedule = courseScheduleRepository.create({
      courseId: lesson.courseId,
      teacherId: lesson.teacherId,
      day: lessonDate.getUTCDay() === 0 ? 7 : lessonDate.getUTCDay(),
      fromTime,
      duration:
        duration.includes(':') && duration.split(':').length === 2
          ? `${duration}:00`
          : duration,
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
    await courseScheduleRepository.save(schedule);
  }

  /** Rebuild ancestor links and the self-root link for a replacement lesson. */
  async createRescheduleHierarchy(
    oldLessonId: number,
    newLessonId: number,
  ): Promise<void> {
    const repository = this.repositories.lessonHierarchyRepository;
    const existing = await repository.findOne({
      where: { lessonId: oldLessonId, childLessonId: newLessonId },
    });
    if (existing) return;
    const parents = await repository.find({
      where: { childLessonId: oldLessonId },
    });
    const hierarchies = parents.map((parent) =>
      repository.create({
        lessonId: parent.lessonId,
        childLessonId: newLessonId,
        depth: parent.depth + 1,
      }),
    );
    if (hierarchies.length > 0) await repository.save(hierarchies);
    await repository.save(
      repository.create({
        lessonId: newLessonId,
        childLessonId: newLessonId,
        depth: 0,
      }),
    );
  }
}

/**
 * Injectable repository boundary for PSC confirmation. It owns transaction
 * creation and supplies a single transaction-scoped persistence adapter to the
 * business service.
 */
@Injectable()
export class PermanentScheduleChangeConfirmationRepository {
  /** Use the lesson repository's manager as the canonical TypeORM data source. */
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  /** Execute the complete PSC confirmation atomically. */
  transaction<T>(
    work: (
      persistence: PermanentScheduleChangeConfirmationPersistence,
      manager: EntityManager,
    ) => Promise<T>,
  ): Promise<T> {
    return this.lessonRepository.manager.transaction((manager) =>
      work(this.createPersistence(manager), manager),
    );
  }

  /** Resolve every PSC repository from the same transaction manager. */
  private createPersistence(
    manager: EntityManager,
  ): PermanentScheduleChangeConfirmationPersistence {
    return new PermanentScheduleChangeConfirmationPersistenceAdapter(() => ({
      courseRepository: manager.getRepository(Course),
      lessonRepository: manager.getRepository(Lesson),
      privateLessonRepository: manager.getRepository(PrivateLesson),
      lessonHierarchyRepository: manager.getRepository(LessonHierarchy),
      lessonDiscountRepository: manager.getRepository(LessonDiscount),
      bulkRescheduleLessonRepository:
        manager.getRepository(BulkRescheduleLesson),
      courseScheduleRepository: manager.getRepository(CourseSchedule),
      paymentCycleLessonRepository: manager.getRepository(PaymentCycleLesson),
      qualificationRepository: manager.getRepository(Qualification),
      lessonPaymentRepository: manager.getRepository(LessonPayment),
      enrolmentRepository: manager.getRepository(Enrolment),
      enrolmentPaymentFrequencyRepository: manager.getRepository(
        EnrolmentPaymentFrequency,
      ),
      paymentCycleRepository: manager.getRepository(PaymentCycle),
      privateLessonEmailStatusRepository: manager.getRepository(
        PrivateLessonEmailStatus,
      ),
    }));
  }
}
