import { allocatePosInvoiceTax } from '../../invoice/utils/pos-invoice-tax.util';
import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';
import { InvoicePayment } from '../../invoice/entities/invoice-payment.entity';
import { Item } from '../../item/entities/item.entity';
import { ItemCategory } from '../../item/entities/item-category.entity';
import { Course } from '../../course/entities/course.entity';
import { GroupLesson } from '../../lesson/entities/group-lesson.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonPayment } from '../../lesson/entities/lesson-payment.entity';
import { PrivateLesson } from '../../lesson/entities/private-lesson.entity';
import { calculateLessonPaymentRevenue } from '../../utils/royality/royalty-calculation.util';
import { RoyaltyTransactionSourceType } from '../enums/royalty-transaction.enum';

export interface AppliedRoyaltyPurpose {
  returnOriginalTax?: number;
  returnPreviousTax?: number;
  returnOriginalRevenue?: number;
  returnPreviousRevenue?: number;
  isPos?: boolean;
  key: string;
  sourceType: RoyaltyTransactionSourceType;
  itemCategoryId: number;
  categoryName: string;
  rateApplied: number;
  advertisementRateApplied?: number;
  paymentAmount: number;
  revenueAmount: number;
  taxAmount: number;
  royaltyFree: boolean;
}

interface InvoicePurposeRawRow {
  posPurposeSnapshot?: string | { amount: number; purposes: AppliedRoyaltyPurpose[] };
  isPos?: boolean | number;
  lineTax?: number;
  invoicePaymentId: string | number;
  invoiceId: string | number;
  appliedAmount: string | number;
  invoiceTotal: string | number;
  invoiceSubTotal: string | number;
  invoiceTax: string | number;
  lineItemId: string | number;
  lineNetTotal: string | number;
  itemCategoryId: string | number | null;
  categoryName: string | null;
  rateApplied: string | number | null;
  advertisementRateApplied?: number;
  royaltyFree: string | number | boolean;
}

interface LessonPurposeRawRow {
  lessonPaymentId: string | number;
  amount: string | number;
  itemCategoryId: string | number | null;
  categoryName: string | null;
  rateApplied: string | number | null;
  advertisementRateApplied?: number;
  lessonTotal: string | number;
  lessonTax: string | number;
  privateLessonTotal: string | number | null;
  groupLessonTotal: string | number | null;
}

@Injectable()
export class PaymentRoyaltyRecognitionRepository {
  async getAppliedPurposes(
    manager: EntityManager,
    paymentId: number,
    locationId: number,
  ): Promise<AppliedRoyaltyPurpose[]> {
    const [invoiceRows, lessonRows] = await Promise.all([
      this.getInvoiceRows(manager, paymentId, locationId),
      this.getLessonRows(manager, paymentId, locationId),
    ]);

    return this.groupPurposes([
      ...await this.mapSavedInvoiceRows(manager, invoiceRows),
      ...this.mapLessonRows(lessonRows),
    ]);
  }

  async getAllocationPurposes(
    manager: EntityManager,
    sourceType: RoyaltyTransactionSourceType,
    allocationId: number,
    locationId: number,
  ): Promise<AppliedRoyaltyPurpose[]> {
    if (sourceType === RoyaltyTransactionSourceType.INVOICE_PAYMENT) {
      return this.groupPurposes(
        await this.mapSavedInvoiceRows(manager,
          await this.getInvoiceRows(
            manager,
            undefined,
            locationId,
            allocationId,
          ),
        ),
      );
    }
    if (sourceType === RoyaltyTransactionSourceType.LESSON_PAYMENT) {
      return this.groupPurposes(
        this.mapLessonRows(
          await this.getLessonRows(
            manager,
            undefined,
            locationId,
            allocationId,
          ),
        ),
      );
    }
    return [];
  }

  private getInvoiceRows(
    manager: EntityManager,
    paymentId: number | undefined,
    locationId: number,
    invoicePaymentId?: number,
  ): Promise<InvoicePurposeRawRow[]> {
    const query = manager
      .getRepository(InvoicePayment)
      .createQueryBuilder('invoicePayment')
      .innerJoin(Invoice, 'invoice', 'invoice.id = invoicePayment.invoiceId')
      .innerJoin(
        InvoiceLineItem,
        'lineItem',
        'lineItem.invoiceId = invoice.id AND lineItem.isDeleted = 0',
      )
      .innerJoin(Item, 'item', 'item.id = lineItem.itemId')
      .leftJoin(
        ItemCategory,
        'category',
        'category.id = COALESCE(lineItem.royaltyCategoryId, item.itemCategoryId)',
      )
      .select('invoicePayment.id', 'invoicePaymentId')
      .addSelect('invoicePayment.posPurposeSnapshot', 'posPurposeSnapshot')
      .addSelect('invoice.id', 'invoiceId')
      .addSelect('invoicePayment.amount', 'appliedAmount')
      .addSelect('invoice.total', 'invoiceTotal')
      .addSelect('invoice.subTotal', 'invoiceSubTotal')
      .addSelect('invoice.tax', 'invoiceTax')
      .addSelect('lineItem.id', 'lineItemId')
      .addSelect('lineItem.netTotal', 'lineNetTotal')
      .addSelect(
        'COALESCE(lineItem.royaltyCategoryId, item.itemCategoryId, 0)',
        'itemCategoryId',
      )
      .addSelect("COALESCE(JSON_UNQUOTE(JSON_EXTRACT(lineItem.posSnapshot, '$.categoryName')), category.name, 'Uncategorized')", 'categoryName')
      .addSelect('lineItem.isPos', 'isPos')
      .addSelect('lineItem.taxRate', 'lineTax')
      .addSelect('COALESCE(lineItem.royaltyRateApplied, 0)', 'rateApplied')
      .addSelect(
        'COALESCE(lineItem.advertisementRateApplied, 0)',
        'advertisementRateApplied',
      )
      .addSelect('lineItem.royaltyFree', 'royaltyFree')
      .where('invoicePayment.isDeleted = 0')
      .andWhere('invoice.locationId = :locationId', { locationId })
      .andWhere('invoice.isDeleted = 0');
    if (paymentId !== undefined) {
      query.andWhere('invoicePayment.paymentId = :paymentId', { paymentId });
    }
    if (invoicePaymentId !== undefined) {
      query.andWhere('invoicePayment.id = :invoicePaymentId', {
        invoicePaymentId,
      });
    }
    return query.getRawMany<InvoicePurposeRawRow>();
  }

  private getLessonRows(
    manager: EntityManager,
    paymentId: number | undefined,
    locationId: number,
    lessonPaymentId?: number,
  ): Promise<LessonPurposeRawRow[]> {
    const query = manager
      .getRepository(LessonPayment)
      .createQueryBuilder('lessonPayment')
      .innerJoin(Lesson, 'lesson', 'lesson.id = lessonPayment.lessonId')
      .innerJoin(Course, 'course', 'course.id = lesson.courseId')
      .leftJoin(
        PrivateLesson,
        'privateLesson',
        'privateLesson.lessonId = lesson.id',
      )
      .leftJoin(
        GroupLesson,
        'groupLesson',
        'groupLesson.lessonId = lesson.id AND groupLesson.enrolmentId = lessonPayment.enrolmentId AND groupLesson.isDeleted = 0',
      )
      .leftJoin(
        ItemCategory,
        'category',
        'category.id = COALESCE(lessonPayment.royaltyCategoryId, 1)',
      )
      .select('lessonPayment.id', 'lessonPaymentId')
      .addSelect('lessonPayment.amount', 'amount')
      .addSelect(
        'COALESCE(lessonPayment.royaltyCategoryId, 1)',
        'itemCategoryId',
      )
      .addSelect("COALESCE(category.name, 'Lesson')", 'categoryName')
      .addSelect('COALESCE(lessonPayment.royaltyRateApplied, 0)', 'rateApplied')
      .addSelect(
        'COALESCE(lessonPayment.advertisementRateApplied, 0)',
        'advertisementRateApplied',
      )
      .addSelect('lesson.total', 'lessonTotal')
      .addSelect('lesson.tax', 'lessonTax')
      .addSelect('privateLesson.total', 'privateLessonTotal')
      .addSelect('groupLesson.total', 'groupLessonTotal')
      .where('lessonPayment.isDeleted = 0')
      .andWhere('course.locationId = :locationId', { locationId });
    if (paymentId !== undefined) {
      query.andWhere('lessonPayment.paymentId = :paymentId', { paymentId });
    }
    if (lessonPaymentId !== undefined) {
      query.andWhere('lessonPayment.id = :lessonPaymentId', {
        lessonPaymentId,
      });
    }
    return query.getRawMany<LessonPurposeRawRow>();
  }

  private async mapSavedInvoiceRows(manager: EntityManager, rows: InvoicePurposeRawRow[]): Promise<AppliedRoyaltyPurpose[]> {
    const grouped = new Map<number, InvoicePurposeRawRow[]>();
    for (const row of rows) grouped.set(Number(row.invoicePaymentId), [...(grouped.get(Number(row.invoicePaymentId)) || []), row]);
    const result: AppliedRoyaltyPurpose[] = [];
    for (const [id, invoiceRows] of grouped) {
      const first = invoiceRows[0];
      // Receive Payment settles cents. Allocate the same rounded invoice tax,
      // including a manual tax adjustment, before subtracting returned goods.
      if (invoiceRows.some(row => Boolean(Number(row.isPos)))) {
        const roundedTax = Math.round(Number(first.invoiceTax) * 100) / 100;
        const lineTaxes = allocatePosInvoiceTax(invoiceRows.map(row => ({ id: Number(row.lineItemId), net: Number(row.lineNetTotal), tax: Number(row.lineTax || 0) })), roundedTax);
        for (const row of invoiceRows) {
          row.lineTax = lineTaxes.get(Number(row.lineItemId)) || 0;
          row.invoiceTax = roundedTax;
          row.invoiceTotal = Math.round(Number(row.invoiceTotal) * 100) / 100;
        }
      }
      const saved = typeof first.posPurposeSnapshot === 'string' ? JSON.parse(first.posPurposeSnapshot) : first.posPurposeSnapshot;
      if (saved) {
        const ratio = Number(first.appliedAmount) / Number(saved.amount);
        result.push(...saved.purposes.map(purpose => ({ ...purpose,
          paymentAmount: purpose.paymentAmount * ratio, revenueAmount: purpose.revenueAmount * ratio, taxAmount: purpose.taxAmount * ratio,
        })));
        continue;
      }
      if (!invoiceRows.some(row => Boolean(Number(row.isPos)))) {
        result.push(...this.mapInvoiceRows(invoiceRows));
        continue;
      }
      // New payments after a return settle only remaining goods/lessons. Freeze
      // this split so subsequent returns do not rewrite earlier recognition.
      const returned = await manager.query(`SELECT r.returnedFromLineItemId AS id,
          SUM(r.netTotal) AS net, SUM(r.tax_rate) AS tax
        FROM invoice_line_item r INNER JOIN invoice credit ON credit.id=r.invoice_id
        WHERE r.returnedFromLineItemId IN (?) AND r.isDeleted=0 AND credit.isDeleted=0 AND credit.isVoid=0
        GROUP BY r.returnedFromLineItemId`, [invoiceRows.map(row => Number(row.lineItemId))]);
      const byLine = new Map<number, { net: number; tax: number }>(returned.map(row => [Number(row.id), { net: Number(row.net), tax: Number(row.tax) }]));
      const remaining = invoiceRows.map(row => {
        const credit = byLine.get(Number(row.lineItemId));
        return { ...row, lineNetTotal: Number(row.lineNetTotal) + (credit?.net || 0), lineTax: Number(row.lineTax || 0) + (credit?.tax || 0) };
      });
      const creditNet = returned.reduce((sum, row) => sum + Number(row.net), 0);
      const creditTax = returned.reduce((sum, row) => sum + Number(row.tax), 0);
      remaining.forEach(row => Object.assign(row, {
        invoiceTotal: Number(first.invoiceTotal) + creditNet + creditTax,
        invoiceSubTotal: Number(first.invoiceSubTotal) + creditNet,
        invoiceTax: Number(first.invoiceTax) + creditTax,
      }));
      const purposes = this.mapInvoiceRows(remaining);
      purposes.forEach((purpose, index) => {
        purpose.returnOriginalTax = Number(invoiceRows[index].lineTax || 0);
        purpose.returnPreviousTax = Math.max(0, -(byLine.get(Number(invoiceRows[index].lineItemId))?.tax || 0));
        purpose.returnOriginalRevenue = Number(invoiceRows[index].lineNetTotal);
        purpose.returnPreviousRevenue = Math.max(0, -(byLine.get(Number(invoiceRows[index].lineItemId))?.net || 0));
      });
      const snapshot = this.groupPurposes(purposes);
      if (manager.queryRunner?.isTransactionActive && Number(first.appliedAmount) !== 0) {
        await manager.query('UPDATE invoice_payment SET posPurposeSnapshot=? WHERE id=?', [JSON.stringify({ amount: Number(first.appliedAmount), purposes: snapshot }), id]);
      }
      result.push(...snapshot);
    }
    return result;
  }

  private mapInvoiceRows(
    rows: InvoicePurposeRawRow[],
  ): AppliedRoyaltyPurpose[] {
    const byInvoicePayment = new Map<number, InvoicePurposeRawRow[]>();
    for (const row of rows) {
      const id = Number(row.invoicePaymentId);
      byInvoicePayment.set(id, [...(byInvoicePayment.get(id) || []), row]);
    }

    const purposes: AppliedRoyaltyPurpose[] = [];
    for (const [invoicePaymentId, invoiceRows] of byInvoicePayment) {
      const first = invoiceRows[0];
      const appliedAmount = Number(first.appliedAmount);
      const invoiceTotal = Math.abs(Number(first.invoiceTotal));
      const invoiceSubTotal = Number(first.invoiceSubTotal);
      const invoiceTax = Number(first.invoiceTax);
      if (
        !Number.isFinite(appliedAmount) ||
        !Number.isFinite(invoiceTotal) ||
        invoiceTotal === 0
      ) {
        continue;
      }

      const hasPos = invoiceRows.some(row => Boolean(Number(row.isPos)));
      const storedTax = invoiceRows.reduce((sum, row) => sum + Number(row.lineTax || 0), 0);
      for (const row of invoiceRows) {
        const lineNetTotal = Number(row.lineNetTotal);
        const revenueAmount =
          (lineNetTotal * Math.abs(appliedAmount)) / invoiceTotal;
        const lineShare =
          invoiceSubTotal === 0 ? 0 : lineNetTotal / invoiceSubTotal;
        const taxAmount =
          ((invoiceTax * Math.abs(appliedAmount)) / invoiceTotal) *
          (hasPos && storedTax !== 0 ? Number(row.lineTax || 0) / storedTax : lineShare);
        const sign = Math.sign(appliedAmount) || 1;

        purposes.push({
          key: `invoice:${invoicePaymentId}:${Number(row.lineItemId)}`,
          sourceType: RoyaltyTransactionSourceType.INVOICE_PAYMENT,
          isPos: Boolean(Number(row.isPos)),
          itemCategoryId: Number(row.itemCategoryId || 0),
          categoryName: row.categoryName || 'Uncategorized',
          rateApplied: Number(row.rateApplied || 0),
          advertisementRateApplied: Number(row.advertisementRateApplied || 0),
          paymentAmount: sign * (Math.abs(revenueAmount) + Math.abs(taxAmount)),
          revenueAmount: sign * Math.abs(revenueAmount),
          taxAmount: sign * Math.abs(taxAmount),
          royaltyFree: Boolean(Number(row.royaltyFree)),
        });
      }
    }

    return purposes;
  }

  private mapLessonRows(rows: LessonPurposeRawRow[]): AppliedRoyaltyPurpose[] {
    return rows.map((row) => {
      const amount = Number(row.amount);
      const billingTotal =
        Math.abs(Number(row.groupLessonTotal)) ||
        Math.abs(Number(row.privateLessonTotal)) ||
        Math.abs(Number(row.lessonTotal));
      const revenueAmount = calculateLessonPaymentRevenue(
        amount,
        billingTotal,
        row.lessonTax,
      );

      return {
        key: `lesson:${Number(row.lessonPaymentId)}`,
        sourceType: RoyaltyTransactionSourceType.LESSON_PAYMENT,
        itemCategoryId: Number(
          row.itemCategoryId || ItemCategory.CATEGORY_LESSON,
        ),
        categoryName: row.categoryName || 'Lesson',
        rateApplied: Number(row.rateApplied || 0),
        advertisementRateApplied: Number(row.advertisementRateApplied || 0),
        paymentAmount: amount,
        revenueAmount,
        taxAmount: amount - revenueAmount,
        royaltyFree: false,
      };
    });
  }

  private groupPurposes(
    purposes: AppliedRoyaltyPurpose[],
  ): AppliedRoyaltyPurpose[] {
    const grouped = new Map<string, AppliedRoyaltyPurpose>();
    for (const purpose of purposes) {
      const groupKey = [
        purpose.sourceType,
        purpose.itemCategoryId,
        purpose.rateApplied,
        purpose.advertisementRateApplied ?? 0,
        Number(purpose.royaltyFree),
      ].join(':') + (purpose.isPos ? ':POS:' + purpose.categoryName : '');
      const existing = grouped.get(groupKey);
      if (!existing) {
        grouped.set(groupKey, { ...purpose, key: groupKey });
        continue;
      }
      existing.paymentAmount += purpose.paymentAmount;
      existing.revenueAmount += purpose.revenueAmount;
      existing.taxAmount += purpose.taxAmount;
      existing.returnOriginalTax = (existing.returnOriginalTax || 0) + (purpose.returnOriginalTax || 0);
      existing.returnPreviousTax = (existing.returnPreviousTax || 0) + (purpose.returnPreviousTax || 0);
      existing.returnOriginalRevenue = (existing.returnOriginalRevenue || 0) + (purpose.returnOriginalRevenue || 0);
      existing.returnPreviousRevenue = (existing.returnPreviousRevenue || 0) + (purpose.returnPreviousRevenue || 0);
    }
    return Array.from(grouped.values());
  }
}
