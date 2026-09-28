import { Injectable } from '@nestjs/common';
import {
  hasValidCourseBounds,
  validCourseDateSql,
} from '../../../course/utils/course-date.utils';
import { EntityManager, In } from 'typeorm';
import { Lesson } from '../../entities/lesson.entity';
import { LessonPayment } from '../../entities/lesson-payment.entity';
import { Course } from '../../../course/entities/course.entity';
import { PaymentMethod } from '../../../payment/entities/payment-method.entity';
import { Invoice } from '../../../invoice/entities/invoice.entity';
import { LessonStatusEnum } from '../../enums/lesson-status';
import { Payment } from '../../../payment/entities/payment.entity';
import { InvoicePayment } from '../../../invoice/entities/invoice-payment.entity';
import { CreditUsage } from '../../../payment/entities/credit-usage.entity';
import { RoundingUtils } from '../../../utils/rounding.utils';

/**
 * Data access for private lesson delete.
 * Legacy-identical to Lesson::delete(), afterSoftDelete(), getCreditAppliedPayment().
 */
@Injectable()
export class PrivateLessonDeleteRepository {
  private static readonly AUTO_PAYMENT_METHODS = [
    PaymentMethod.TYPE_ACCOUNT_ENTRY,
    PaymentMethod.TYPE_CREDIT_USED,
    PaymentMethod.TYPE_CREDIT_APPLIED,
  ];
  
  async findLessonsForDelete(
    locationId: number,
    lessonIds: number[],
    manager: EntityManager,
  ): Promise<Lesson[]> {
    const repo = manager.getRepository(Lesson);
    return repo.find({
      where: {
        id: In(lessonIds),
        course: { locationId, isDeleted: false } as any,
      },
      relations: [
        'course',
        'course.program',
        'course.enrolments',
        'course.enrolments.student',
        'course.enrolments.student.user',
        'course.enrolments.student.user.profile',
      ],
      order: { date: 'DESC' },
    });
  }

  async findOneByLessonId(
    lessonId: number,
    manager: EntityManager,
  ): Promise<Invoice | null> {
    const result = await manager
      .createQueryBuilder(Invoice, 'invoice')
      .innerJoin(
        'invoice_line_item',
        'ili',
        'ili.invoice_id = invoice.id AND COALESCE(ili.isDeleted, 0) = 0',
      )
      .innerJoin('invoice_item_lesson', 'iil', 'iil.invoiceLineItemId = ili.id')
      .where('iil.lessonId = :lessonId', { lessonId })
      .andWhere('invoice.isDeleted = false')
      .andWhere('invoice.type = :type', { type: Invoice.TYPE_INVOICE })
      .getOne();
    return result ?? null;
  }

  /** Batch: lesson IDs that have an invoice (for deletability check). */
  async findLessonIdsWithInvoices(
    lessonIds: number[],
    manager: EntityManager,
  ): Promise<Set<number>> {
    if (lessonIds.length === 0) return new Set();
    const rows = await manager
      .createQueryBuilder(Invoice, 'invoice')
      .innerJoin(
        'invoice_line_item',
        'ili',
        'ili.invoice_id = invoice.id AND COALESCE(ili.isDeleted, 0) = 0',
      )
      .innerJoin('invoice_item_lesson', 'iil', 'iil.invoiceLineItemId = ili.id')
      .where('iil.lessonId IN (:...lessonIds)', { lessonIds })
      .andWhere('invoice.isDeleted = false')
      .andWhere('invoice.type = :type', { type: Invoice.TYPE_INVOICE })
      .select('iil.lessonId', 'lessonId')
      .distinct(true)
      .getRawMany();
    return new Set((rows as { lessonId: number }[]).map((r) => r.lessonId));
  }

  /**
   * Legacy: Lesson::getCreditAppliedPayment() - lesson payments with credit-applied (not credit-used).
   */
  async getCreditAppliedLessonPayments(
    lessonId: number,
    enrolmentId: number,
    manager: EntityManager,
  ): Promise<LessonPayment[]> {
    return manager
      .getRepository(LessonPayment)
      .createQueryBuilder('lp')
      .innerJoin('payment', 'p', 'p.id = lp.paymentId AND p.isDeleted = false')
      .where('lp.lessonId = :lessonId', { lessonId })
      .andWhere('p.payment_method_id != :creditUsed', {
        creditUsed: PaymentMethod.TYPE_CREDIT_USED,
      })
      .andWhere('lp.enrolmentId = :enrolmentId', { enrolmentId })
      .andWhere('lp.isDeleted = false')
      .select('lp')
      .getMany();
  }

  /**
   * Batch: credit amount per (lessonId, enrolmentId). Returns map keyed by "lessonId,enrolmentId".
   */
  async getLessonCreditAmountsBatch(
    entries: { lessonId: number; enrolmentId: number }[],
    manager: EntityManager,
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (entries.length === 0) return map;
    const qb = manager
      .getRepository(LessonPayment)
      .createQueryBuilder('lp')
      .innerJoin('payment', 'p', 'p.id = lp.paymentId AND p.isDeleted = false')
      .innerJoin('payment_method', 'pm', 'pm.id = p.payment_method_id')
      .where('pm.id != :creditUsed', { creditUsed: PaymentMethod.TYPE_CREDIT_USED })
      .andWhere('lp.isDeleted = false')
      .select('lp.lessonId', 'lessonId')
      .addSelect('lp.enrolmentId', 'enrolmentId')
      .addSelect('COALESCE(SUM(lp.amount), 0)', 'total')
      .groupBy('lp.lessonId')
      .addGroupBy('lp.enrolmentId');

    const orConditions = entries.map(
      (_, i) => `(lp.lessonId = :lessonId${i} AND lp.enrolmentId = :enrolmentId${i})`,
    );
    const params: Record<string, number> = {};
    entries.forEach((e, i) => {
      params[`lessonId${i}`] = e.lessonId;
      params[`enrolmentId${i}`] = e.enrolmentId;
    });
    qb.andWhere(`(${orConditions.join(' OR ')})`, params);
    const rows = await qb.getRawMany();
    for (const r of rows as { lessonId: number; enrolmentId: number; total: string }[]) {
      map.set(`${r.lessonId},${r.enrolmentId}`, parseFloat(r.total || '0'));
    }
    return map;
  }

  /**
   * Batch: all credit-applied lesson payments for given (lessonId, enrolmentId) pairs.
   */
  async getCreditAppliedLessonPaymentsBatch(
    entries: { lessonId: number; enrolmentId: number }[],
    manager: EntityManager,
  ): Promise<LessonPayment[]> {
    if (entries.length === 0) return [];
    const qb = manager
      .getRepository(LessonPayment)
      .createQueryBuilder('lp')
      .innerJoin('payment', 'p', 'p.id = lp.paymentId AND p.isDeleted = false')
      .where('p.payment_method_id != :creditUsed', {
        creditUsed: PaymentMethod.TYPE_CREDIT_USED,
      })
      .andWhere('lp.isDeleted = false')
      .select('lp');

    const orConditions = entries.map(
      (_, i) => `(lp.lessonId = :lessonId${i} AND lp.enrolmentId = :enrolmentId${i})`,
    );
    const params: Record<string, number> = {};
    entries.forEach((e, i) => {
      params[`lessonId${i}`] = e.lessonId;
      params[`enrolmentId${i}`] = e.enrolmentId;
    });
    qb.andWhere(`(${orConditions.join(' OR ')})`, params);
    return qb.getMany();
  }

  async softDeleteLessonPayments(
    lessonPayments: LessonPayment[],
    manager: EntityManager,
  ): Promise<void> {
    const repo = manager.getRepository(LessonPayment);
    for (const lp of lessonPayments) {
      lp.isDeleted = 1;
      await repo.save(lp);
    }
  }

  /** Bulk soft-delete lesson payments by IDs (single UPDATE). */
  async softDeleteLessonPaymentsByIds(
    ids: number[],
    manager: EntityManager,
  ): Promise<void> {
    if (ids.length === 0) return;
    await manager.getRepository(LessonPayment).update({ id: In(ids) }, { isDeleted: 1 });
  }

  /**
   * Legacy: Course::updateDates() - set startDate/endDate from first/last non-deleted lesson.
   */
  async updateCourseDates(
    courseId: number,
    manager: EntityManager,
  ): Promise<void> {
    const firstLast = await manager
      .getRepository(Lesson)
      .createQueryBuilder('l')
      .select('MIN(l.date)', 'first')
      .addSelect('MAX(l.date)', 'last')
      .where('l.courseId = :courseId', { courseId })
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
      .getRawOne();

    if (
      firstLast?.first && firstLast?.last &&
      hasValidCourseBounds(firstLast.first, firstLast.last)
    ) {
      await manager.getRepository(Course).update(
        { id: courseId },
        { startDate: firstLast.first, endDate: firstLast.last },
      );
    }
  }

  async softDeleteLesson(lesson: Lesson, manager: EntityManager): Promise<void> {
    const repo = manager.getRepository(Lesson);
    lesson.isDeleted = true;
    await repo.save(lesson);
  }

  /** Bulk soft-delete lessons by IDs (single UPDATE). */
  async softDeleteLessonsByIds(
    lessonIds: number[],
    manager: EntityManager,
  ): Promise<void> {
    if (lessonIds.length === 0) return;
    await manager.getRepository(Lesson).update({ id: In(lessonIds) }, { isDeleted: true });
  }

  /**
   * Recalculate payment.balance for payments linked to the given lesson payments.
   * Mirrors legacy Payment::getBalanceAmount() used from Payment::beforeSave().
   * Also mirrors legacy LessonPayment::afterSoftDelete() auto-payment cascade:
   * - delete auto payment itself (account-entry/credit-used/credit-applied),
   * - delete linked invoice/lesson payments for deleted auto payment,
   * - for credit-applied, delete paired debit payment and lesson credit-used cascade.
   */
  async recalculatePaymentBalancesForLessonPayments(
    lessonPaymentIds: number[],
    manager: EntityManager,
  ): Promise<void> {
    if (lessonPaymentIds.length === 0) return;

    const lessonPaymentRows = await manager
      .getRepository(LessonPayment)
      .createQueryBuilder('lp')
      .select('lp.paymentId', 'paymentId')
      .addSelect('lp.lessonId', 'lessonId')
      .addSelect('lp.enrolmentId', 'enrolmentId')
      .where('lp.id IN (:...ids)', { ids: lessonPaymentIds })
      .getRawMany();

    const paymentIds = (lessonPaymentRows as Array<{ paymentId: number }>)
      .map((r) => Number(r.paymentId))
      .filter((id) => !!id);

    if (paymentIds.length === 0) return;

    const paymentRepo = manager.getRepository(Payment);
    const creditUsageRepo = manager.getRepository(CreditUsage);
    const uniquePaymentIds = [...new Set(paymentIds)];
    const affectedPaymentIds = new Set<number>(uniquePaymentIds);

    // Legacy parity: deleting lesson_payment rows triggers LessonPayment::afterSoftDelete().
    // That callback deletes auto payments and their paired/linked rows.
    for (const paymentId of uniquePaymentIds) {
      const payment = await paymentRepo.findOne({ where: { id: paymentId } });
      if (!payment || Number(payment.isDeleted) === 1) {
        continue;
      }

      if (!this.isAutoPayment(payment.paymentMethodId)) {
        continue;
      }

      // Delete origin auto-payment and its direct links.
      await this.softDeletePaymentWithLinks(payment.id, manager);

      if (Number(payment.paymentMethodId) === PaymentMethod.TYPE_CREDIT_APPLIED) {
        // Delete paired debit payment via credit_usage.
        const usage = await creditUsageRepo.findOne({
          where: { creditPaymentId: payment.id },
        });
        if (usage?.debitPaymentId) {
          affectedPaymentIds.add(Number(usage.debitPaymentId));
          await this.softDeletePaymentWithLinks(Number(usage.debitPaymentId), manager);
        }

        // Legacy Payment::afterSoftDelete() also deletes lesson credit-used payments
        // for the same lesson/enrolment context.
        const contextSet = new Set<string>();
        for (const row of lessonPaymentRows as Array<{
          paymentId: number;
          lessonId: number;
          enrolmentId: number | null;
        }>) {
          if (
            Number(row.paymentId) === payment.id &&
            Number.isFinite(Number(row.lessonId)) &&
            Number.isFinite(Number(row.enrolmentId))
          ) {
            contextSet.add(`${Number(row.lessonId)},${Number(row.enrolmentId)}`);
          }
        }

        for (const context of contextSet) {
          const [lessonIdStr, enrolmentIdStr] = context.split(',');
          const lessonId = Number(lessonIdStr);
          const enrolmentId = Number(enrolmentIdStr);
          if (!lessonId || !enrolmentId) continue;

          const creditUsedRows = await manager
            .getRepository(LessonPayment)
            .createQueryBuilder('lp')
            .innerJoin('payment', 'p', 'p.id = lp.paymentId AND p.isDeleted = false')
            .select('DISTINCT lp.paymentId', 'paymentId')
            .where('lp.lessonId = :lessonId', { lessonId })
            .andWhere('lp.enrolmentId = :enrolmentId', { enrolmentId })
            .andWhere('lp.isDeleted = false')
            .andWhere('p.payment_method_id = :creditUsed', {
              creditUsed: PaymentMethod.TYPE_CREDIT_USED,
            })
            .getRawMany();

          for (const row of creditUsedRows as Array<{ paymentId: number }>) {
            const creditUsedPaymentId = Number(row.paymentId);
            if (!creditUsedPaymentId) continue;
            affectedPaymentIds.add(creditUsedPaymentId);
            await this.softDeletePaymentWithLinks(creditUsedPaymentId, manager);
          }
        }
      }

      if (Number(payment.paymentMethodId) === PaymentMethod.TYPE_CREDIT_USED) {
        // Defensive parity (not expected in this delete path because selector excludes credit-used):
        // deleting debit should also delete paired credit payment.
        const usage = await creditUsageRepo.findOne({
          where: { debitPaymentId: payment.id },
        });
        if (usage?.creditPaymentId) {
          affectedPaymentIds.add(Number(usage.creditPaymentId));
          await this.softDeletePaymentWithLinks(Number(usage.creditPaymentId), manager);
        }
      }
    }

    // Recalculate only active payments; deleted payments are excluded from customer credits.
    for (const paymentId of affectedPaymentIds) {
      const payment = await paymentRepo.findOne({ where: { id: paymentId } });
      if (!payment || Number(payment.isDeleted) === 1) {
        continue;
      }

      const ipResult = await manager
        .getRepository(InvoicePayment)
        .createQueryBuilder('ip')
        .select('COALESCE(SUM(ip.amount), 0)', 'total')
        .where('ip.paymentId = :paymentId', { paymentId })
        .andWhere('ip.isDeleted = :isDeleted', { isDeleted: 0 })
        .getRawOne<{ total: string | number }>();
      const lpResult = await manager
        .getRepository(LessonPayment)
        .createQueryBuilder('lp')
        .select('COALESCE(SUM(lp.amount), 0)', 'total')
        .where('lp.paymentId = :paymentId', { paymentId })
        .andWhere('lp.isDeleted = :isDeleted', { isDeleted: 0 })
        .getRawOne<{ total: string | number }>();
      payment.balance = RoundingUtils.calculatePaymentBalance(
        payment.amount,
        ipResult?.total || 0,
        lpResult?.total || 0,
      );
      await paymentRepo.save(payment);
    }
  }

  private isAutoPayment(paymentMethodId: number): boolean {
    return PrivateLessonDeleteRepository.AUTO_PAYMENT_METHODS.includes(
      Number(paymentMethodId),
    );
  }

  private async softDeletePaymentWithLinks(
    paymentId: number,
    manager: EntityManager,
  ): Promise<void> {
    const paymentRepo = manager.getRepository(Payment);
    const payment = await paymentRepo.findOne({ where: { id: paymentId } });
    if (!payment || Number(payment.isDeleted) === 1) {
      return;
    }

    await paymentRepo.update({ id: paymentId }, { isDeleted: 1 });
    await manager
      .getRepository(InvoicePayment)
      .update({ paymentId, isDeleted: 0 } as any, { isDeleted: 1 });
    await manager
      .getRepository(LessonPayment)
      .update({ paymentId, isDeleted: 0 } as any, { isDeleted: 1 });
  }
}
