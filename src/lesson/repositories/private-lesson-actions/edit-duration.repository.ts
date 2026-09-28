import { Injectable } from '@nestjs/common';
import {
  hasValidCourseBounds,
  validCourseDateSql,
} from '../../../course/utils/course-date.utils';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import { Lesson } from '../../entities/lesson.entity';
import { PrivateLesson } from '../../entities/private-lesson.entity';
import { Payment } from '../../../payment/entities/payment.entity';
import { PaymentMethod } from '../../../payment/entities/payment-method.entity';
import { Course } from '../../../course/entities/course.entity';
import { LessonStatusEnum } from '../../enums/lesson-status';
import { RoundingUtils } from '../../../utils/rounding.utils';

/**
 * Persistence layer for private-lesson bulk duration edit.
 *
 * This repository intentionally performs more than a raw duration update.
 * side-effects in one transaction:
 * - update lesson.duration
 * - recompute lesson.originalDate
 * - recompute private_lesson.total/balance
 * - correct overpaid lesson_payment rows when balance becomes negative
 * - update course start/end dates
 */
@Injectable()
export class EditDurationRepository {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}


  async updateDurationForLessons(
    lessonIds: number[],
    duration: string,
  ): Promise<number[]> {
    if (!lessonIds?.length) return [];

    // Accept HH:mm / HH:mm:ss and persist as HH:mm:ss.
    const normalized = duration.length === 5 ? `${duration}:00` : duration;

    return this.dataSource.transaction(async (manager) => {
      // 1) Bulk update duration.
      await manager.getRepository(Lesson).update(
        { id: In(lessonIds) } as any,
        { duration: normalized },
      );

      // 2) Reload lessons with discounts so `getNetPrice()` uses fresh duration + discounts.
      const lessons = await manager.getRepository(Lesson).find({
        where: { id: In(lessonIds) } as any,
        relations: ['discounts'],
      });

      if (!lessons.length) return [];
      const affectedCourseIds = new Set<number>(lessons.map((lesson) => lesson.courseId));
      const lessonDateMap = new Map<number, Date>(
        lessons.map((lesson) => [lesson.id, new Date(lesson.date)]),
      );

      const courseIds = [...new Set(lessons.map((lesson) => lesson.courseId))];
      const enrolmentRows = await manager
        .createQueryBuilder()
        .select('enrolment.courseId', 'courseId')
        .addSelect('enrolment.id', 'enrolmentId')
        .addSelect('student.customer_id', 'customerId')
        .from('enrolment', 'enrolment')
        .innerJoin('student', 'student', 'student.id = enrolment.studentId')
        .where('enrolment.courseId IN (:...courseIds)', { courseIds })
        .andWhere('enrolment.isDeleted = 0')
        .andWhere('enrolment.isConfirmed = 1')
        .orderBy('enrolment.id', 'ASC')
        .getRawMany<{
          courseId: number;
          enrolmentId: number;
          customerId: number;
        }>();

      const courseToEnrolment = new Map<
        number,
        { enrolmentId: number; customerId: number }
      >();
      for (const row of enrolmentRows) {
        if (!courseToEnrolment.has(Number(row.courseId))) {
          courseToEnrolment.set(Number(row.courseId), {
            enrolmentId: Number(row.enrolmentId),
            customerId: Number(row.customerId),
          });
        }
      }

      const affectedCustomerIds = new Set<number>();
      const affectedPaymentIds = new Set<number>();
      const originalDateMap = await this.computeOriginalDatesForLessons(
        lessons.map((lesson) => lesson.id),
        lessonDateMap,
        manager,
      );
      const creditAppliedMap = await this.getCreditAppliedTotalsByLessonEnrolment(
        lessons,
        courseToEnrolment,
        manager,
      );

      for (const lesson of lessons) {
        // 3) Keep originalDate consistent with legacy Lesson::getOriginalDate().
        const originalDate = originalDateMap.get(lesson.id) ?? new Date(lesson.date);
        await manager.getRepository(Lesson).update(
          { id: lesson.id } as any,
          { originalDate } as Partial<Lesson>,
        );

        const enrolmentInfo = courseToEnrolment.get(Number(lesson.courseId));
        if (!enrolmentInfo) {
          continue;
        }

        // 4) Calculate currently applied credits (excluding TYPE_CREDIT_USED).
        const creditApplied =
          creditAppliedMap.get(`${lesson.id},${enrolmentInfo.enrolmentId}`) ?? 0;
        const total = lesson.getNetPrice();
        let balance = RoundingUtils.roundDecimal(total - creditApplied, 2);

        // 5) Legacy parity: if recalculated balance is negative, unwind excess
        // lesson payments (delete full rows, or reduce the row where remainder fits).
        if (balance < 0) {
          let remainingOverpaid = Math.abs(balance);
          const lessonPayments = await manager
            .createQueryBuilder()
            .select('lp.id', 'id')
            .addSelect('lp.amount', 'amount')
            .addSelect('lp.paymentId', 'paymentId')
            .from('lesson_payment', 'lp')
            .innerJoin('payment', 'p', 'p.id = lp.paymentId')
            .where('lp.lessonId = :lessonId', { lessonId: lesson.id })
            .andWhere('lp.enrolmentId = :enrolmentId', {
              enrolmentId: enrolmentInfo.enrolmentId,
            })
            .andWhere('lp.isDeleted = 0')
            .andWhere('p.isDeleted = 0')
            .andWhere('p.payment_method_id != :creditUsedMethod', {
              creditUsedMethod: PaymentMethod.TYPE_CREDIT_USED,
            })
            .orderBy('lp.id', 'ASC')
            .getRawMany<{ id: number; amount: string; paymentId: number }>();

          for (const lp of lessonPayments) {
            if (remainingOverpaid <= 0) break;
            const amount = parseFloat(lp.amount || '0') || 0;
            
            // Track affected payment for balance recalculation
            affectedPaymentIds.add(Number(lp.paymentId));
            
            if (amount <= remainingOverpaid) {
              await manager
                .createQueryBuilder()
                .update('lesson_payment')
                .set({ isDeleted: 1 })
                .where('id = :id', { id: Number(lp.id) })
                .execute();
              remainingOverpaid = RoundingUtils.roundDecimal(
                remainingOverpaid - amount,
                4,
              );
            } else {
              const newAmount = RoundingUtils.roundDecimal(
                amount - remainingOverpaid,
                4,
              );
              await manager
                .createQueryBuilder()
                .update('lesson_payment')
                .set({ amount: newAmount })
                .where('id = :id', { id: Number(lp.id) })
                .execute();
              remainingOverpaid = 0;
            }
          }
          balance = 0;
        }

        await manager.getRepository(PrivateLesson).update(
          { lessonId: lesson.id } as any,
          { total, balance } as Partial<PrivateLesson>,
        );

        affectedCustomerIds.add(enrolmentInfo.customerId);
      }

      // 6) Recalculate payment balances for affected payments
      // This is critical for credit to appear in customer account
      await this.recalculatePaymentBalances([...affectedPaymentIds], manager);

      // 7) Legacy parity: refresh course start/end from remaining active lessons.
      await this.updateCourseDatesBatch([...affectedCourseIds], manager);

      return [...affectedCustomerIds];
    });
  }

  /**
   * Compute "original date" using ancestor chain:
   * - start from root lesson date
   * - override with ancestor date when that ancestor has a bulk-reschedule marker
   */
  private async computeOriginalDatesForLessons(
    lessonIds: number[],
    fallbackLessonDateMap: Map<number, Date>,
    manager: any,
  ): Promise<Map<number, Date>> {
    const originalDateMap = new Map<number, Date>();
    if (!lessonIds.length) return originalDateMap;

    const ancestors = (await manager
      .createQueryBuilder()
      .select('lh.childLessonId', 'childLessonId')
      .addSelect('l.id', 'id')
      .addSelect('lh.childLessonId', 'childLessonId')
      .addSelect('l.date', 'date')
      .addSelect('CASE WHEN br.id IS NULL THEN 0 ELSE 1 END', 'hasBulk')
      .from('lesson_hierarchy', 'lh')
      .innerJoin('lesson', 'l', 'l.id = lh.lessonId')
      .leftJoin('bulk_reschedule_lesson', 'br', 'br.lessonId = l.id')
      .where('lh.childLessonId IN (:...lessonIds)', { lessonIds })
      .orderBy('lh.childLessonId', 'ASC')
      .addOrderBy('l.id', 'ASC')
      .getRawMany()) as Array<{
      childLessonId: number;
      id: number;
      date: Date;
      hasBulk: number;
    }>;

    const grouped = new Map<number, Array<{ date: Date; hasBulk: number }>>();
    for (const row of ancestors) {
      const childLessonId = Number(row.childLessonId);
      if (!grouped.has(childLessonId)) {
        grouped.set(childLessonId, []);
      }
      grouped.get(childLessonId)!.push({
        date: new Date(row.date),
        hasBulk: Number(row.hasBulk),
      });
    }

    for (const lessonId of lessonIds) {
      const chain = grouped.get(lessonId);
      if (!chain?.length) {
        originalDateMap.set(
          lessonId,
          fallbackLessonDateMap.get(lessonId) ?? new Date(),
        );
        continue;
      }
      let lessonDate = chain[0].date;
      for (const ancestor of chain) {
        if (ancestor.hasBulk === 1) {
          lessonDate = ancestor.date;
        }
      }
      originalDateMap.set(lessonId, lessonDate);
    }
    return originalDateMap;
  }

  /**
   * Update course boundaries from first/last non-deleted confirmed lessons
   * in scheduled/rescheduled/unscheduled states.
   */
  private async updateCourseDatesBatch(courseIds: number[], manager: any): Promise<void> {
    if (!courseIds.length) return;

    const firstLastRows = (await manager
      .getRepository(Lesson)
      .createQueryBuilder('l')
      .select('l.courseId', 'courseId')
      .addSelect('MIN(l.date)', 'first')
      .addSelect('MAX(l.date)', 'last')
      .addSelect('l.courseId', 'courseId')
      .where('l.courseId IN (:...courseIds)', { courseIds })
      .andWhere(validCourseDateSql('l.date'))
      .andWhere('l.isDeleted = false')
      .andWhere('l.isConfirmed = true')
      .andWhere('l.status IN (:...statuses)', {
        statuses: [
          LessonStatusEnum.SCHEDULED,
          LessonStatusEnum.RESCHEDULED,
          LessonStatusEnum.UNSCHEDULED,
        ],
      })
      .groupBy('l.courseId')
      .getRawMany()) as Array<{ courseId: number; first: Date | null; last: Date | null }>;

    for (const firstLast of firstLastRows) {
      if (
        !firstLast?.first || !firstLast?.last ||
        !hasValidCourseBounds(firstLast.first, firstLast.last)
      ) continue;
      await manager.getRepository(Course).update(
        { id: Number(firstLast.courseId) } as any,
        { startDate: firstLast.first, endDate: firstLast.last } as Partial<Course>,
      );
    }
  }

  /**
   * Recalculate payment balances after lesson payments are modified.
   * This is critical for credit to appear in customer account.
   * 
   * Payment balance = payment.amount - SUM(lesson_payment.amount) - SUM(invoice_payment.amount)
   * 
   * @param paymentIds - Array of payment IDs to recalculate
   * @param manager - TypeORM entity manager
   */
  private async recalculatePaymentBalances(
    paymentIds: number[],
    manager: any,
  ): Promise<void> {
    if (!paymentIds.length) return;

    for (const paymentId of paymentIds) {
      // Get the payment details
      const payment = await manager
        .createQueryBuilder()
        .select('p.id', 'id')
        .addSelect('p.amount', 'amount')
        .from('payment', 'p')
        .where('p.id = :paymentId', { paymentId })
        .andWhere('p.isDeleted = 0')
        .getRawOne();

      if (!payment) continue;

      const paymentAmount = parseFloat(payment.amount || '0') || 0;

      // Calculate total applied to lessons (non-deleted lesson_payments)
      const lessonPaymentsResult = await manager
        .createQueryBuilder()
        .select('COALESCE(SUM(lp.amount), 0)', 'total')
        .from('lesson_payment', 'lp')
        .where('lp.paymentId = :paymentId', { paymentId })
        .andWhere('lp.isDeleted = 0')
        .getRawOne();

      const lessonPaymentsTotal = parseFloat(lessonPaymentsResult?.total || '0') || 0;

      // Calculate total applied to invoices (non-deleted invoice_payments)
      const invoicePaymentsResult = await manager
        .createQueryBuilder()
        .select('COALESCE(SUM(ip.amount), 0)', 'total')
        .from('invoice_payment', 'ip')
        .where('ip.paymentId = :paymentId', { paymentId })
        .andWhere('ip.isDeleted = 0')
        .getRawOne();

      const invoicePaymentsTotal = parseFloat(invoicePaymentsResult?.total || '0') || 0;

      // Calculate new balance: payment.amount - lesson_payments - invoice_payments
      const newBalance = RoundingUtils.roundDecimal(
        paymentAmount - lessonPaymentsTotal - invoicePaymentsTotal,
        4,
      );

      // Update payment balance
      await manager
        .createQueryBuilder()
        .update('payment')
        .set({ balance: newBalance })
        .where('id = :paymentId', { paymentId })
        .execute();
    }
  }

  private async getCreditAppliedTotalsByLessonEnrolment(
    lessons: Lesson[],
    courseToEnrolment: Map<number, { enrolmentId: number; customerId: number }>,
    manager: any,
  ): Promise<Map<string, number>> {
    const lessonIds: number[] = [];
    const enrolmentIds = new Set<number>();
    const validKeys = new Set<string>();

    for (const lesson of lessons) {
      const enrolmentInfo = courseToEnrolment.get(Number(lesson.courseId));
      if (!enrolmentInfo) continue;
      lessonIds.push(lesson.id);
      enrolmentIds.add(enrolmentInfo.enrolmentId);
      validKeys.add(`${lesson.id},${enrolmentInfo.enrolmentId}`);
    }

    const resultMap = new Map<string, number>();
    if (!lessonIds.length || !enrolmentIds.size) return resultMap;

    const rows = (await manager
      .createQueryBuilder()
      .select('lp.lessonId', 'lessonId')
      .addSelect('lp.enrolmentId', 'enrolmentId')
      .addSelect('COALESCE(SUM(lp.amount), 0)', 'total')
      .from('lesson_payment', 'lp')
      .innerJoin('payment', 'p', 'p.id = lp.paymentId')
      .where('lp.lessonId IN (:...lessonIds)', { lessonIds })
      .andWhere('lp.enrolmentId IN (:...enrolmentIds)', {
        enrolmentIds: [...enrolmentIds],
      })
      .andWhere('lp.isDeleted = 0')
      .andWhere('p.isDeleted = 0')
      .andWhere('p.payment_method_id != :creditUsedMethod', {
        creditUsedMethod: PaymentMethod.TYPE_CREDIT_USED,
      })
      .groupBy('lp.lessonId')
      .addGroupBy('lp.enrolmentId')
      .getRawMany()) as Array<{ lessonId: number; enrolmentId: number; total: string }>;

    for (const row of rows) {
      const key = `${Number(row.lessonId)},${Number(row.enrolmentId)}`;
      if (validKeys.has(key)) {
        resultMap.set(key, parseFloat(row.total || '0') || 0);
      }
    }
    return resultMap;
  }
}
