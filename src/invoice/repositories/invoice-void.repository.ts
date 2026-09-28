import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, In } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceLineItem } from '../entities/invoice-line-item.entity';
import { InvoicePayment } from '../entities/invoice-payment.entity';
import { InvoiceReverse } from '../entities/invoice-reverse.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonPayment } from '../../lesson/entities/lesson-payment.entity';
import { PrivateLesson } from '../../lesson/entities/private-lesson.entity';
import { GroupLesson } from '../../lesson/entities/group-lesson.entity';
import { Note } from '../../comment/entities/notes.entity';
import { Payment } from '../../payment/entities/payment.entity';
import { CreditUsage } from '../../payment/entities/credit-usage.entity';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { AuditTrailService } from '../../audit-trail/services/audit-trail.service';
import { RoundingUtils } from '../../utils/rounding.utils';

type LessonContext = {
  lessonId: number;
  enrolmentId: number | null;
};

@Injectable()
export class InvoiceVoidRepository {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(InvoiceLineItem)
    private readonly lineItemRepository: Repository<InvoiceLineItem>,
    @InjectRepository(InvoiceReverse)
    private readonly invoiceReverseRepository: Repository<InvoiceReverse>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(LessonPayment)
    private readonly lessonPaymentRepository: Repository<LessonPayment>,
    @InjectRepository(Note)
    private readonly noteRepository: Repository<Note>,
    private readonly auditTrailService: AuditTrailService,
  ) {}

  /**
   * Find invoice by ID and locationId
   */
  async findInvoiceById(
    locationId: number,
    invoiceId: number,
  ): Promise<Invoice | null> {
    return this.invoiceRepository
      .createQueryBuilder('invoice')
      .where('invoice.id = :invoiceId', { invoiceId })
      .andWhere('invoice.locationId = :locationId', { locationId })
      .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: false })
      .getOne();
  }

  /**
   * Check if the invoice's first non-deleted line item is of type PAYMENT_CREDIT (10).
   * Matches legacy isPaymentCreditInvoice(): checks single first line item.
   */
  async isPaymentCreditInvoice(invoiceId: number): Promise<boolean> {
    const firstLineItem = await this.lineItemRepository
      .createQueryBuilder('li')
      .where('li.invoiceId = :invoiceId', { invoiceId })
      .andWhere('li.isDeleted = :isDeleted', { isDeleted: false })
      .getOne();

    if (!firstLineItem) {
      return false;
    }

    return firstLineItem.itemTypeId === 10; // ItemType::TYPE_PAYMENT_CREDIT
  }

  /**
   * Check if invoice is a reversed invoice.
   * Checks the invoice_reverse junction table.
   * Matches legacy: isReversedInvoice() → !empty($this->reversedInvoice)
   */
  async isReversedInvoice(invoiceId: number): Promise<boolean> {
    const reverseRecord = await this.invoiceReverseRepository
      .createQueryBuilder('ir')
      .where('ir.reversedInvoiceId = :invoiceId', { invoiceId })
      .getOne();

    return !!reverseRecord;
  }

  /**
   * Mark invoice as void.
   * Uses direct update (like legacy updateAttributes) — no model events.
   * Sets isVoid=1, tax=0.00, isTaxAdjusted=0.
   */
  async markInvoiceAsVoid(
    invoiceId: number,
    userId: number,
    manager: EntityManager,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .update('invoice')
      .set({
        isVoid: 1,
        tax: 0.00,
        isTaxAdjusted: 0,
        updatedUserId: userId,
      })
      .where('id = :invoiceId', { invoiceId })
      .execute();
  }

  /**
   * Get all non-deleted line items for an invoice, with their associated
   * lesson (via invoice_item_lesson) and item (to check if lesson item).
   * 
   * Groups by lineItemId to prevent duplicates from multiple enrolments.
   */
  async getLineItemsWithLessonInfo(
    invoiceId: number,
    manager: EntityManager,
  ): Promise<any[]> {
    return manager
      .createQueryBuilder()
      .select([
        'li.id AS lineItemId',
        'li.item_id AS itemId',
        'li.item_type_id AS itemTypeId',
        'item.itemCategoryId AS itemCategoryId',
        'iil.lessonId AS lessonId',
        'lesson.courseId AS courseId',
        'lesson.status AS lessonStatus',
        'program.type AS programType',
        'MIN(enrolment.id) AS enrolmentId',
      ])
      .from('invoice_line_item', 'li')
      .leftJoin('item', 'item', 'item.id = li.item_id')
      .leftJoin('invoice_item_lesson', 'iil', 'iil.invoiceLineItemId = li.id')
      .leftJoin('lesson', 'lesson', 'lesson.id = iil.lessonId')
      .leftJoin('course', 'course', 'course.id = lesson.courseId')
      .leftJoin('program', 'program', 'program.id = course.programId')
      .leftJoin('enrolment', 'enrolment', 'enrolment.courseId = lesson.courseId')
      .where('li.invoice_id = :invoiceId', { invoiceId })
      .andWhere('li.isDeleted = :isDeleted', { isDeleted: false })
      .groupBy('li.id')
      .addGroupBy('li.item_id')
      .addGroupBy('li.item_type_id')
      .addGroupBy('item.itemCategoryId')
      .addGroupBy('iil.lessonId')
      .addGroupBy('lesson.courseId')
      .addGroupBy('lesson.status')
      .addGroupBy('program.type')
      .getRawMany();
  }

  /**
   * Soft-delete a single line item (set isDeleted = true).
   * Matches legacy SoftDeleteBehavior.
   */
  async softDeleteLineItem(
    lineItemId: number,
    manager: EntityManager,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .update('invoice_line_item')
      .set({ isDeleted: true })
      .where('id = :lineItemId', { lineItemId })
      .execute();
  }

  /**
   * Legacy-style void entry point for lesson-credit invoices.
   * Finds the credit-used lesson payment(s) and starts the recursive cleanup
   * that mirrors the old ActiveRecord delete hooks.
   */
  async deleteCreditUsedPayments(
    lessonId: number,
    enrolmentId: number,
    voidedInvoiceId: number,
    userId: number,
    manager: EntityManager,
  ): Promise<void> {
    const creditPayments = await manager
      .getRepository(LessonPayment)
      .createQueryBuilder('lp')
      .distinct(true)
      .select('lp.paymentId', 'paymentId')
      .addSelect('lp.lessonId', 'lessonId')
      .addSelect('lp.enrolmentId', 'enrolmentId')
      .innerJoin('lp.payment', 'payment')
      .where('lp.lessonId = :lessonId', { lessonId })
      .andWhere('lp.enrolmentId = :enrolmentId', { enrolmentId })
      .andWhere('lp.isDeleted = :isDeleted', { isDeleted: 0 })
      .andWhere('payment.paymentMethodId = :creditUsedMethodId', {
        creditUsedMethodId: PaymentMethod.TYPE_CREDIT_USED,
      })
      .getRawMany();

    if (creditPayments.length === 0) {
      return;
    }

    const visitedPaymentIds = new Set<number>();
    const affectedInvoiceIds = new Set<number>();
    const affectedLessonContexts = new Map<string, LessonContext>();

    for (const paymentRow of creditPayments) {
      const paymentId = Number(paymentRow.paymentId);
      if (!Number.isFinite(paymentId) || paymentId <= 0) {
        continue;
      }

      await this.softDeletePaymentCascade(
        paymentId,
        userId,
        manager,
        visitedPaymentIds,
        affectedInvoiceIds,
        affectedLessonContexts,
      );
    }

    await this.recalculateLessonBalances(
      affectedLessonContexts,
      userId,
      manager,
    );

    for (const affectedInvoiceId of affectedInvoiceIds) {
      if (Number(affectedInvoiceId) === Number(voidedInvoiceId)) {
        continue;
      }

      await this.recalculateInvoiceTotals(affectedInvoiceId, userId, manager);
    }
  }

  /**
   * Build a stable key for a lesson/enrolment pair so it is only recalculated once.
   */
  private lessonContextKey(context: LessonContext): string {
    return `${context.lessonId}:${context.enrolmentId ?? ''}`;
  }

  /**
   * Collect every lesson/enrolment pair touched by a payment so balances can be refreshed.
   */
  private async getLessonContextsForPayment(
    paymentId: number,
    manager: EntityManager,
  ): Promise<LessonContext[]> {
    const rows = await manager
      .getRepository(LessonPayment)
      .createQueryBuilder('lp')
      .distinct(true)
      .select('lp.lessonId', 'lessonId')
      .addSelect('lp.enrolmentId', 'enrolmentId')
      .where('lp.paymentId = :paymentId', { paymentId })
      .andWhere('lp.isDeleted = :isDeleted', { isDeleted: 0 })
      .getRawMany();

    return rows
      .map((row: { lessonId: number; enrolmentId: number | null }) => ({
        lessonId: Number(row.lessonId),
        enrolmentId:
          row.enrolmentId === null || row.enrolmentId === undefined
            ? null
            : Number(row.enrolmentId),
      }))
      .filter((context: LessonContext) => Number.isFinite(context.lessonId));
  }

  /**
   * Collect invoices linked to a payment so their totals can be recalculated after the cascade.
   */
  private async getInvoiceIdsForPayment(
    paymentId: number,
    manager: EntityManager,
  ): Promise<number[]> {
    const rows = await manager
      .getRepository(InvoicePayment)
      .createQueryBuilder('ip')
      .distinct(true)
      .select('ip.invoiceId', 'invoiceId')
      .where('ip.paymentId = :paymentId', { paymentId })
      .andWhere('ip.isDeleted = :isDeleted', { isDeleted: 0 })
      .getRawMany();

    return rows
      .map((row: { invoiceId: number }) => Number(row.invoiceId))
      .filter((invoiceId: number) => Number.isFinite(invoiceId));
  }

  /**
   * Recursively soft-delete a payment chain and mirror the legacy AR delete hooks.
   */
  private async softDeletePaymentCascade(
    paymentId: number,
    userId: number,
    manager: EntityManager,
    visitedPaymentIds: Set<number>,
    affectedInvoiceIds: Set<number>,
    affectedLessonContexts: Map<string, LessonContext>,
  ): Promise<void> {
    if (visitedPaymentIds.has(paymentId)) {
      return;
    }
    visitedPaymentIds.add(paymentId);

    const payment = await manager.getRepository(Payment).findOne({
      where: { id: paymentId },
    });

    if (!payment || Number(payment.isDeleted) === 1) {
      return;
    }

    const lessonContexts = await this.getLessonContextsForPayment(paymentId, manager);
    for (const context of lessonContexts) {
      affectedLessonContexts.set(this.lessonContextKey(context), context);
    }

    const invoiceIds = await this.getInvoiceIdsForPayment(paymentId, manager);
    for (const invoiceId of invoiceIds) {
      affectedInvoiceIds.add(invoiceId);
    }

    const invoicePaymentsBefore = await manager
      .getRepository(InvoicePayment)
      .find({
        where: { paymentId, isDeleted: 0 },
      });
    const lessonPaymentsBefore = await manager
      .getRepository(LessonPayment)
      .find({
        where: { paymentId, isDeleted: 0 },
      });

    await manager
      .createQueryBuilder()
      .update(Payment)
      .set({
        isDeleted: 1,
        updatedByUserId: userId,
      })
      .where('id = :paymentId', { paymentId })
      .execute();

    await manager
      .createQueryBuilder()
      .update(InvoicePayment)
      .set({
        isDeleted: 1,
        updatedByUserId: userId,
      })
      .where('paymentId = :paymentId', { paymentId })
      .andWhere('isDeleted = :isDeleted', { isDeleted: 0 })
      .execute();

    await manager
      .createQueryBuilder()
      .update(LessonPayment)
      .set({
        isDeleted: 1,
        updatedByUserId: userId,
      })
      .where('paymentId = :paymentId', { paymentId })
      .andWhere('isDeleted = :isDeleted', { isDeleted: 0 })
      .execute();

    const paymentAfter = await manager.getRepository(Payment).findOne({
      where: { id: paymentId },
    });
    if (paymentAfter) {
      await this.auditTrailService.writeUpdateEntry(manager, {
        target: Payment,
        modelType: 'common\\models\\Payment',
        before: payment,
        after: paymentAfter,
        userId,
      });
    }

    const invoicePaymentIds = invoicePaymentsBefore.map((item) => item.id);
    const invoicePaymentsAfter =
      invoicePaymentIds.length > 0
        ? await manager.getRepository(InvoicePayment).find({
            where: { id: In(invoicePaymentIds) },
          })
        : [];
    const invoicePaymentsAfterById = new Map(
      invoicePaymentsAfter.map((item) => [item.id, item]),
    );
    for (const before of invoicePaymentsBefore) {
      const after = invoicePaymentsAfterById.get(before.id);
      if (after) {
        await this.auditTrailService.writeUpdateEntry(manager, {
          target: InvoicePayment,
          modelType: 'common\\models\\InvoicePayment',
          before,
          after,
          userId,
        });
      }
    }

    const lessonPaymentIds = lessonPaymentsBefore.map((item) => item.id);
    const lessonPaymentsAfter =
      lessonPaymentIds.length > 0
        ? await manager.getRepository(LessonPayment).find({
            where: { id: In(lessonPaymentIds) },
          })
        : [];
    const lessonPaymentsAfterById = new Map(
      lessonPaymentsAfter.map((item) => [item.id, item]),
    );
    for (const before of lessonPaymentsBefore) {
      const after = lessonPaymentsAfterById.get(before.id);
      if (after) {
        await this.auditTrailService.writeUpdateEntry(manager, {
          target: LessonPayment,
          modelType: 'common\\models\\LessonPayment',
          before,
          after,
          userId,
        });
      }
}
    if (Number(payment.paymentMethodId) === PaymentMethod.TYPE_CREDIT_USED) {
      const creditUsage = await manager.getRepository(CreditUsage).findOne({
        where: { debitPaymentId: paymentId },
      });

      if (creditUsage?.creditPaymentId) {
        await this.softDeletePaymentCascade(
          Number(creditUsage.creditPaymentId),
          userId,
          manager,
          visitedPaymentIds,
          affectedInvoiceIds,
          affectedLessonContexts,
        );
      }
    }

    if (Number(payment.paymentMethodId) === PaymentMethod.TYPE_CREDIT_APPLIED) {
      const creditUsage = await manager.getRepository(CreditUsage).findOne({
        where: { creditPaymentId: paymentId },
      });

      if (creditUsage?.debitPaymentId) {
        await this.softDeletePaymentCascade(
          Number(creditUsage.debitPaymentId),
          userId,
          manager,
          visitedPaymentIds,
          affectedInvoiceIds,
          affectedLessonContexts,
        );
      }

      const creditUsedPaymentIds = await this.findCreditUsedPaymentsForContexts(
        lessonContexts,
        manager,
      );

      for (const creditUsedPaymentId of creditUsedPaymentIds) {
        await this.softDeletePaymentCascade(
          creditUsedPaymentId,
          userId,
          manager,
          visitedPaymentIds,
          affectedInvoiceIds,
          affectedLessonContexts,
        );
      }
    }
  }

  /**
   * Find the remaining credit-used payments for the affected lesson contexts.
   * This is used when a credit-applied payment is removed and its debit side
   * must be cleaned up too.
   */
  private async findCreditUsedPaymentsForContexts(
    lessonContexts: LessonContext[],
    manager: EntityManager,
  ): Promise<number[]> {
    if (lessonContexts.length === 0) {
      return [];
    }

    const paymentIds = new Set<number>();

    for (const context of lessonContexts) {
      const rows = await manager
        .getRepository(LessonPayment)
        .createQueryBuilder('lp')
        .distinct(true)
        .select('lp.paymentId', 'paymentId')
        .innerJoin('lp.payment', 'payment')
        .where('lp.lessonId = :lessonId', { lessonId: context.lessonId })
        .andWhere('lp.enrolmentId = :enrolmentId', {
          enrolmentId: context.enrolmentId,
        })
        .andWhere('lp.isDeleted = :isDeleted', { isDeleted: 0 })
        .andWhere('payment.paymentMethodId = :creditUsedMethodId', {
          creditUsedMethodId: PaymentMethod.TYPE_CREDIT_USED,
        })
        .getRawMany();

      for (const row of rows as Array<{ paymentId: number }>) {
        const paymentId = Number(row.paymentId);
        if (Number.isFinite(paymentId) && paymentId > 0) {
          paymentIds.add(paymentId);
        }
      }
    }

    return [...paymentIds];
  }

  /**
   * Refresh all private/group lesson balances that were touched by the void cascade.
   */
  private async recalculateLessonBalances(
    affectedLessonContexts: Map<string, LessonContext>,
    userId: number,
    manager: EntityManager,
  ): Promise<void> {
    for (const context of affectedLessonContexts.values()) {
      await this.recalculatePrivateLessonBalance(
        context.lessonId,
        context.enrolmentId,
        manager,
      );

      if (context.enrolmentId !== null && context.enrolmentId !== undefined) {
        await this.recalculateGroupLessonBalance(
          context.lessonId,
          context.enrolmentId,
          userId,
          manager,
        );
      }
    }
  }

  /**
   * Sum the remaining non-credit-used lesson payment amounts for one lesson/enrolment pair.
   */
  private async getLessonCreditAppliedAmount(
    lessonId: number,
    enrolmentId: number,
    manager: EntityManager,
  ): Promise<number> {
    const result = await manager
      .createQueryBuilder()
      .select('COALESCE(SUM(lp.amount), 0)', 'total')
      .from('lesson_payment', 'lp')
      .innerJoin('payment', 'p', 'p.id = lp.paymentId AND p.isDeleted = 0')
      .where('lp.lessonId = :lessonId', { lessonId })
      .andWhere('lp.enrolmentId = :enrolmentId', { enrolmentId })
      .andWhere('lp.isDeleted = 0')
      .andWhere('p.payment_method_id != :creditUsedMethodId', {
        creditUsedMethodId: PaymentMethod.TYPE_CREDIT_USED,
      })
      .getRawOne();

    return Number.parseFloat(result?.total || '0') || 0;
  }

  /**
   * Persist the recalculated balance on private_lesson to match the remaining payments.
   */
  private async recalculatePrivateLessonBalance(
    lessonId: number,
    enrolmentId: number | null,
    manager: EntityManager,
  ): Promise<void> {
    if (enrolmentId === null || enrolmentId === undefined) {
      return;
    }

    const privateLessonRepo = manager.getRepository(PrivateLesson);
    const privateLesson = await privateLessonRepo.findOne({
      where: { lessonId },
    });

    if (!privateLesson) {
      return;
    }

    const creditAppliedAmount = await this.getLessonCreditAppliedAmount(
      lessonId,
      enrolmentId,
      manager,
    );
    privateLesson.balance = RoundingUtils.calculateBalance(
      privateLesson.total,
      creditAppliedAmount,
      2,
    );

    await privateLessonRepo.save(privateLesson);
  }

  /**
   * Persist the recalculated balance and paid status on group_lesson.
   */
  private async recalculateGroupLessonBalance(
    lessonId: number,
    enrolmentId: number,
    userId: number,
    manager: EntityManager,
  ): Promise<void> {
    const groupLessonRepo = manager.getRepository(GroupLesson);
    const groupLesson = await groupLessonRepo.findOne({
      where: { lessonId, enrolmentId },
    });

    if (!groupLesson) {
      return;
    }

    const creditAppliedAmount = await this.getLessonCreditAppliedAmount(
      lessonId,
      enrolmentId,
      manager,
    );
    const balance = RoundingUtils.calculateBalance(
      groupLesson.total,
      creditAppliedAmount,
      2,
    );

    groupLesson.balance = balance;
    groupLesson.paidStatus =
      balance === 0
        ? GroupLesson.STATUS_PAID
        : balance < 0
          ? GroupLesson.STATUS_CREDIT
          : GroupLesson.STATUS_OWING;
    groupLesson.updatedByUserId = userId;

    await groupLessonRepo.save(groupLesson);
  }

  /**
   * Legacy unschedule side effect: add a note and mark the lesson unscheduled.
   */
  async unscheduleLesson(
    lessonId: number,
    userId: number,
    manager: EntityManager,
  ): Promise<void> {
    const lessonBefore = await manager.getRepository(Lesson).findOne({
      where: { id: lessonId },
    });

    // Create note record
    await manager
      .createQueryBuilder()
      .insert()
      .into('note')
      .values({
        content: 'Invoice Line Item Deleted',
        instanceId: lessonId,
        instanceType: Note.INSTANCE_TYPE_LESSON, // 3
        createdUserId: userId,
      })
      .execute();

    // Update lesson status
    await manager
      .createQueryBuilder()
      .update('lesson')
      .set({
        status: LessonStatusEnum.UNSCHEDULED, // 5
        isPresent: true,
        updatedByUserId: userId,
      })
      .where('id = :lessonId', { lessonId })
      .execute();

    if (lessonBefore) {
      const lessonAfter = await manager.getRepository(Lesson).findOne({
        where: { id: lessonId },
      });
      if (lessonAfter) {
        await this.auditTrailService.writeUpdateEntry(manager, {
          target: Lesson,
          modelType: 'common\\models\\Lesson',
          before: lessonBefore,
          after: lessonAfter,
          userId,
        });
      }
    }
  }

  /**
   * Recalculate and save invoice totals after line items are soft-deleted.
   * This keeps the voided invoice in sync with the remaining payment rows.
   */
  async recalculateInvoiceTotals(
    invoiceId: number,
    userId: number,
    manager: EntityManager,
    writeAudit = true,
  ): Promise<void> {
    const invoiceBefore = writeAudit
      ? await manager.getRepository(Invoice).findOne({
          where: { id: invoiceId },
        })
      : null;

    // Get sum of non-deleted line items (will be 0 after void)
    const subTotalResult = await manager
      .createQueryBuilder()
      .select('COALESCE(SUM(li.netTotal), 0)', 'subTotal')
      .from('invoice_line_item', 'li')
      .where('li.invoice_id = :invoiceId', { invoiceId })
      .andWhere('li.isDeleted = :isDeleted', { isDeleted: false })
      .getRawOne();

    const subTotal = parseFloat(subTotalResult?.subTotal) || 0;

    // Get sum of non-deleted line item taxes
    const taxResult = await manager
      .createQueryBuilder()
      .select('COALESCE(SUM(li.tax_rate), 0)', 'totalTax')
      .from('invoice_line_item', 'li')
      .where('li.invoice_id = :invoiceId', { invoiceId })
      .andWhere('li.isDeleted = :isDeleted', { isDeleted: false })
      .getRawOne();

    const lineItemTax = parseFloat(taxResult?.totalTax) || 0;

    // Tax is already set to 0 by markInvoiceAsVoid and isTaxAdjusted = false
    // So tax follows lineItemTax (which is 0 since all items deleted)
    const tax = lineItemTax;
    const total = subTotal + tax;

    // Get total paid amount
    const paidResult = await manager
      .createQueryBuilder()
      .select('COALESCE(SUM(ip.amount), 0)', 'totalPaid')
      .from('invoice_payment', 'ip')
      .innerJoin('payment', 'p', 'p.id = ip.payment_id AND p.isDeleted = 0')
      .where('ip.invoice_id = :invoiceId', { invoiceId })
      .andWhere('ip.isDeleted = 0')
      .getRawOne();

    const paidAmount = parseFloat(paidResult?.totalPaid) || 0;

    // Calculate balance and status (matches legacy getInvoiceStatus / getInvoiceBalance)
    const roundedTotal = RoundingUtils.roundDecimal(total, 2);
    const roundedPaid = RoundingUtils.roundDecimal(paidAmount, 2);

    let balance: number;
    let status: number;

    if (roundedTotal === roundedPaid) {
      balance = 0;
      status = Invoice.STATUS_PAID;
    } else if (roundedTotal > roundedPaid) {
      balance = roundedTotal - roundedPaid;
      status = Invoice.STATUS_OWING;
    } else {
      balance = roundedTotal - roundedPaid;
      status = Invoice.STATUS_CREDIT;
    }

    // Update invoice
    await manager
      .createQueryBuilder()
      .update('invoice')
      .set({
        subTotal,
        tax,
        total,
        balance,
        status,
        updatedUserId: userId,
      })
      .where('id = :invoiceId', { invoiceId })
      .execute();

    if (invoiceBefore) {
      const invoiceAfter = await manager.getRepository(Invoice).findOne({
        where: { id: invoiceId },
      });
      if (invoiceAfter) {
        await this.auditTrailService.writeUpdateEntry(manager, {
          target: Invoice,
          modelType: 'common\\models\\Invoice',
          before: invoiceBefore,
          after: invoiceAfter,
          userId,
        });
      }
    }
  }

}
