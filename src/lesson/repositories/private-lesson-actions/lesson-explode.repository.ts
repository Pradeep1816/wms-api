import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { getCurrentESTDate } from '../../../utils/date-utils';
import { Lesson } from '../../entities/lesson.entity';
import { PrivateLesson } from '../../entities/private-lesson.entity';
import { LessonStatusEnum } from '../../enums/lesson-status';
import { LessonHierarchy } from '../../entities/lesson-hierarchy.entity';
import { LessonPayment } from '../../entities/lesson-payment.entity';
import { LessonDiscount } from '../../entities/lesson-discount.entity';
import { Course } from '../../../course/entities/course.entity';
import { Enrolment } from '../../../enrolment/entities/enrolment.entity';
import { Program } from '../../../program/entities/program.entity';
import { Invoice } from '../../../invoice/entities/invoice.entity';
import { resolveLessonPaymentRoyaltySnapshot } from '../../../utils/royality/royalty-calculation.util';
import { RoundingUtils } from '../../../utils/rounding.utils';

/**
 * Constants matching legacy SMW-Legacy
 */
const DEFAULT_EXPLODE_DURATION_SEC = 900; // 15 minutes in seconds
const DEFAULT_MERGE_DURATION = '00:15:00'; // 15 minutes as time string

@Injectable()
export class LessonExplodeRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(PrivateLesson)
    private readonly privateLessonRepository: Repository<PrivateLesson>,
    @InjectRepository(LessonHierarchy)
    private readonly lessonHierarchyRepository: Repository<LessonHierarchy>,
    @InjectRepository(LessonPayment)
    private readonly lessonPaymentRepository: Repository<LessonPayment>,
    @InjectRepository(LessonDiscount)
    private readonly lessonDiscountRepository: Repository<LessonDiscount>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Find lesson by ID with all necessary relations for explode check
   * Legacy: Lesson::findOne() with relations
   */
  async findLessonWithRelations(lessonId: number): Promise<Lesson | null> {
    return await this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.course', 'course')
      .leftJoinAndSelect('lesson.privateLesson', 'privateLesson')
      .leftJoinAndSelect('lesson.discounts', 'discounts')
      .leftJoinAndSelect('lesson.invoiceItemLessons', 'invoiceItemLessons')
      .leftJoinAndSelect('invoiceItemLessons.invoiceLineItem', 'invoiceLineItem')
      .leftJoinAndSelect('invoiceLineItem.invoice', 'invoice')
      .where('lesson.id = :lessonId', { lessonId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: 0 })
      .getOne();
  }

  /**
   * Check if lesson has an invoice
   * Legacy: Lesson::hasInvoice()
   */
  async hasInvoice(lessonId: number): Promise<boolean> {
    const count = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.invoiceItemLessons', 'iil')
      .innerJoin('iil.invoiceLineItem', 'invoiceLineItem')
      .innerJoin('invoiceLineItem.invoice', 'invoice')
      .where('lesson.id = :lessonId', { lessonId })
      .andWhere('invoiceLineItem.isDeleted = :lineItemIsDeleted', { lineItemIsDeleted: 0 })
      .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: 0 })
      .andWhere('invoice.type = :invoiceType', { invoiceType: Invoice.TYPE_INVOICE })
      .getCount();

    return count > 0;
  }

  /**
   * Check if lesson is expired (unscheduled and past expiry date)
   * Legacy: Lesson::isExpired(), PrivateLesson::isExpired()
   */
  async isExpired(lessonId: number): Promise<boolean> {
    const lesson = await this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.privateLesson', 'privateLesson')
      .where('lesson.id = :lessonId', { lessonId })
      .andWhere('lesson.status = :status', { status: LessonStatusEnum.UNSCHEDULED })
      .getOne();

    if (!lesson || !lesson.privateLesson || lesson.privateLesson.length === 0) {
      return false;
    }

    const privateLesson = lesson.privateLesson[0];
    if (!privateLesson.expiryDate) {
      return false;
    }

    const now = new Date();
    const expiryDate = new Date(privateLesson.expiryDate);
    return now > expiryDate;
  }

  /**
   * Check if lesson is from a private course
   * Legacy: Lesson::isPrivate() via course->program->type
   */
  async isPrivateLesson(lessonId: number): Promise<boolean> {
    const lesson = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course')
      .innerJoin('course.program', 'program')
      .where('lesson.id = :lessonId', { lessonId })
      .andWhere('program.type = :type', { type: Program.TYPE_PRIVATE_PROGRAM })
      .getOne();

    return !!lesson;
  }

  /**
   * Get enrolment for a lesson
   * Legacy: Lesson::getEnrolment()
   */
  async getEnrolment(lessonId: number): Promise<Enrolment | null> {
    return await this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .innerJoin('enrolment.course', 'course')
      .innerJoin('course.lessons', 'lesson')
      .where('lesson.id = :lessonId', { lessonId })
      .andWhere('enrolment.isDeleted = :isDeleted', { isDeleted: 0 })
      .andWhere('enrolment.isConfirmed = :isConfirmed', { isConfirmed: 1 })
      .getOne();
  }

  /**
   * Get lesson payments with payment details
   * Legacy: Lesson::getPayments()
   */
  async getLessonPayments(lessonId: number): Promise<any[]> {
    return await this.lessonPaymentRepository
      .createQueryBuilder('lp')
      .innerJoinAndSelect('lp.payment', 'payment')
      .where('lp.lessonId = :lessonId', { lessonId })
      .andWhere('lp.isDeleted = :isDeleted', { isDeleted: 0 })
      .getMany();
  }

  /**
   * Get lesson discounts
   * Legacy: Lesson::getDiscounts()
   */
  async getLessonDiscounts(lessonId: number): Promise<LessonDiscount[]> {
    return await this.lessonDiscountRepository.find({
      where: { lessonId },
    });
  }

  /**
   * Create a new lesson (exploded segment)
   * Legacy: Lesson clone and save in PrivateLesson::split()
   */
  async createExplodedLesson(
    originalLesson: Lesson,
    date: Date,
    programRate: number,
    createdByUserId: number,
  ): Promise<Lesson> {
    const now = getCurrentESTDate();
    
    const newLesson = this.lessonRepository.create({
      courseId: originalLesson.courseId,
      teacherId: originalLesson.teacherId,
      classroomId: originalLesson.classroomId,
      date: date,
      duration: DEFAULT_MERGE_DURATION,
      status: LessonStatusEnum.UNSCHEDULED,
      isPresent: true,
      isDeleted: false,
      isConfirmed: true,
      type: originalLesson.type,
      isExploded: 1, // Mark as exploded
      isOnline: originalLesson.isOnline,
      createdByUserId: createdByUserId,
      updatedByUserId: createdByUserId,
      programRate: programRate,
      teacherRate: originalLesson.teacherRate,
      teacherRateOld: originalLesson.teacherRateOld,
      tax: Number(originalLesson.tax ?? 0),
      total: 0,
      dueDate: originalLesson.dueDate,
      paidStatus: 0,
      originalDate: originalLesson.originalDate || originalLesson.date,
      createdOn: now,
      updatedOn: now,
    });

    return await this.lessonRepository.save(newLesson);
  }

  /**
   * Create private lesson record for exploded lesson
   * Legacy: PrivateLesson::save() after split
   */
  async createPrivateLessonRecord(
    lessonId: number,
    originalExpiryDate: Date,
    netPrice: number,
  ): Promise<PrivateLesson> {
    const privateLesson = this.privateLessonRepository.create({
      lessonId,
      expiryDate: originalExpiryDate,
      total: RoundingUtils.roundDecimal(netPrice, 2),
      balance: RoundingUtils.roundDecimal(netPrice, 2),
      dueDate: new Date(),
    });

    return await this.privateLessonRepository.save(privateLesson);
  }

  /**
   * Create lesson hierarchy (reschedule relationship)
   * Legacy: Lesson::rescheduleTo(), LessonReschedule::save()
   */
  async createLessonHierarchy(
    originalLessonId: number,
    newLessonId: number,
  ): Promise<void> {
    // Legacy closure-table append behavior:
    // insert all ancestors of original with depth+1, then self row for new lesson.
    const ancestors = await this.lessonHierarchyRepository.find({
      where: { childLessonId: originalLessonId },
    });

    const rows = ancestors.map((ancestor) =>
      this.lessonHierarchyRepository.create({
        lessonId: ancestor.lessonId,
        childLessonId: newLessonId,
        depth: ancestor.depth + 1,
      }),
    );

    rows.push(
      this.lessonHierarchyRepository.create({
        lessonId: newLessonId,
        childLessonId: newLessonId,
        depth: 0,
      }),
    );

    await this.lessonHierarchyRepository.save(rows);
  }

  /**
   * Create lesson payment record
   * Legacy: LessonPayment::save() in PrivateLesson::split()
   */
  async createLessonPayment(
    lessonId: number,
    paymentId: number,
    enrolmentId: number,
    amount: number,
    createdByUserId: number,
  ): Promise<void> {
    const royaltySnapshot = await resolveLessonPaymentRoyaltySnapshot(
      this.lessonPaymentRepository.manager,
      lessonId,
    );
    const lessonPayment = this.lessonPaymentRepository.create({
      lessonId,
      paymentId,
      enrolmentId,
      amount: RoundingUtils.roundDecimal(amount, 2),
      royaltyCategoryId: royaltySnapshot.categoryId,
      royaltyRateApplied: royaltySnapshot.rate,
      advertisementRateApplied: royaltySnapshot.advertisementRate,
      date: new Date(),
      isDeleted: 0,
      createdByUserId,
      updatedByUserId: createdByUserId,
    });

    await this.lessonPaymentRepository.save(lessonPayment);
  }

  /**
   * Delete lesson payments for a lesson (HARD DELETE - Legacy identical)
   * Legacy: LessonPayment::delete() in PrivateLesson::split()
   * Note: Legacy does hard delete, not soft delete
   */
  async deleteLessonPayments(lessonId: number): Promise<void> {
    await this.lessonPaymentRepository.delete({ lessonId });
  }

  /**
   * Update lesson discount
   * Legacy: LessonDiscount::updateAttributes() in PrivateLesson::split()
   */
  async updateLessonDiscount(
    discountId: number,
    value: number,
  ): Promise<void> {
    await this.lessonDiscountRepository.update(
      { id: discountId },
      { value },
    );
  }

  /**
   * Create lesson discount for exploded lesson
   * Legacy: Discount cloning in PrivateLesson::split()
   */
  async createLessonDiscount(
    lessonId: number,
    type: number,
    value: number,
    valueType: number,
  ): Promise<void> {
    const discount = this.lessonDiscountRepository.create({
      lessonId,
      type,
      value,
      valueType,
    });

    await this.lessonDiscountRepository.save(discount);
  }

  /**
   * Cancel a lesson (set status to CANCELED)
   * Legacy: Lesson::cancel()
   */
  async cancelLesson(lessonId: number): Promise<void> {
    await this.lessonRepository.update(
      { id: lessonId },
      { status: LessonStatusEnum.CANCELED },
    );
  }

  /**
   * Calculate duration in seconds from time string
   * Legacy: Lesson::getDurationSec()
   */
  getDurationInSeconds(duration: string): number {
    const parts = duration.split(':');
    if (parts.length !== 3) {
      return 0;
    }
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    const seconds = parseInt(parts[2], 10) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Format seconds to time string
   */
  secondsToTimeString(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  /**
   * Add time to a date
   * Legacy: DateTime::add() in PrivateLesson::split()
   */
  addTimeToDate(date: Date, timeString: string): Date {
    const parts = timeString.split(':');
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    const seconds = parseInt(parts[2], 10) || 0;

    const newDate = new Date(date);
    newDate.setHours(newDate.getHours() + hours);
    newDate.setMinutes(newDate.getMinutes() + minutes);
    newDate.setSeconds(newDate.getSeconds() + seconds);

    return newDate;
  }

  /**
   * Execute explode operation within a transaction
   * Legacy: PrivateLesson::split() - main logic
   */
  async executeExplode(
    lesson: Lesson,
    enrolmentId: number,
    createdByUserId: number,
  ): Promise<{ explodedLessons: Lesson[]; originalLessonId: number }> {
    return await this.dataSource.transaction(async (manager) => {
      const lessonRepo = manager.getRepository(Lesson);
      const privateLessonRepo = manager.getRepository(PrivateLesson);
      const lessonHierarchyRepo = manager.getRepository(LessonHierarchy);
      const lessonPaymentRepo = manager.getRepository(LessonPayment);
      const lessonDiscountRepo = manager.getRepository(LessonDiscount);

      // Calculate split count
      const lessonDurationSec = this.getDurationInSeconds(lesson.duration);
      const splitCount = lessonDurationSec / DEFAULT_EXPLODE_DURATION_SEC;

      const originalGrossPrice = lesson.getGrossPrice();
      const grossShares = RoundingUtils.splitAmountPreservingTotal(
        originalGrossPrice,
        splitCount,
      );
      const originalPrivateLessonTotal = lesson.privateLesson?.[0]?.total;
      const originalNetPrice = RoundingUtils.roundDecimal(
        Number(
          originalPrivateLessonTotal ??
            lesson.total ??
            lesson.getNetPrice(),
        ),
        2,
      );
      const netShares = RoundingUtils.splitAmountPreservingTotal(
        originalNetPrice,
        splitCount,
      );
      const splitDurationHours = DEFAULT_EXPLODE_DURATION_SEC / 3600;

      // Get lesson payments before we delete them
      const payments = await lessonPaymentRepo.find({
        where: { lessonId: lesson.id, isDeleted: 0 },
        relations: ['payment'],
      });

      // Get discounts
      const discounts = await lessonDiscountRepo.find({
        where: { lessonId: lesson.id },
      });

      // Get private lesson for expiry date
      const privateLessons = await privateLessonRepo.find({
        where: { lessonId: lesson.id },
      });
      const originalExpiryDate = privateLessons.length > 0 ? privateLessons[0].expiryDate : new Date();

      const explodedLessons: Lesson[] = [];
      
      const paymentBalanceById = new Map<number, number>();
      for (const lp of payments) {
        // Start with the amount that was applied to the original lesson
        const availableAmount = RoundingUtils.roundDecimal(Number(lp.amount ?? 0), 2);
        paymentBalanceById.set(lp.paymentId, availableAmount);
      }
      // Create exploded lessons
      for (let i = 0; i < splitCount; i++) {
        // Calculate new date (each segment starts 15 min after the previous)
        const offsetSeconds = i * DEFAULT_EXPLODE_DURATION_SEC;
        const offsetTime = this.secondsToTimeString(offsetSeconds);
        const newDate = this.addTimeToDate(lesson.date, offsetTime);

        // Determine program rate for this segment
        const segmentGross = grossShares[i];
        const segmentProgramRate = RoundingUtils.roundDecimal(
          segmentGross / splitDurationHours,
          4,
        );

        const now = getCurrentESTDate();
        
        // Create the exploded lesson
        const newLesson = lessonRepo.create({
          courseId: lesson.courseId,
          teacherId: lesson.teacherId,
          classroomId: lesson.classroomId,
          date: newDate,
          duration: DEFAULT_MERGE_DURATION,
          status: LessonStatusEnum.UNSCHEDULED,
          isPresent: true,
          isDeleted: false,
          isConfirmed: true,
          type: lesson.type,
          isExploded: 1,
          isOnline: lesson.isOnline,
          createdByUserId: createdByUserId,
          updatedByUserId: createdByUserId,
          programRate: segmentProgramRate,
          teacherRate: lesson.teacherRate,
          teacherRateOld: lesson.teacherRateOld,
          tax: Number(lesson.tax ?? 0),
          total: netShares[i],
          dueDate: lesson.dueDate,
          paidStatus: 0,
          originalDate: lesson.originalDate || lesson.date,
          createdOn: now,
          updatedOn: now,
        });

        const savedLesson = await lessonRepo.save(newLesson);
        explodedLessons.push(savedLesson);

        // Create closure-table hierarchy rows matching legacy append behavior.
        const ancestors = await lessonHierarchyRepo.find({
          where: { childLessonId: lesson.id },
        });
        const hierarchyRows = ancestors.map((ancestor) =>
          lessonHierarchyRepo.create({
            lessonId: ancestor.lessonId,
            childLessonId: savedLesson.id,
            depth: ancestor.depth + 1,
          }),
        );
        hierarchyRows.push(
          lessonHierarchyRepo.create({
            lessonId: savedLesson.id,
            childLessonId: savedLesson.id,
            depth: 0,
          }),
        );
        await lessonHierarchyRepo.save(hierarchyRows);

        // Clone and adjust discounts
        for (const discount of discounts) {
          const isFixedDiscount =
            discount.type === LessonDiscount.TYPE_MULTIPLE_ENROLMENT ||
            discount.type === LessonDiscount.TYPE_PREPAID_CYCLE ||
            (discount.type === LessonDiscount.TYPE_LINE_ITEM &&
              Number(discount.valueType) === 0);
          const discountShares = isFixedDiscount
            ? RoundingUtils.splitAmountPreservingTotal(Number(discount.value ?? 0), splitCount)
            : null;
          const discountValue = discountShares ? discountShares[i] : Number(discount.value);

          const newDiscount = lessonDiscountRepo.create({
            lessonId: savedLesson.id,
            type: discount.type,
            value: discountValue,
            valueType: discount.valueType,
          });
          await lessonDiscountRepo.save(newDiscount);
        }
        const netPrice = netShares[i];

        // Create private lesson record
        const privateLesson = privateLessonRepo.create({
          lessonId: savedLesson.id,
          expiryDate: originalExpiryDate,
          total: netPrice,
          balance: netPrice,
          dueDate: new Date(),
        });
        await privateLessonRepo.save(privateLesson);
      }

      // Distribute payments to exploded lessons
      if (payments.length > 0) {
        for (const explodedLesson of explodedLessons) {
          const splitPrivate = await privateLessonRepo.findOne({
            where: { lessonId: explodedLesson.id },
          });
          let amountRemaining = RoundingUtils.roundDecimal(
            Number(splitPrivate?.total ?? 0),
            2,
          );

          for (const lessonPayment of payments) {
            if (amountRemaining <= 0.009) break; // Use small threshold for floating point

            const paymentBalance = RoundingUtils.roundDecimal(
              Number(paymentBalanceById.get(lessonPayment.paymentId) ?? 0),
              2,
            );
            if (paymentBalance > 0.009) {
              const amountToUseRaw = Math.min(amountRemaining, paymentBalance);
              const amountToUse = RoundingUtils.roundDecimal(amountToUseRaw, 2);

              await lessonPaymentRepo.save({
                lessonId: explodedLesson.id,
                paymentId: lessonPayment.paymentId,
                enrolmentId: enrolmentId,
                amount: amountToUse,
                royaltyCategoryId: lessonPayment.royaltyCategoryId,
                royaltyRateApplied: lessonPayment.royaltyRateApplied,
                advertisementRateApplied: lessonPayment.advertisementRateApplied,
                date: new Date(),
                isDeleted: 0,
                createdByUserId,
                updatedByUserId: createdByUserId,
              });

              amountRemaining = RoundingUtils.roundDecimal(
                amountRemaining - amountToUse,
                2,
              );

              const newBalance = RoundingUtils.roundDecimal(
                paymentBalance - amountToUse,
                2,
              );
              paymentBalanceById.set(lessonPayment.paymentId, newBalance);
            }
          }
        }

        // Delete original lesson payments (HARD DELETE - Legacy identical)
        await lessonPaymentRepo.delete({ lessonId: lesson.id });

        // Recalculate private_lesson.balance for each exploded lesson
        // Legacy behavior: After LessonPayment::afterSave(), privateLesson->save() is called
        // which triggers beforeSave() on update, recalculating balance from getOwingAmount()
        for (const explodedLesson of explodedLessons) {
          const splitPrivate = await privateLessonRepo.findOne({
            where: { lessonId: explodedLesson.id },
          });
          if (splitPrivate) {
            // Calculate total payments applied to this lesson
            const lessonPayments = await lessonPaymentRepo.find({
              where: { lessonId: explodedLesson.id, isDeleted: 0 },
            });
            const totalPaid = lessonPayments.reduce(
              (sum, lp) => sum.plus(lp.amount ?? 0),
              RoundingUtils.decimal(0),
            );
            // Recalculate balance: netPrice - totalPaid
            const newBalance = Math.max(
              0,
              RoundingUtils.calculateBalance(
                splitPrivate.total,
                totalPaid,
                2,
              ),
            );
            await privateLessonRepo.update(
              { lessonId: explodedLesson.id },
              { balance: newBalance },
            );
          }
        }
      }

      // Cancel the original lesson
      await lessonRepo.update(
        { id: lesson.id },
        { status: LessonStatusEnum.CANCELED },
      );

      return {
        explodedLessons,
        originalLessonId: lesson.id,
      };
    });
  }
}
