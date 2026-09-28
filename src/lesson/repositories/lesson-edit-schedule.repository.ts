import { Injectable } from '@nestjs/common';
import {
  hasValidCourseBounds,
  validCourseDateSql,
} from '../../course/utils/course-date.utils';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course } from '../../course/entities/course.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { Lesson } from '../entities/lesson.entity';
import { PrivateLesson } from '../entities/private-lesson.entity';
import { GroupLesson } from '../entities/group-lesson.entity';
import { LessonDiscount } from '../entities/lesson-discount.entity';
import { LessonPayment } from '../entities/lesson-payment.entity';
import { CalendarEventColor } from '../../color-code/entities/calendar-event-color.entity';
import { EquipmentRental } from '../../equipment-rental/entities/equipment-rental.entity';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { ItemTypeEnum } from '../../invoice/enums/item-type.enum';
import { NotificationEmailType } from '../../customer/entities/notification-email-type.entity';
import { PrivateLessonEmailStatus } from '../entities/private-lesson-email-status.entity';
import { GroupLessonEmailStatus } from '../entities/group-lesson-email-status.entity';
import { Student } from '../../student/entities/student.entity';
import { Payment } from '../../payment/entities/payment.entity';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { LessonStatusEnum } from '../enums/lesson-status';
import { RoundingUtils } from '../../utils/rounding.utils';

/**
 * Repository for lesson edit schedule operations.
 * Handles database operations for both private and group lesson editing.
 * 100% Legacy Identical to PHP implementation.
 */
@Injectable()
export class LessonEditScheduleRepository {
  constructor() {}

  /**
   * Find lesson with all required relations for edit schedule
   */
  async findLessonByIdAndLocation(
    lessonId: number,
    locationId,
    queryRunner: any,
  ): Promise<Lesson> {
    return queryRunner.manager
      .createQueryBuilder(Lesson, 'lesson')
      .leftJoinAndSelect('lesson.course', 'course')
      .leftJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('course.enrolments', 'enrolments')
      .leftJoinAndSelect('enrolments.student', 'student')
      .leftJoinAndSelect('student.user', 'user')
      .leftJoinAndSelect('lesson.privateLesson', 'privateLesson')
      .leftJoinAndSelect('lesson.groupLesson', 'groupLesson')
      .leftJoinAndSelect('lesson.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'teacherProfile')
      .leftJoinAndSelect('lesson.classroom', 'classroom')
      .leftJoinAndSelect('lesson.discounts', 'discounts')
      .where('lesson.id = :id', { id: lessonId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('course.locationId = :locationId', { locationId })
      .getOne();
  }

  /**
   * Check if lesson is invoiced - Legacy: "Lesson can't be edited once invoiced"
   */
  async isLessonInvoiced(lessonId: number, queryRunner: any): Promise<boolean> {
    const result = await queryRunner.manager
      .createQueryBuilder()
      .select('COUNT(*)', 'count')
      .from('invoice_item_lesson', 'iil')
      .innerJoin('invoice_line_item', 'ili', 'ili.id = iil.invoiceLineItemId')
      .innerJoin('invoice', 'invoice', 'invoice.id = ili.invoice_id')
      .where('iil.lessonId = :lessonId', { lessonId })
      .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('ili.isDeleted = :lineItemDeleted', { lineItemDeleted: false })
      .andWhere('invoice.type = :invoiceType', {
        invoiceType: Invoice.TYPE_INVOICE,
      })
      .andWhere('ili.item_type_id IN (:...itemTypes)', {
        itemTypes: [
          ItemTypeEnum.TYPE_PRIVATE_LESSON,
          ItemTypeEnum.TYPE_GROUP_LESSON,
        ],
      })
      .getRawOne();

    return Number(result?.count || 0) > 0;
  }

  /**
   * Get color lookup for calendar events
   */
  async getColorLookup(queryRunner: any): Promise<Record<string, string>> {
    const colors = await queryRunner.manager.find(CalendarEventColor);

    const lookup: Record<string, string> = {};
    for (const color of colors) {
      lookup[color.cssClass] = color.code;
    }
    return lookup;
  }

  /**
   * Copy discounts from old lesson to new lesson
   * Legacy identical
   */
  async copyDiscounts(
    oldLessonId: number,
    newLessonId: number,
    queryRunner: any,
  ): Promise<void> {
    const oldDiscounts = await queryRunner.manager.find(LessonDiscount, {
      where: { lessonId: oldLessonId },
    });

    if (!oldDiscounts.length) return;

    for (const oldDiscount of oldDiscounts) {
      const newDiscount = queryRunner.manager.create(LessonDiscount, {
        lessonId: newLessonId,
        value: oldDiscount.value,
        enrolmentId: oldDiscount.enrolmentId,
        valueType: oldDiscount.valueType,
        type: oldDiscount.type,
        createdByUserId: oldDiscount.createdByUserId,
        updatedByUserId: oldDiscount.updatedByUserId,
      });
      await queryRunner.manager.save(LessonDiscount, newDiscount);
    }
  }

  /**
   * Create lesson hierarchy for reschedule tracking (closure table pattern)
   * Legacy identical
   */
  async createLessonHierarchy(
    parentId: number,
    childId: number,
    queryRunner: any,
  ): Promise<void> {
    // Get all ancestors of the parent (including self-reference)
    const parentAncestors = await queryRunner.manager
      .createQueryBuilder()
      .select('*')
      .from('lesson_hierarchy', 'lh')
      .where('lh.childLessonId = :parentId', { parentId })
      .getRawMany();

    // Create closure links from each ancestor to the new child
    const closures = parentAncestors.map((ancestor: any) => ({
      lessonId: ancestor.lessonId,
      childLessonId: childId,
      depth: ancestor.depth + 1,
    }));

    // Also create self-reference for the new child
    closures.push({
      lessonId: childId,
      childLessonId: childId,
      depth: 0,
    });

    await queryRunner.manager
      .createQueryBuilder()
      .insert()
      .into('lesson_hierarchy')
      .values(closures)
      .execute();
  }

  /**
   * Update lesson.originalDate using the legacy ancestor/bulk-reschedule rule.
   */
  async updateLessonOriginalDate(
    lessonId: number,
    fallbackDate: Date,
    queryRunner: any,
  ): Promise<void> {
    const originalDate = await this.resolveLegacyOriginalDate(
      lessonId,
      fallbackDate,
      queryRunner,
    );

    await queryRunner.manager
      .createQueryBuilder()
      .update(Lesson)
      .set({ originalDate })
      .where('id = :id', { id: lessonId })
      .execute();
  }

  private async resolveLegacyOriginalDate(
    lessonId: number,
    fallbackDate: Date,
    queryRunner: any,
  ): Promise<Date> {
    const ancestors = (await queryRunner.manager
      .createQueryBuilder()
      .select('l.id', 'id')
      .addSelect('l.date', 'date')
      .addSelect('CASE WHEN br.id IS NULL THEN 0 ELSE 1 END', 'hasBulk')
      .from('lesson_hierarchy', 'lh')
      .innerJoin('lesson', 'l', 'l.id = lh.lessonId')
      .leftJoin('bulk_reschedule_lesson', 'br', 'br.lessonId = l.id')
      .where('lh.childLessonId = :lessonId', { lessonId })
      .orderBy('l.id', 'ASC')
      .getRawMany()) as Array<{ id: number; date: string | Date; hasBulk: number }>;

    if (!ancestors.length) {
      return new Date(fallbackDate);
    }

    let originalDate = new Date(ancestors[0].date);
    for (const ancestor of ancestors) {
      if (Number(ancestor.hasBulk) === 1) {
        originalDate = new Date(ancestor.date);
      }
    }

    return originalDate;
  }

  /**
   * Load full lesson with all relations for response formatting
   */
  async loadFullLesson(lessonId: number, queryRunner: any): Promise<Lesson> {
    return queryRunner.manager.findOne(Lesson, {
      where: { id: lessonId },
      relations: [
        'course',
        'course.enrolments',
        'course.enrolments.student',
        'course.enrolments.student.user',
        'course.enrolments.student.user.customerAccount',
      ],
    });
  }

  /**
   * Get credit applied for a specific enrolment (group lessons)
   */
  async getCreditApplied(
    lessonId: number,
    enrolmentId: number,
    queryRunner: any,
  ): Promise<number> {
    const result = await queryRunner.manager
      .createQueryBuilder()
      .select('SUM(lp.amount)', 'total')
      .from('lesson_payment', 'lp')
      .where('lp.lessonId = :lessonId', { lessonId })
      .andWhere('lp.enrolmentId = :enrolmentId', { enrolmentId })
      .andWhere('lp.isDeleted = false')
      .getRawOne();

    return Number(result?.total ?? 0);
  }

  async trimPrivateLessonOverpayment(
    lessonId: number,
    enrolmentId: number | undefined,
    netPrice: number,
    queryRunner: any,
  ): Promise<number[]> {
    if (!enrolmentId) {
      return [];
    }

    const lessonPayments = (await queryRunner.manager
      .createQueryBuilder()
      .select('lp.id', 'id')
      .addSelect('lp.amount', 'amount')
      .addSelect('lp.paymentId', 'paymentId')
      .from('lesson_payment', 'lp')
      .innerJoin(
        'payment',
        'p',
        'p.id = lp.paymentId AND p.isDeleted = :paymentNotDeleted AND p.payment_method_id != :creditUsedMethod',
        {
          paymentNotDeleted: 0,
          creditUsedMethod: PaymentMethod.TYPE_CREDIT_USED,
        },
      )
      .where('lp.lessonId = :lessonId', { lessonId })
      .andWhere('lp.enrolmentId = :enrolmentId', { enrolmentId })
      .andWhere('lp.isDeleted = :lessonPaymentNotDeleted', {
        lessonPaymentNotDeleted: 0,
      })
      .orderBy('lp.id', 'ASC')
      .getRawMany()) as Array<{ id: number; amount: string; paymentId: number }>;

    if (!lessonPayments.length) {
      return [];
    }

    const totalPaid = lessonPayments.reduce(
      (sum, row) => sum + (parseFloat(String(row.amount ?? 0)) || 0),
      0,
    );
    const balance = RoundingUtils.roundDecimal(netPrice - totalPaid, 2);
    if (balance >= 0) {
      return [];
    }

    let remainingOverpaid = Math.abs(balance);
    const affectedPaymentIds = new Set<number>();

    for (const lessonPayment of lessonPayments) {
      if (remainingOverpaid <= 0) break;

      const amount = parseFloat(String(lessonPayment.amount ?? 0)) || 0;
      affectedPaymentIds.add(Number(lessonPayment.paymentId));

      if (amount <= remainingOverpaid) {
        await queryRunner.manager
          .createQueryBuilder()
          .update('lesson_payment')
          .set({ isDeleted: 1 })
          .where('id = :id', { id: Number(lessonPayment.id) })
          .execute();
        remainingOverpaid = RoundingUtils.roundDecimal(remainingOverpaid - amount, 4);
      } else {
        const newAmount = RoundingUtils.roundDecimal(amount - remainingOverpaid, 4);
        await queryRunner.manager
          .createQueryBuilder()
          .update('lesson_payment')
          .set({ amount: newAmount })
          .where('id = :id', { id: Number(lessonPayment.id) })
          .execute();
        remainingOverpaid = 0;
      }
    }

    return [...affectedPaymentIds];
  }

  async recalculatePaymentBalances(
    paymentIds: number[],
    queryRunner: any,
  ): Promise<void> {
    if (!paymentIds.length) {
      return;
    }

    for (const paymentId of paymentIds) {
      const payment = (await queryRunner.manager
        .createQueryBuilder()
        .select('p.id', 'id')
        .addSelect('p.amount', 'amount')
        .from('payment', 'p')
        .where('p.id = :paymentId', { paymentId })
        .andWhere('p.isDeleted = 0')
        .getRawOne()) as { id: number; amount: string } | null;

      if (!payment) {
        continue;
      }

      const invoiceResult = (await queryRunner.manager
        .createQueryBuilder()
        .select('COALESCE(SUM(ip.amount), 0)', 'total')
        .from('invoice_payment', 'ip')
        .where('ip.paymentId = :paymentId', { paymentId })
        .andWhere('ip.isDeleted = 0')
        .getRawOne()) as { total?: string } | null;

      const lessonResult = (await queryRunner.manager
        .createQueryBuilder()
        .select('COALESCE(SUM(lp.amount), 0)', 'total')
        .from('lesson_payment', 'lp')
        .where('lp.paymentId = :paymentId', { paymentId })
        .andWhere('lp.isDeleted = 0')
        .getRawOne()) as { total?: string } | null;

      const updatedBalance = RoundingUtils.calculatePaymentBalance(
        payment.amount,
        invoiceResult?.total ?? 0,
        lessonResult?.total ?? 0,
      );

      await queryRunner.manager.getRepository(Payment).update(
        { id: paymentId },
        { balance: updatedBalance },
      );
    }
  }

  /**
   * Check if student owes rental agreement
   */
  async isOwingRentalAgreement(
    studentId: number,
    queryRunner: any,
  ): Promise<boolean> {
    const notReturnedRentals = await queryRunner.manager.find(EquipmentRental, {
      where: {
        studentId,
        isReturned: false,
        isDeleted: false,
      },
    });
    return notReturnedRentals.length > 0;
  }

  /**
   * Update customer balance (legacy: recalculates based on all transactions)
   */
  async updateCustomerBalance(
    customerId: number,
    queryRunner: any,
  ): Promise<void> {
    await queryRunner.manager
      .createQueryBuilder()
      .update('customer_account')
      .set({
        balance: () =>
          `(COALESCE(SUM(ili.amount), 0) - COALESCE(SUM(ip.amount), 0))`,
      })
      .where('customerId = :customerId', { customerId })
      .execute();
  }

  /**
   * Update private lesson expiry date for unschedule flow.
   */
  async updatePrivateLessonExpiryDate(
    lessonId: number,
    expiryDate: Date,
    queryRunner: any,
  ): Promise<void> {
    const privateLesson = await queryRunner.manager.findOne(PrivateLesson, {
      where: { lessonId },
    });

    if (!privateLesson) {
      return;
    }

    privateLesson.expiryDate = expiryDate;
    await queryRunner.manager.save(PrivateLesson, privateLesson);
  }

  async findPrivateLessonByLessonId(
    lessonId: number,
    queryRunner: any,
  ): Promise<PrivateLesson | null> {
    return queryRunner.manager.findOne(PrivateLesson, {
      where: { lessonId },
    });
  }

  async getTotalPaidForPrivateLesson(
    lessonId: number,
    enrolmentId: number | undefined,
    queryRunner: any,
  ): Promise<number> {
    const query = queryRunner.manager
      .createQueryBuilder(LessonPayment, 'lessonPayment')
      .innerJoin(
        Payment,
        'payment',
        'payment.id = lessonPayment.paymentId AND payment.isDeleted = :paymentNotDeleted AND payment.paymentMethodId != :creditUsedMethodId',
        {
          paymentNotDeleted: 0,
          creditUsedMethodId: PaymentMethod.TYPE_CREDIT_USED,
        },
      )
      .select('COALESCE(SUM(lessonPayment.amount), 0)', 'totalPaid')
      .where('lessonPayment.lessonId = :lessonId', { lessonId })
      .andWhere('lessonPayment.isDeleted = :lessonPaymentNotDeleted', {
        lessonPaymentNotDeleted: 0,
      });

    if (enrolmentId) {
      query.andWhere('lessonPayment.enrolmentId = :enrolmentId', {
        enrolmentId,
      });
    }

    const paidResult = (await query.getRawOne()) as
      | { totalPaid?: string | number }
      | null;

    return Number(paidResult?.totalPaid ?? 0);
  }

  async updatePrivateLessonTotals(
    privateLessonId: number,
    total: number,
    balance: number,
    queryRunner: any,
  ): Promise<void> {
    await queryRunner.manager
      .createQueryBuilder()
      .update(PrivateLesson)
      .set({
        total,
        balance,
      })
      .where('id = :id', { id: privateLessonId })
      .execute();
  }

  /**
   * Root private lesson context used to mirror legacy expiry propagation.
   */
  async getRootPrivateLessonContext(
    lessonId: number,
    queryRunner: any,
  ): Promise<{ lessonId: number; expiryDate: Date | null } | null> {
    const row = (await queryRunner.manager
      .createQueryBuilder()
      .select('lh.lessonId', 'lessonId')
      .addSelect('pl.expiryDate', 'expiryDate')
      .from('lesson_hierarchy', 'lh')
      .leftJoin('private_lesson', 'pl', 'pl.lessonId = lh.lessonId')
      .where('lh.childLessonId = :lessonId', { lessonId })
      .andWhere('lh.lessonId != :lessonId', { lessonId })
      .orderBy('lh.depth', 'DESC')
      .limit(1)
      .getRawOne()) as
      | { lessonId?: number | string; expiryDate?: string | Date }
      | null;

    if (!row?.lessonId) {
      return null;
    }

    return {
      lessonId: Number(row.lessonId),
      expiryDate: row.expiryDate ? new Date(row.expiryDate) : null,
    };
  }

  /**
   * Recalculate course date bounds and enrolment end date after lesson changes.
   */
  async updateCourseDates(
    courseId: number,
    queryRunner: any,
  ): Promise<void> {
    const firstLast = (await queryRunner.manager
      .createQueryBuilder(Lesson, 'lesson')
      .select('MIN(lesson.date)', 'first')
      .addSelect('MAX(lesson.date)', 'last')
      .where('lesson.courseId = :courseId', { courseId })
      .andWhere(validCourseDateSql('lesson.date'))
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status IN (:...statuses)', {
        statuses: [
          LessonStatusEnum.SCHEDULED,
          LessonStatusEnum.RESCHEDULED,
          LessonStatusEnum.UNSCHEDULED,
        ],
      })
      .getRawOne()) as { first?: string | Date; last?: string | Date } | null;

    if (
      !firstLast?.first || !firstLast?.last ||
      !hasValidCourseBounds(firstLast.first, firstLast.last)
    ) {
      return;
    }

    const firstDate = new Date(firstLast.first);
    const lastDate = new Date(firstLast.last);

    await queryRunner.manager.getRepository(Course).update(
      { id: courseId },
      { startDate: firstDate, endDate: lastDate },
    );

    const activeEnrolment = await queryRunner.manager.findOne(Enrolment, {
      where: {
        courseId,
        isDeleted: false,
        isConfirmed: 1,
      },
      order: {
        id: 'ASC',
      },
    });

    if (activeEnrolment) {
      await queryRunner.manager.getRepository(Enrolment).update(
        { id: activeEnrolment.id },
        { endDateTime: lastDate },
      );
    }
  }

  /**
   * Create email status rows for edit-schedule reschedule flow.
   */
  async createLessonEmailStatuses(
    lessonId: number,
    courseId: number,
    isPrivateLesson: boolean,
    queryRunner: any,
  ): Promise<void> {
    const notificationRepo = queryRunner.manager.getRepository(
      NotificationEmailType,
    );
    const notificationTypes = await notificationRepo.find();

    if (!notificationTypes.length) {
      return;
    }

    if (isPrivateLesson) {
      const privateEmailStatusRepo = queryRunner.manager.getRepository(
        PrivateLessonEmailStatus,
      );
      const privateStatuses = notificationTypes.map((type) =>
        privateEmailStatusRepo.create({
          lessonId,
          notificationType: type.id,
          status: 0,
        }),
      );

      await privateEmailStatusRepo.save(privateStatuses);
      return;
    }

    const studentRepo = queryRunner.manager.getRepository(Student);
    const groupEmailStatusRepo = queryRunner.manager.getRepository(
      GroupLessonEmailStatus,
    );

    const today = new Date().toISOString().split('T')[0];
    const students = await studentRepo
      .createQueryBuilder('student')
      .innerJoin('student.enrolments', 'enrolment')
      .innerJoin('enrolment.course', 'course')
      .where('enrolment.courseId = :courseId', { courseId })
      .andWhere('enrolment.isDeleted = :enrolDeleted', { enrolDeleted: false })
      .andWhere('enrolment.isConfirmed = :enrolConfirmed', {
        enrolConfirmed: 1,
      })
      .andWhere('enrolment.studentId IS NOT NULL')
      .andWhere('DATE(enrolment.endDateTime) >= :today', { today })
      .andWhere('course.isConfirmed = :courseConfirmed', { courseConfirmed: 1 })
      .andWhere('course.isDeleted = :courseDeleted', { courseDeleted: false })
      .andWhere('student.isDeleted = :studentDeleted', {
        studentDeleted: false,
      })
      .getMany();

    const groupStatuses: GroupLessonEmailStatus[] = [];
    for (const student of students) {
      for (const type of notificationTypes) {
        groupStatuses.push(
          groupEmailStatusRepo.create({
            lessonId,
            studentId: student.id,
            notificationType: type.id,
            status: 0,
          }) as GroupLessonEmailStatus,
        );
      }
    }

    if (!groupStatuses.length) {
      return;
    }

    await groupEmailStatusRepo.save(groupStatuses);
  }
}
