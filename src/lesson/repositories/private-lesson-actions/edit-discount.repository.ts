import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { LessonDiscount } from "src/lesson/entities/lesson-discount.entity";
import { Repository } from "typeorm";
import { EntityManager, In } from "typeorm";
import { PaymentMethod } from "src/payment/entities/payment-method.entity";
import { RoundingUtils } from "../../../utils/rounding.utils";

export interface DiscountUpdate {
  lessonId: number;
  type: number;
  value: number;
  valueType: number;
  enrolmentId: number;
}

@Injectable()
export class EditDiscountRepository {
  constructor(
    @InjectRepository(LessonDiscount)
    private lessonDiscountRepository: Repository<LessonDiscount>,
  ) {}

  private buildDiscountKey(lessonId: number, type: number, enrolmentId: number): string {
    return `${lessonId}-${type}-${enrolmentId}`;
  }

  /**
   * Find all discounts for the given lesson IDs (for GET edit-discount).
   */
  async findDiscountsByLessonIds(lessonIds: number[]): Promise<LessonDiscount[]> {
    if (!lessonIds.length) return [];
    return this.lessonDiscountRepository.find({
      where: { lessonId: In(lessonIds) },
    });
  }

  /**
   * Single lesson discount upsert (used when only one update).
   */
  async discountLessons(
    lessonId: number,
    type: number,
    value: number | null | undefined,
    valueType: number,
    enrolmentId: number,
    manager?: EntityManager,
  ): Promise<void> {
    if (value === null || value === undefined) return;

    const repo = manager
      ? manager.getRepository(LessonDiscount)
      : this.lessonDiscountRepository;

    const discountRows = await repo.find({
      where: { lessonId, type, enrolmentId },
      order: { id: 'ASC' },
    });

    let discount = discountRows[0];

    if (!discount) {
      discount = repo.create({
        lessonId,
        type,
        value,
        valueType,
        enrolmentId,
      });
    } else {
      discount.value = value;
      discount.valueType = valueType;
      discount.enrolmentId = enrolmentId;
    }

    await repo.save(discount);
  }

  /**
   * Bulk upsert: one find for all (lessonId, type) pairs, one save. Much faster for many lessons.
   */
  async discountLessonsBulk(
    updates: DiscountUpdate[],
    manager?: EntityManager,
  ): Promise<void> {
    if (!updates.length) return;

    const repo = manager
      ? manager.getRepository(LessonDiscount)
      : this.lessonDiscountRepository;

    const lessonIds = [...new Set(updates.map((u) => u.lessonId))];
    const types = [...new Set(updates.map((u) => u.type))];
    const enrolmentIds = [...new Set(updates.map((u) => u.enrolmentId))];

    const existing = await repo.find({
      where: { lessonId: In(lessonIds), type: In(types), enrolmentId: In(enrolmentIds) },
      order: { id: 'ASC' },
    });
    const map = new Map<string, LessonDiscount[]>();
    for (const e of existing) {
      const key = this.buildDiscountKey(e.lessonId, e.type, Number(e.enrolmentId ?? 0));
      const bucket = map.get(key) ?? [];
      bucket.push(e);
      map.set(key, bucket);
    }

    const toSave: LessonDiscount[] = [];
    for (const u of updates) {
      const key = this.buildDiscountKey(u.lessonId, u.type, u.enrolmentId);
      const matches = map.get(key) ?? [];

      let discount = matches[0];
      if (!discount) {
        discount = repo.create({
          lessonId: u.lessonId,
          type: u.type,
          value: u.value,
          valueType: u.valueType,
          enrolmentId: u.enrolmentId,
        });
      } else {
        discount.value = u.value;
        discount.valueType = u.valueType;
        discount.enrolmentId = u.enrolmentId;
      }
      toSave.push(discount);
    }

    await repo.save(toSave);
  }

  async getPrimaryEnrolmentIdsByLessonIds(
    lessonIds: number[],
    manager?: EntityManager,
  ): Promise<Array<{ lessonId: number; enrolmentId: number }>> {
    if (!lessonIds.length) return [];
    const em = manager ?? this.lessonDiscountRepository.manager;

    const rows = await em
      .createQueryBuilder()
      .select('lesson.id', 'lessonId')
      .addSelect('MIN(enrolment.id)', 'enrolmentId')
      .from('lesson', 'lesson')
      .innerJoin(
        'enrolment',
        'enrolment',
        'enrolment.courseId = lesson.courseId AND enrolment.isDeleted = 0 AND enrolment.isConfirmed = 1',
      )
      .where('lesson.id IN (:...lessonIds)', { lessonIds })
      .groupBy('lesson.id')
      .getRawMany();

    return rows
      .filter((r) => r?.lessonId && r?.enrolmentId)
      .map((r) => ({
        lessonId: Number(r.lessonId),
        enrolmentId: Number(r.enrolmentId),
      }));
  }

  async getCreditAppliedTotalsByLessonIds(
    lessonIds: number[],
    manager?: EntityManager,
  ): Promise<Array<{ lessonId: number; enrolmentId: number; totalPaid: number }>> {
    if (!lessonIds.length) return [];
    const em = manager ?? this.lessonDiscountRepository.manager;

    const rows = await em
      .createQueryBuilder()
      .select('lp.lessonId', 'lessonId')
      .addSelect('lp.enrolmentId', 'enrolmentId')
      .addSelect('COALESCE(SUM(lp.amount), 0)', 'totalPaid')
      .from('lesson_payment', 'lp')
      .innerJoin(
        'payment',
        'p',
        'p.id = lp.paymentId AND (p.isDeleted = 0 OR p.isDeleted IS NULL)',
      )
      .innerJoin('payment_method', 'pm', 'pm.id = p.payment_method_id')
      .where('lp.lessonId IN (:...lessonIds)', { lessonIds })
      .andWhere('lp.isDeleted = 0')
      .andWhere('pm.id != :creditUsed', { creditUsed: PaymentMethod.TYPE_CREDIT_USED })
      .groupBy('lp.lessonId')
      .addGroupBy('lp.enrolmentId')
      .getRawMany();

    return rows.map((r) => ({
      lessonId: Number(r.lessonId),
      enrolmentId: Number(r.enrolmentId),
      totalPaid: Number(r.totalPaid || 0),
    }));
  }

  /**
   * Get customer IDs by enrolment IDs.
   * Used to determine which customers need balance updates after discount changes.
   * 
   * @param enrolmentIds - Array of enrolment IDs
   * @param manager - Optional EntityManager for transactions
   * @returns Array of unique customer IDs
   */
  async getCustomerIdsByEnrolmentIds(
    enrolmentIds: number[],
    manager?: EntityManager,
  ): Promise<number[]> {
    if (!enrolmentIds.length) return [];
    
    const em = manager ?? this.lessonDiscountRepository.manager;

    const rows = await em
      .createQueryBuilder()
      .select('DISTINCT student.customer_id', 'customerId')
      .from('enrolment', 'enrolment')
      .innerJoin('student', 'student', 'student.id = enrolment.studentId')
      .where('enrolment.id IN (:...enrolmentIds)', { enrolmentIds })
      .getRawMany();

    return rows.map((r) => Number(r.customerId));
  }

  /**
   * Get lesson payments for a specific lesson and enrolment.
   * Excludes credit-used payments (PaymentMethod.TYPE_CREDIT_USED).
   * Used to unwind excess credits when discount increases.
   * 
   * @param lessonId - Lesson ID
   * @param enrolmentId - Enrolment ID
   * @param manager - Optional EntityManager for transactions
   * @returns Array of lesson payment records with id, amount, paymentId
   */
  async getLessonPaymentsForUnwind(
    lessonId: number,
    enrolmentId: number,
    manager?: EntityManager,
  ): Promise<Array<{ id: number; amount: number; paymentId: number }>> {
    const em = manager ?? this.lessonDiscountRepository.manager;

    const rows = await em
      .createQueryBuilder()
      .select('lp.id', 'id')
      .addSelect('lp.amount', 'amount')
      .addSelect('lp.paymentId', 'paymentId')
      .from('lesson_payment', 'lp')
      .innerJoin('payment', 'p', 'p.id = lp.paymentId')
      .where('lp.lessonId = :lessonId', { lessonId })
      .andWhere('lp.enrolmentId = :enrolmentId', { enrolmentId })
      .andWhere('lp.isDeleted = 0')
      .andWhere('p.isDeleted = 0')
      .andWhere('p.payment_method_id != :creditUsedMethod', {
        creditUsedMethod: PaymentMethod.TYPE_CREDIT_USED,
      })
      .orderBy('lp.id', 'ASC')
      .getRawMany();

    return rows.map((r) => ({
      id: Number(r.id),
      amount: parseFloat(r.amount || '0') || 0,
      paymentId: Number(r.paymentId),
    }));
  }

  /**
   * Soft delete a lesson payment by ID.
   * 
   * @param lessonPaymentId - Lesson payment ID to soft delete
   * @param manager - Optional EntityManager for transactions
   */
  async softDeleteLessonPayment(
    lessonPaymentId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const em = manager ?? this.lessonDiscountRepository.manager;
    
    await em
      .createQueryBuilder()
      .update('lesson_payment')
      .set({ isDeleted: 1 })
      .where('id = :id', { id: lessonPaymentId })
      .execute();
  }

  /**
   * Update lesson payment amount.
   * 
   * @param lessonPaymentId - Lesson payment ID
   * @param newAmount - New amount value
   * @param manager - Optional EntityManager for transactions
   */
  async updateLessonPaymentAmount(
    lessonPaymentId: number,
    newAmount: number,
    manager?: EntityManager,
  ): Promise<void> {
    const em = manager ?? this.lessonDiscountRepository.manager;
    
    await em
      .createQueryBuilder()
      .update('lesson_payment')
      .set({ amount: newAmount })
      .where('id = :id', { id: lessonPaymentId })
      .execute();
  }

  /**
   * Recalculate payment balances after lesson payments are modified.
   * This is critical for credit to appear in customer account.
   * 
   * Payment balance = payment.amount - SUM(lesson_payment.amount) - SUM(invoice_payment.amount)
   * 
   * @param paymentIds - Array of payment IDs to recalculate
   * @param manager - Optional EntityManager for transactions
   */
  async recalculatePaymentBalances(
    paymentIds: number[],
    manager?: EntityManager,
  ): Promise<void> {
    if (!paymentIds.length) return;

    const em = manager ?? this.lessonDiscountRepository.manager;

    for (const paymentId of paymentIds) {
      // Get the payment details
      const payment = await em
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
      const lessonPaymentsResult = await em
        .createQueryBuilder()
        .select('COALESCE(SUM(lp.amount), 0)', 'total')
        .from('lesson_payment', 'lp')
        .where('lp.paymentId = :paymentId', { paymentId })
        .andWhere('lp.isDeleted = 0')
        .getRawOne();

      const lessonPaymentsTotal = parseFloat(lessonPaymentsResult?.total || '0') || 0;

      // Calculate total applied to invoices (non-deleted invoice_payments)
      const invoicePaymentsResult = await em
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
        2,
      );

      // Update payment balance
      await em
        .createQueryBuilder()
        .update('payment')
        .set({ balance: newBalance })
        .where('id = :paymentId', { paymentId })
        .execute();
    }
  }
}
