import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Lesson } from '../entities/lesson.entity';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';
import { InvoiceItemLesson } from '../../invoice/entities/invoice-item-lesson.entity';
import { InvoiceLineItemDiscount } from '../../invoice/entities/invoice-line-item-discount.entity';
import { Payment } from '../../payment/entities/payment.entity';
import { InvoicePayment } from '../../invoice/entities/invoice-payment.entity';
import { LessonPayment } from '../entities/lesson-payment.entity';
import { CreditUsage } from '../../payment/entities/credit-usage.entity';
import { Item } from '../../item/entities/item.entity';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { ItemTypeEnum } from '../../invoice/enums/item-type.enum';
import { getCurrentESTDate } from '../../utils/date-utils';
import { RoundingUtils } from '../../utils/rounding.utils';
import {
  resolveLessonPaymentRoyaltySnapshot,
  resolveRoyaltySnapshot,
} from '../../utils/royality/royalty-calculation.util';

export interface CreateInvoiceData {
  userId: number;
  locationId: number;
  invoiceNumber: number;
  date: Date;
}

export interface CreateLineItemData {
  invoiceId: number;
  itemId: number;
  unit: number;
  amount: number;
  description: string;
  cost: number;
  rate: number;
  netTotal: number;
  taxType: string;
  taxRate: number;
  taxStatus: string;
  taxCode: string;
}

export interface CreateDiscountData {
  invoiceLineItemId: number;
  value: number;
  valueType: number;
  type: number;
}

export interface CreditTransferData {
  fromLessonId: number;
  invoiceId: number;
  invoiceNumber: number;
  invoiceUserId: number;
  enrolmentId: number;
  userId: number;
  amount: number;
}

interface ItemTaxData {
  taxTypeName: string;
  taxCodeRate: number;
  taxCodeCode: string;
  taxStatusName: string;
}


/**
 * Data access for private lesson invoice operations.
 */
@Injectable()
export class PrivateLessonInvoiceRepository {
  async findLessonsForInvoice(
    locationId: number,
    lessonIds: number[],
    manager: EntityManager,
  ): Promise<Lesson[]> {
    const repo = manager.getRepository(Lesson);

    return repo
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.course', 'course')
      .leftJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('course.enrolments', 'courseEnrolments')
      .leftJoinAndSelect('courseEnrolments.student', 'courseStudent')
      .leftJoinAndSelect('courseStudent.user', 'courseUser')
      .leftJoinAndSelect('courseUser.profile', 'courseUserProfile')
      .leftJoinAndSelect('courseUser.userLocation', 'courseUserLocation')
      .leftJoinAndSelect('lesson.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'teacherProfile')
      .leftJoinAndSelect('lesson.privateLesson', 'privateLesson')
      .leftJoinAndSelect('lesson.discounts', 'discounts')
      .leftJoinAndSelect('lesson.usedLessonSplits', 'usedLessonSplits')
      .leftJoinAndSelect('usedLessonSplits.lesson', 'splitLesson')
      .where('lesson.id IN (:...lessonIds)', { lessonIds })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status != :canceled', {
        canceled: 4,
      }) // LessonStatusEnum.CANCELED
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.isDeleted = :courseDeleted', { courseDeleted: false })
      .getMany();
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
        'ili.invoice_id = invoice.id AND ili.isDeleted = 0 AND ili.item_type_id = :itemType',
        { itemType: ItemTypeEnum.TYPE_PRIVATE_LESSON },
      )
      .innerJoin('invoice_item_lesson', 'iil', 'iil.invoiceLineItemId = ili.id')
      .where('iil.lessonId = :lessonId', { lessonId })
      .andWhere('invoice.isDeleted = false')
      .andWhere('invoice.type = :type', { type: Invoice.TYPE_INVOICE })
      .getOne();
    return result ?? null;
  }

  async getNextInvoiceNumber(
    locationId: number,
    type: number,
    manager: EntityManager,
  ): Promise<number> {
    const last = await manager
      .createQueryBuilder(Invoice, 'invoice')
      .where('invoice.location_id = :locationId', { locationId })
      .andWhere('invoice.type = :type', { type })
      .orderBy('invoice.id', 'DESC')
      .getOne();
    return last ? last.invoiceNumber + 1 : 1;
  }

  async findLessonItem(manager: EntityManager): Promise<Item> {
    const item = await manager.findOne(Item, {
      where: { code: 'LESSON', isDeleted: false },
    });
    if (!item) {
      throw new Error('Lesson item (code=LESSON) not found');
    }
    return item;
  }

  async getTaxDataForItem(
    taxStatusId: number,
    manager: EntityManager,
  ): Promise<ItemTaxData | null> {
    const result = await manager
      .createQueryBuilder()
      .select('ts.name', 'taxStatusName')
      .addSelect('tt.name', 'taxTypeName')
      .addSelect('tc.rate', 'taxCodeRate')
      .addSelect('tc.code', 'taxCodeCode')
      .from('tax_status', 'ts')
      .innerJoin('tax_type_tax_status_assoc', 'ttsa', 'ttsa.tax_status_id = ts.id')
      .innerJoin('tax_type', 'tt', 'tt.id = ttsa.tax_type_id')
      .innerJoin('tax_code', 'tc', 'tc.tax_type_id = tt.id')
      .where('ts.id = :taxStatusId', { taxStatusId })
      .getRawOne();

    if (!result) {
      return null;
    }

    return {
      taxTypeName: result.taxTypeName,
      taxCodeRate: parseFloat(String(result.taxCodeRate)) || 0,
      taxCodeCode: result.taxCodeCode,
      taxStatusName: result.taxStatusName,
    };
  }

  async getLegacySplitAmount(
    lessonId: number,
    manager: EntityManager,
  ): Promise<number> {
    const DEFAULT_EXPLODE_DURATION_SEC = 900;

    const rootRow = await manager
      .createQueryBuilder()
      .select('lh.lessonId', 'rootLessonId')
      .from('lesson_hierarchy', 'lh')
      .where('lh.childLessonId = :lessonId', { lessonId })
      .orderBy('lh.depth', 'DESC')
      .addOrderBy('lh.lessonId', 'ASC')
      .limit(1)
      .getRawOne();

    const rootLessonId = rootRow?.rootLessonId
      ? Number(rootRow.rootLessonId)
      : lessonId;

    const durationRow = await manager
      .createQueryBuilder()
      .select('TIME_TO_SEC(lesson.duration)', 'durationSec')
      .from('lesson', 'lesson')
      .where('lesson.id = :rootLessonId', { rootLessonId })
      .andWhere('lesson.isDeleted = 0')
      .getRawOne();

    const durationSec = Number(durationRow?.durationSec ?? 0);
    if (durationSec <= 0) {
      return 0;
    }

    const splitCount = durationSec / DEFAULT_EXPLODE_DURATION_SEC;
    if (splitCount <= 0) {
      return 0;
    }

    const lineItemRow = await manager
      .createQueryBuilder()
      .select('COALESCE(ili.netTotal, 0) + COALESCE(ili.tax_rate, 0)', 'itemTotal')
      .from('payment_cycle_lesson', 'pcl')
      .innerJoin(
        'invoice_item_payment_cycle_lesson',
        'iipcl',
        'iipcl.paymentCycleLessonId = pcl.id',
      )
      .innerJoin('invoice_line_item', 'ili', 'ili.id = iipcl.invoiceLineItemId')
      .innerJoin('invoice', 'inv', 'inv.id = ili.invoice_id')
      .where('pcl.lessonId = :rootLessonId', { rootLessonId })
      .andWhere('pcl.isDeleted = 0')
      .andWhere('ili.isDeleted = 0')
      .andWhere('ili.item_type_id = :lineItemType', {
        lineItemType: ItemTypeEnum.TYPE_PAYMENT_CYCLE_PRIVATE_LESSON,
      })
      .andWhere('inv.isDeleted = 0')
      .andWhere('inv.type = :invoiceType', {
        invoiceType: Invoice.TYPE_PRO_FORMA_INVOICE,
      })
      .orderBy('inv.id', 'ASC')
      .addOrderBy('ili.id', 'ASC')
      .limit(1)
      .getRawOne();

    const itemTotal = Number(lineItemRow?.itemTotal ?? 0);
    if (itemTotal <= 0) {
      return 0;
    }

    return itemTotal / splitCount;
  }

  async createInvoice(
    data: CreateInvoiceData,
    manager: EntityManager,
    loggedInUserId: number,
  ): Promise<Invoice> {
    const now = getCurrentESTDate();
    const transactionResult = await manager
      .createQueryBuilder()
      .insert()
      .into('transaction')
      .values({
        createdOn: now,
        updatedOn: now,
        createdByUserId: loggedInUserId,
        updatedByUserId: loggedInUserId,
      })
      .execute();

    let transactionId: number;
    if (transactionResult.identifiers?.[0]?.id) {
      transactionId = transactionResult.identifiers[0].id;
    } else if (transactionResult.raw?.insertId) {
      transactionId = transactionResult.raw.insertId;
    } else if (transactionResult.generatedMaps?.[0]?.id) {
      transactionId = transactionResult.generatedMaps[0].id;
    } else {
      throw new Error('Could not get transaction ID from insert result');
    }

    const invoice = manager.create(Invoice, {
      transactionId,
      userId: data.userId,
      locationId: data.locationId,
      invoiceNumber: data.invoiceNumber,
      date: data.date,
      type: Invoice.TYPE_INVOICE,
      subTotal: 0,
      tax: 0,
      total: 0,
      balance: 0,
      status: Invoice.STATUS_OWING,
      isSent: false,
      isDeleted: false,
      isTaxAdjusted: 0,
      isCanceled: false,
      isPosted: 0,
      isVoid: 0,
      paidStatus: 0,
      totalCopy: 0,
      createdUserId: loggedInUserId,
      updatedUserId: loggedInUserId,
      createdOn: now,
      updatedOn: now,
    });
    await manager.save(Invoice, invoice);
    return invoice;
  }

  async createInvoiceLineItem(
    data: CreateLineItemData,
    manager: EntityManager,
  ): Promise<InvoiceLineItem> {
    const invoice = await manager.findOneOrFail(Invoice, {
      where: { id: data.invoiceId },
    });
    const royaltySnapshot = await resolveRoyaltySnapshot(
      manager,
      invoice.locationId,
      data.itemId,
      0,
    );
    const lineItem = manager.create(InvoiceLineItem, {
      invoiceId: data.invoiceId,
      itemId: data.itemId,
      itemTypeId: ItemTypeEnum.TYPE_PRIVATE_LESSON,
      unit: data.unit,
      amount: data.amount,
      description: data.description,
      royaltyFree: 0,
      royaltyCategoryId: royaltySnapshot.categoryId || null,
      royaltyRateApplied: royaltySnapshot.rate,
      advertisementRateApplied: royaltySnapshot.advertisementRate,
      taxType: data.taxType,
      taxRate: data.taxRate,
      taxStatus: data.taxStatus,
      taxCode: data.taxCode,
      code: 'PRIVATE LESSON',
      cost: data.cost,
      rate: data.rate,
      isDeleted: false,
      netTotal: data.netTotal,
    });
    await manager.save(InvoiceLineItem, lineItem);
    return lineItem;
  }

  async createInvoiceItemLesson(
    invoiceLineItemId: number,
    lessonId: number,
    manager: EntityManager,
  ): Promise<void> {
    const invoiceItemLesson = manager.create(InvoiceItemLesson, {
      invoiceLineItemId,
      lessonId,
    });
    await manager.save(InvoiceItemLesson, invoiceItemLesson);
  }

  async createLineItemDiscounts(
    discounts: CreateDiscountData[],
    manager: EntityManager,
  ): Promise<void> {
    for (const d of discounts) {
      const disc = manager.create(InvoiceLineItemDiscount, {
        invoiceLineItemId: d.invoiceLineItemId,
        value: d.value,
        valueType: d.valueType,
        type: d.type,
      });
      await manager.save(InvoiceLineItemDiscount, disc);
    }
  }

  async updateLineItemTotals(
    invoiceLineItemId: number,
    netTotal: number,
    taxRate: number,
    manager: EntityManager,
  ): Promise<void> {
    const lineItem = await manager.findOne(InvoiceLineItem, {
      where: { id: invoiceLineItemId },
    });
    if (lineItem) {
      lineItem.netTotal = netTotal;
      lineItem.taxRate = taxRate;
      await manager.save(InvoiceLineItem, lineItem);
    }
  }

  async updateInvoiceTotals(
    invoiceId: number,
    subTotal: number,
    tax: number,
    total: number,
    balance: number,
    manager: EntityManager,
  ): Promise<void> {
    const invoice = await manager.findOne(Invoice, { where: { id: invoiceId } });
    if (invoice) {
      invoice.subTotal = subTotal;
      invoice.tax = tax;
      invoice.total = total;
      invoice.balance = balance;
      await manager.save(Invoice, invoice);
    }
  }

  async saveCreditTransfer(
    data: CreditTransferData,
    manager: EntityManager,
    loggedInUserId: number,
  ): Promise<void> {
    const now = getCurrentESTDate();
    const transferAmount = RoundingUtils.roundDecimal(data.amount, 2);
    if (transferAmount < 0.01) return;

    const creditPaymentTransactionId = await this.createTransactionId(
      manager,
      loggedInUserId,
    );

    const creditPayment = manager.create(Payment, {
      transactionId: creditPaymentTransactionId,
      reference: `L-${data.fromLessonId.toString().padStart(6, '0')}`,
      userId: data.userId,
      amount: transferAmount,
      balance: transferAmount,
      paymentMethodId: PaymentMethod.TYPE_CREDIT_APPLIED,
      isDeleted: 0,
      date: now,
      notes: '',
      createdByUserId: loggedInUserId,
      updatedByUserId: loggedInUserId,
      createdOn: now,
      updatedOn: now,
    });
    await manager.save(Payment, creditPayment);

    const invoicePayment = manager.create(InvoicePayment, {
      invoiceId: data.invoiceId,
      paymentId: creditPayment.id,
      amount: Number(creditPayment.amount),
      isDeleted: 0,
      date: now,
      createdByUserId: loggedInUserId,
      updatedByUserId: loggedInUserId,
      createdOn: now,
      updatedOn: now,
    });
    await manager.save(InvoicePayment, invoicePayment);
    await this.recalculatePaymentBalance(creditPayment.id, manager);

    const debitPaymentTransactionId = await this.createTransactionId(
      manager,
      loggedInUserId,
    );

    const debitPayment = manager.create(Payment, {
      transactionId: debitPaymentTransactionId,
      reference: `I-${data.invoiceNumber.toString().padStart(5, '0')}`,
      userId: data.userId,
      amount: -Math.abs(transferAmount),
      balance: -Math.abs(transferAmount),
      paymentMethodId: PaymentMethod.TYPE_CREDIT_USED,
      isDeleted: 0,
      date: now,
      notes: '',
      createdByUserId: loggedInUserId,
      updatedByUserId: loggedInUserId,
      createdOn: now,
      updatedOn: now,
    });
    await manager.save(Payment, debitPayment);

    const royaltySnapshot = await resolveLessonPaymentRoyaltySnapshot(
      manager,
      data.fromLessonId,
    );
    const lessonPayment = manager.create(LessonPayment, {
      lessonId: data.fromLessonId,
      paymentId: debitPayment.id,
      enrolmentId: data.enrolmentId,
      amount: Number(debitPayment.amount),
      royaltyCategoryId: royaltySnapshot.categoryId,
      royaltyRateApplied: royaltySnapshot.rate,
      advertisementRateApplied: royaltySnapshot.advertisementRate,
      isDeleted: 0,
      date: now,
      createdByUserId: loggedInUserId,
      updatedByUserId: loggedInUserId,
      createdOn: now,
      updatedOn: now,
    });
    await manager.save(LessonPayment, lessonPayment);
    await this.recalculatePaymentBalance(debitPayment.id, manager);

    const creditUsage = manager.create(CreditUsage, {
      creditPaymentId: creditPayment.id,
      debitPaymentId: debitPayment.id,
    });
    await manager.save(CreditUsage, creditUsage);
    await this.recalculateInvoiceBalanceStatus(data.invoiceId, manager);
  }

  private async recalculatePaymentBalance(
    paymentId: number,
    manager: EntityManager,
  ): Promise<void> {
    const payment = await manager.findOne(Payment, { where: { id: paymentId } });
    if (!payment) {
      return;
    }

    const invoicePaymentResult = await manager
      .createQueryBuilder()
      .select('COALESCE(SUM(ip.amount), 0)', 'total')
      .from('invoice_payment', 'ip')
      .where('ip.payment_id = :paymentId', { paymentId })
      .andWhere('ip.isDeleted = 0')
      .getRawOne();
    const lessonPaymentResult = await manager
      .createQueryBuilder()
      .select('COALESCE(SUM(lp.amount), 0)', 'total')
      .from('lesson_payment', 'lp')
      .where('lp.paymentId = :paymentId', { paymentId })
      .andWhere('lp.isDeleted = 0')
      .getRawOne();
    payment.balance = RoundingUtils.calculatePaymentBalance(
      payment.amount,
      invoicePaymentResult?.total ?? 0,
      lessonPaymentResult?.total ?? 0,
    );
    await manager.save(Payment, payment);
  }

  private async recalculateInvoiceBalanceStatus(
    invoiceId: number,
    manager: EntityManager,
  ): Promise<Invoice | null> {
    const invoice = await manager.findOne(Invoice, { where: { id: invoiceId } });
    if (!invoice) {
      return null;
    }

    const invoicePaymentResult = await manager
      .createQueryBuilder()
      .select('COALESCE(SUM(ip.amount), 0)', 'total')
      .from('invoice_payment', 'ip')
      .innerJoin('payment', 'p', 'p.id = ip.payment_id AND p.isDeleted = 0')
      .where('ip.invoice_id = :invoiceId', { invoiceId })
      .andWhere('ip.isDeleted = 0')
      .getRawOne();
    const balance = RoundingUtils.calculateBalance(
      invoice.total,
      invoicePaymentResult?.total ?? 0,
      4,
    );

    invoice.balance = balance;
    const roundedBalance = RoundingUtils.roundDecimal(balance, 2);
    if (roundedBalance > 0.09) {
      invoice.status = Invoice.STATUS_OWING;
    } else if (roundedBalance < -0.09) {
      invoice.status = Invoice.STATUS_CREDIT;
    } else {
      invoice.status = Invoice.STATUS_PAID;
    }
    await manager.save(Invoice, invoice);
    return invoice;
  }

  private async createTransactionId(
    manager: EntityManager,
    loggedInUserId: number,
  ): Promise<number> {
    const now = getCurrentESTDate();
    const transactionResult = await manager
      .createQueryBuilder()
      .insert()
      .into('transaction')
      .values({
        createdOn: now,
        updatedOn: now,
        createdByUserId: loggedInUserId,
        updatedByUserId: loggedInUserId,
      })
      .execute();

    const transactionId =
      transactionResult.identifiers?.[0]?.id ??
      transactionResult.raw?.insertId ??
      transactionResult.generatedMaps?.[0]?.id;

    if (!transactionId) {
      throw new Error('Could not get transaction ID from insert result');
    }
    return Number(transactionId);
  }
}
