import { ensurePrivateLessonEmailStatuses } from '../../helpers/ensure-lesson-email-statuses';
import { PrivateLessonEmailStatus } from '../../entities/private-lesson-email-status.entity';
import { Injectable } from '@nestjs/common';
import { EntityManager, In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Lesson } from '../../entities/lesson.entity';
import { LessonHierarchy } from '../../entities/lesson-hierarchy.entity';
// import { BulkRescheduleLesson } from '../../entities/bulk-reschedule-lesson.entity';
import { LessonSplitUsage } from '../../entities/lesson-split-usage.entity';
import { LessonPayment } from '../../entities/lesson-payment.entity';
import { PaymentCycleLesson } from '../../../enrolment/entities/payment-cycle-lesson.entity';
import { LessonDiscount } from '../../entities/lesson-discount.entity';
import { Invoice } from '../../../invoice/entities/invoice.entity';
import { LessonStatusEnum } from '../../enums/lesson-status';
import { PrivateLesson } from '../../entities/private-lesson.entity';
import { Program } from '../../../program/entities/program.entity';
import { CreditUsage } from '../../../payment/entities/credit-usage.entity';
import { Payment } from '../../../payment/entities/payment.entity';
import { getCurrentESTDate } from 'src/utils/date-utils';
import { RoundingUtils } from '../../../utils/rounding.utils';

@Injectable()
export class PrivateLessonBulkRescheduleRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  /**
   * Run a function inside a transaction using the Lesson repository manager.
   * This keeps transaction handling out of the service while avoiding DataSource.
   */
  async transaction<T>(
    runInTransaction: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.lessonRepository.manager.transaction(runInTransaction);
  }

  /**
   * Load lessons for bulk reschedule with all required relations.
   */
  async findLessonsForBulkReschedule(
    manager: EntityManager,
    lessonIds: number[],
  ): Promise<Lesson[]> {
    const lessonRepo = manager.getRepository(Lesson);
    return lessonRepo.find({
      where: {
        id: In(lessonIds),
        isDeleted: false,
        isConfirmed: true,
      },
      relations: [
        'course',
        'invoiceItemLessons',
        'invoiceItemLessons.invoiceLineItem',
        'invoiceItemLessons.invoiceLineItem.invoice',
      ],
    });
  }

  /**
   * Find private-lesson IDs for a teacher on a specific date at a location.
   * Used by teacher-details bulk-reschedule flow.
   */
  async findPrivateLessonIdsByTeacherAndDate(
    teacherId: number,
    locationId: number,
    sourceDateYmd: string,
  ): Promise<number[]> {
    const rows = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course')
      .innerJoin('lesson.privateLesson', 'privateLesson')
      .where('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status != :canceledStatus', {
        canceledStatus: LessonStatusEnum.CANCELED,
      })
      .andWhere('lesson.teacherId = :teacherId', { teacherId })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('DATE(lesson.date) = :sourceDate', {
        sourceDate: sourceDateYmd,
      })
      .orderBy('lesson.date', 'ASC')
      .select('lesson.id', 'id')
      .getRawMany<{ id: number }>();

    return rows.map((row) => Number(row.id));
  }

  /**
   * Check if a lesson is invoiced.
   */
  async lessonInvoiced(
    lessonId: number,
    manager: EntityManager,
  ): Promise<boolean> {
    const count = await manager
      .getRepository(Lesson)
      .createQueryBuilder('lesson')
      .leftJoin('lesson.invoiceItemLessons', 'invoiceItemLessons')
      .leftJoin('invoiceItemLessons.invoiceLineItem', 'invoiceLineItem')
      .leftJoin('invoiceLineItem.invoice', 'invoice')
      .where('lesson.id = :lessonId', { lessonId })
      .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('invoiceLineItem.isDeleted = :lineDeleted', {
        lineDeleted: false,
      })
      .andWhere('invoice.type = :invoiceType', {
        invoiceType: Invoice.TYPE_INVOICE,
      })
      .getCount();

    return count > 0;
  }

  /**
   * Find all lesson IDs (from the provided list) that are invoiced.
   * Uses a single query instead of one query per lesson for performance.
   */
  async findInvoicedLessonIds(
    manager: EntityManager,
    lessonIds: number[],
  ): Promise<number[]> {
    if (!lessonIds?.length) {
      return [];
    }

    const rows = await manager
      .getRepository(Lesson)
      .createQueryBuilder('lesson')
      .leftJoin('lesson.invoiceItemLessons', 'invoiceItemLessons')
      .leftJoin('invoiceItemLessons.invoiceLineItem', 'invoiceLineItem')
      .leftJoin('invoiceLineItem.invoice', 'invoice')
      .where('lesson.id IN (:...lessonIds)', { lessonIds })
      .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('invoiceLineItem.isDeleted = :lineDeleted', {
        lineDeleted: false,
      })
      .andWhere('invoice.type = :invoiceType', {
        invoiceType: Invoice.TYPE_INVOICE,
      })
      .select('lesson.id', 'id')
      .getRawMany<{ id: number }>();

    return rows.map((row) => row.id);
  }

  /**
   * Reschedule a single lesson to a new date, cloning and moving all related data.
   * Returns { wasRescheduled, newLessonId } - newLessonId only when rescheduled.
   */
  async rescheduleSingleLesson(
    oldLesson: Lesson,
    newDateYmd: string,
    loggedUserId: number,
    manager: EntityManager,
  ): Promise<{ wasRescheduled: boolean; newLessonId?: number }> {
    const lessonRepo = manager.getRepository(Lesson);

    // 1) Compute new DateTime = new date + old time
    const oldDate = oldLesson.date;
    const hours = oldDate.getHours();
    const minutes = oldDate.getMinutes();
    const seconds = oldDate.getSeconds();

    const base = new Date(`${newDateYmd}T00:00:00`);
    base.setHours(hours, minutes, seconds, 0);
    const newStart = base;

    // 2) Compute end time (start + duration - 1s)
    const [durationHoursStr, durationMinutesStr] = (
      oldLesson.duration || '00:00:00'
    )
      .split(':')
      .slice(0, 2);
    const durationHours = parseInt(durationHoursStr || '0', 10);
    const durationMinutes = parseInt(durationMinutesStr || '0', 10);

    const newEndTime = new Date(newStart);
    newEndTime.setHours(
      newEndTime.getHours() + durationHours,
      newEndTime.getMinutes() + durationMinutes,
    );
    newEndTime.setSeconds(newEndTime.getSeconds() - 1);

    const startDateStr = newStart.toISOString().slice(0, 10);
    const startTimeStr = newStart.toTimeString().slice(0, 8);
    const endTimeStr = newEndTime.toTimeString().slice(0, 8);
    const todayStr = getCurrentESTDate().toISOString().slice(0, 10);

    // 3) Teacher overlap check (approximate legacy LessonQuery::overlap)
    const conflictQuery = lessonRepo
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course')
      .innerJoin('lesson.privateLesson', 'privateLesson')
      .where('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status IN (:...statuses)', {
        statuses: [LessonStatusEnum.SCHEDULED, LessonStatusEnum.RESCHEDULED],
      })
      .andWhere('lesson.status != :canceledStatus', {
        canceledStatus: LessonStatusEnum.CANCELED,
      })
      .andWhere('lesson.teacherId = :teacherId', {
        teacherId: oldLesson.teacherId,
      })
      .andWhere('course.locationId = :locationId', {
        locationId: oldLesson.course.locationId,
      })
      .andWhere('DATE(privateLesson.expiryDate) > :today', { today: todayStr })
      .andWhere('DATE(lesson.date) = :date', { date: startDateStr })
      .andWhere('lesson.id != :oldId', { oldId: oldLesson.id })
      .andWhere(
        'TIME(lesson.date) < :endTime AND ADDTIME(TIME(lesson.date), lesson.duration) > :startTime',
        { startTime: startTimeStr, endTime: endTimeStr },
      );

    const conflictCount = await conflictQuery.getCount();

    if (conflictCount > 0) {
      // Skip this lesson like legacy behavior
      return { wasRescheduled: false };
    }

    const now = getCurrentESTDate();
    
    // 4) Clone old lesson → new lesson
    const cloned = lessonRepo.create({
      ...oldLesson,
      id: undefined,
      date: newStart,
      originalDate: oldLesson.originalDate || oldLesson.date,
      status: LessonStatusEnum.RESCHEDULED,
      isDeleted: false,
      createdByUserId: loggedUserId,
      updatedByUserId: loggedUserId,
      createdOn: now,
      updatedOn: now,
    } as Partial<Lesson>);

    const newLesson = await lessonRepo.save(cloned);

    // 5) Cancel old lesson
    oldLesson.status = LessonStatusEnum.CANCELED;
    oldLesson.updatedByUserId = loggedUserId;
    await lessonRepo.save(oldLesson);

    // 6) Link hierarchy using closure-table style rows
    const hierarchyRepo = manager.getRepository(LessonHierarchy);

    // Ancestors of oldLesson (including itself)
    const ancestors = await hierarchyRepo.find({
      where: { childLessonId: oldLesson.id },
    });

    const newHierarchyRows: LessonHierarchy[] = [];

    for (const ancestor of ancestors) {
      newHierarchyRows.push(
        hierarchyRepo.create({
          lessonId: ancestor.lessonId,
          childLessonId: newLesson.id,
          depth: ancestor.depth + 1,
        }),
      );
    }

    // Self row for new lesson
    newHierarchyRows.push(
      hierarchyRepo.create({
        lessonId: newLesson.id,
        childLessonId: newLesson.id,
        depth: 0,
      }),
    );

    if (newHierarchyRows.length) {
      await hierarchyRepo.save(newHierarchyRows);
    }

    // Keep disabled: this marker makes legacy getOriginalDate() pick intermediate bulk date (Original == Scheduled in chained reschedules).
    // Optional legacy marker behavior (disabled to keep legacy UI original date parity):
    // const bulkRepo = manager.getRepository(BulkRescheduleLesson);
    // await bulkRepo.save(
    //   bulkRepo.create({
    //     lessonId: newLesson.id,
    //     createdOn: getCurrentESTDate(),
    //     updatedOn: getCurrentESTDate(),
    //     createdByUserId: loggedUserId,
    //     updatedByUserId: loggedUserId,
    //   }),
    // );

    // 7) Discounts (ConfirmBulkReschedule logic inline)
    const discountRepo = manager.getRepository(LessonDiscount);
    const discounts = await discountRepo.find({
      where: { lessonId: oldLesson.id },
    });
    for (const discount of discounts) {
      const copiedDiscount = discountRepo.create({
        ...discount,
        id: undefined,
        lessonId: newLesson.id,
      } as Partial<LessonDiscount>);
      await discountRepo.save(copiedDiscount);
    }

    // 9) LessonSplitUsage: move extendedLessonId links
    const splitRepo = manager.getRepository(LessonSplitUsage);
    const usedSplits = await splitRepo.find({
      where: { extendedLessonId: oldLesson.id },
    });
    for (const splitUsage of usedSplits) {
      splitUsage.extendedLessonId = newLesson.id;
      await splitRepo.save(splitUsage);
    }

    // 10) PaymentCycleLesson: move to new lesson
    const paymentCycleLessonRepo = manager.getRepository(PaymentCycleLesson);
    const paymentCycleLessons = await paymentCycleLessonRepo.find({
      where: { lessonId: oldLesson.id },
    });
    for (const paymentCycleLesson of paymentCycleLessons) {
      paymentCycleLesson.lessonId = newLesson.id;
      await paymentCycleLessonRepo.save(paymentCycleLesson);
    }

    // 11) LessonPayment: move payments & credit references
    const lessonPaymentRepo = manager.getRepository(LessonPayment);
    const paymentRepo = manager.getRepository(Payment);
    const creditUsageRepo = manager.getRepository(CreditUsage);

    const lessonPayments = await lessonPaymentRepo.find({
      where: { lessonId: oldLesson.id },
      relations: ['payment'],
    });

    for (const lessonPayment of lessonPayments) {
      lessonPayment.lessonId = newLesson.id;
      await lessonPaymentRepo.save(lessonPayment);

      if (lessonPayment.payment?.id) {
        const creditUsage = await creditUsageRepo.findOne({
          where: { creditPaymentId: lessonPayment.payment.id },
        });

        if (creditUsage) {
          const debitPayment = await paymentRepo.findOne({
            where: { id: creditUsage.debitPaymentId },
          });

          if (debitPayment) {
            debitPayment.reference = `L-${newLesson.id.toString().padStart(6, '0')}`;
            await paymentRepo.save(debitPayment);
          }
        }
      }
    }

    // (Optional) group lesson handling if you support groups now

    // 12) Private lesson expiry handling (legacy setExpiry)
    await this.setExpiryForPrivateLesson(newLesson, manager);
    await ensurePrivateLessonEmailStatuses(
      manager.getRepository(PrivateLessonEmailStatus),
      [newLesson.id],
    );

    return { wasRescheduled: true, newLessonId: newLesson.id };
  }

  /**
   * Set expiry date for private lessons (legacy: $lesson->setExpiry()).
   * Uses the same logic as TeacherSubstitutePrivateLessonHelper.setExpiryForPrivateLesson.
   */
  private async setExpiryForPrivateLesson(
    lesson: Lesson,
    manager: EntityManager,
  ): Promise<void> {
    const privateLessonRepo = manager.getRepository(PrivateLesson);
    const lessonPaymentRepo = manager.getRepository(LessonPayment);
    const lessonRepo = manager.getRepository(Lesson);
    const hierarchyRepo = manager.getRepository(LessonHierarchy);

    // Check if private lesson already exists
    const existingPrivateLesson = await privateLessonRepo.findOne({
      where: { lessonId: lesson.id },
    });

    if (existingPrivateLesson) {
      return;
    }

    // Get course with program to check if it's private
    const lessonWithCourse = await lessonRepo.findOne({
      where: { id: lesson.id },
      relations: ['course', 'course.program'],
    });

    if (
      !lessonWithCourse ||
      lessonWithCourse.course.program.type !== Program.TYPE_PRIVATE_PROGRAM
    ) {
      return;
    }

    // Calculate expiry date
    let expiryDate: Date;

    // Get root lesson (lesson with depth 0 where lessonId = childLessonId)
    const rootHierarchy = await hierarchyRepo.findOne({
      where: {
        childLessonId: lesson.id,
        lessonId: lesson.id,
        depth: 0,
      },
    });

    // If not root, find the root ancestor
    let rootLessonId = lesson.id;
    if (!rootHierarchy) {
      const ancestors = await hierarchyRepo.find({
        where: { childLessonId: lesson.id },
        order: { depth: 'ASC' },
      });

      const rootAncestor = ancestors.find(
        (ancestor) => ancestor.lessonId === ancestor.childLessonId,
      );
      if (rootAncestor) {
        rootLessonId = rootAncestor.lessonId;
      }
    }

    // Get root lesson's private lesson, if any
    if (rootLessonId !== lesson.id) {
      const rootPrivateLesson = await privateLessonRepo.findOne({
        where: { lessonId: rootLessonId },
      });

      if (rootPrivateLesson?.expiryDate) {
        const rootExpiry = new Date(rootPrivateLesson.expiryDate);
        const lessonDate = new Date(lesson.date);

        if (lessonDate >= rootExpiry) {
          // Lesson date is after or equal to root expiry, set to lesson date + 1 day
          expiryDate = new Date(lessonDate);
          expiryDate.setDate(expiryDate.getDate() + 1);
        } else {
          expiryDate = rootExpiry;
        }
      } else {
        // No root expiry, default to 90 days
        expiryDate = new Date(lesson.date);
        expiryDate.setDate(expiryDate.getDate() + 90);
      }
    } else {
      // Root lesson: default to 90 days from lesson date
      expiryDate = new Date(lesson.date);
      expiryDate.setDate(expiryDate.getDate() + 90);
    }

    // Ensure discounts are loaded before calling getNetPrice()
    let lessonWithDiscounts = lesson;
    if (!lessonWithDiscounts.discounts) {
      const loaded = await lessonRepo.findOne({
        where: { id: lesson.id },
        relations: ['discounts'],
      });
      if (loaded) {
        lessonWithDiscounts = loaded;
      }
    }

    const netPrice = lessonWithDiscounts.getNetPrice();
    const roundedNetPrice = RoundingUtils.roundDecimal(netPrice, 2);

    // Compute balance based on existing payments for this lesson.
    // This mirrors legacy PrivateLesson::beforeSave() behavior where, on update,
    // balance reflects the lesson's owing amount rather than always equaling total.
    const lessonPayments = await lessonPaymentRepo.find({
      where: { lessonId: lesson.id },
    });
    const totalPaid = lessonPayments.reduce(
      (sum, lp) => sum.plus(lp.amount ?? 0),
      RoundingUtils.decimal(0),
    );
    const calculatedBalance = Math.max(
      0,
      RoundingUtils.calculateBalance(roundedNetPrice, totalPaid, 2),
    );

    const privateLesson = privateLessonRepo.create({
      lessonId: lesson.id,
      expiryDate,
      total: roundedNetPrice,
      balance: calculatedBalance,
      dueDate: expiryDate,
    });

    await privateLessonRepo.save(privateLesson);
  }
}
