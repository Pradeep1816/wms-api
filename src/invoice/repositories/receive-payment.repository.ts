import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Payment } from '../../payment/entities/payment.entity';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceLineItem } from '../entities/invoice-line-item.entity';
import { InvoicePayment } from '../entities/invoice-payment.entity';
import { LessonPayment } from '../../lesson/entities/lesson-payment.entity';
import { CreditUsage } from '../../payment/entities/credit-usage.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { PrivateLesson } from '../../lesson/entities/private-lesson.entity';
import { GroupLesson } from '../../lesson/entities/group-lesson.entity';
import { PaymentMethodType } from '../../payment/enums/payment-method-type.enum';
import { getCurrentESTDate } from '../../utils/date-utils';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { Item } from '../../item/entities/item.entity';
import {
  resolveLessonPaymentRoyaltySnapshot,
  resolveRoyaltySnapshot,
} from '../../utils/royality/royalty-calculation.util';
import { ItemTypeEnum } from '../enums/item-type.enum';
import { RoundingUtils } from '../../utils/rounding.utils';

export interface InvoiceTargetRow {
  id: number;
  invoiceNumber: number;
  balance: number;
}

export interface PrivateLessonTargetRow {
  lessonId: number;
  enrolmentId: number;
  balance: number;
}

export interface GroupLessonTargetRow {
  id: number;
  lessonId: number;
  enrolmentId: number;
  balance: number;
}

export interface InvoiceCreditSourceRow {
  id: number;
  invoiceNumber: number;
  balance: number;
}

export interface PaymentCreditSourceRow {
  id: number;
  reference: string | null;
  balance: number;
}

interface CreatePaymentInput {
  transactionId: number;
  userId: number;
  paymentMethodId: number;
  amount: number;
  balance: number;
  date: Date;
  reference: string | null;
  notes: string | null;
  createdByUserId: number;
  updatedByUserId: number;
}

interface TaxDataRow {
  taxTypeName: string;
  taxCodeRate: number;
  taxCodeCode: string;
  taxStatusName: string;
}

@Injectable()
export class ReceivePaymentRepository {
  private setAuditTrailUserId(manager: EntityManager, userId: number): void {
    const queryRunner = manager.queryRunner as { data?: Record<string, unknown> } | undefined;
    if (!queryRunner) {
      return;
    }

    queryRunner.data = {
      ...(queryRunner.data ?? {}),
      currentUserId: userId,
    };
  }

  async createTransaction(userId: number, manager: EntityManager): Promise<number> {
    const now = getCurrentESTDate();
    const result = await manager
      .createQueryBuilder()
      .insert()
      .into('transaction')
      .values({
        createdOn: now,
        updatedOn: now,
        createdByUserId: userId,
        updatedByUserId: userId,
      })
      .execute();

    const transactionId =
      result.identifiers?.[0]?.id ??
      result.raw?.insertId ??
      result.generatedMaps?.[0]?.id;

    if (!transactionId) {
      throw new Error('Could not get transaction ID from insert result');
    }

    return Number(transactionId);
  }

  async createPayment(input: CreatePaymentInput, manager: EntityManager): Promise<Payment> {
    const now = getCurrentESTDate();
    this.setAuditTrailUserId(manager, input.createdByUserId);
    const payment = manager.create(Payment, {
      transactionId: input.transactionId,
      userId: input.userId,
      paymentMethodId: input.paymentMethodId,
      amount: input.amount,
      date: input.date,
      reference: input.reference ?? '',
      notes: input.notes ?? '',
      isDeleted: 0,
      createdOn: now,
      updatedOn: now,
      createdByUserId: input.createdByUserId,
      updatedByUserId: input.updatedByUserId,
      balance: input.balance,
    });

    const savedPayment = await manager.save(Payment, payment);

    return savedPayment;
  }

  async createInvoicePayment(
    invoiceId: number,
    paymentId: number,
    amount: number,
    userId: number,
    manager: EntityManager,
  ): Promise<InvoicePayment> {
    const now = getCurrentESTDate();
    this.setAuditTrailUserId(manager, userId);
    const invoicePayment = manager.create(InvoicePayment, {
      invoiceId,
      paymentId,
      amount,
      isDeleted: 0,
      date: now,
      createdOn: now,
      updatedOn: now,
      createdByUserId: userId,
      updatedByUserId: userId,
    });

    const savedInvoicePayment = await manager.save(InvoicePayment, invoicePayment);

    return savedInvoicePayment;
  }

  async createLessonPayment(
    lessonId: number,
    paymentId: number,
    enrolmentId: number,
    amount: number,
    userId: number,
    manager: EntityManager,
  ): Promise<LessonPayment> {
    const now = getCurrentESTDate();
    this.setAuditTrailUserId(manager, userId);
    const royaltySnapshot = await resolveLessonPaymentRoyaltySnapshot(manager, lessonId);
    const lessonPayment = manager.create(LessonPayment, {
      lessonId,
      paymentId,
      enrolmentId,
      amount,
      royaltyCategoryId: royaltySnapshot.categoryId,
      royaltyRateApplied: royaltySnapshot.rate,
      advertisementRateApplied: royaltySnapshot.advertisementRate,
      isDeleted: 0,
      date: now,
      createdOn: now,
      updatedOn: now,
      createdByUserId: userId,
      updatedByUserId: userId,
    });

    const savedLessonPayment = await manager.save(LessonPayment, lessonPayment);

    return savedLessonPayment;
  }

  async createCreditUsage(
    creditPaymentId: number,
    debitPaymentId: number,
    manager: EntityManager,
  ): Promise<CreditUsage> {
    const usage = manager.create(CreditUsage, {
      creditPaymentId,
      debitPaymentId,
    });
    return manager.save(CreditUsage, usage);
  }

  async getNextInvoiceNumber(
    locationId: number,
    type: number,
    manager: EntityManager,
  ): Promise<number> {
    await manager.query('SELECT id FROM location WHERE id=? FOR UPDATE', [locationId]);
    const last = await manager
      .createQueryBuilder(Invoice, 'invoice')
      .where('invoice.location_id = :locationId', { locationId })
      .andWhere('invoice.type = :type', { type })
      // A locking read sees commits made after this transaction's first read.
      // The location lock alone does not refresh MySQL REPEATABLE READ snapshots.
      .setLock('pessimistic_write')
      .orderBy('invoice.id', 'DESC')
      .getOne();

    return last ? last.invoiceNumber + 1 : 1;
  }

  async createPaymentCreditInvoiceWithLineItem(
    customerId: number,
    locationId: number,
    currentUserId: number,
    manager: EntityManager,
  ): Promise<Invoice> {
    this.setAuditTrailUserId(manager, currentUserId);
    const transactionId = await this.createTransaction(currentUserId, manager);
    const invoiceNumber = await this.getNextInvoiceNumber(
      locationId,
      Invoice.TYPE_INVOICE,
      manager,
    );

    const invoice = manager.create(Invoice, {
      transactionId,
      userId: customerId,
      locationId,
      invoiceNumber,
      date: getCurrentESTDate(),
      type: Invoice.TYPE_INVOICE,
      subTotal: 0,
      tax: 0,
      total: 0,
      balance: 0,
      status: Invoice.STATUS_PAID,
      isSent: false,
      isDeleted: false,
      isTaxAdjusted: 0,
      isCanceled: false,
      isPosted: 0,
      isVoid: 0,
      paidStatus: 0,
      totalCopy: 0,
      createdUserId: currentUserId,
      updatedUserId: currentUserId,
    });

    const savedInvoice = await manager.save(Invoice, invoice);

    const paymentCreditItem = await this.findPaymentCreditItem(manager);
    if (!paymentCreditItem) {
      throw new Error('PAYMENT CREDIT item not found');
    }

    const taxData = await this.getTaxDataForItem(paymentCreditItem.taxStatusId, manager);
    if (!taxData) {
      throw new Error(`Tax data not found for payment credit item ${paymentCreditItem.id}`);
    }
    const royaltySnapshot = await resolveRoyaltySnapshot(
      manager,
      locationId,
      paymentCreditItem,
    );

    const lineItem = manager.create(InvoiceLineItem, {
      invoiceId: savedInvoice.id,
      itemId: paymentCreditItem.id,
      itemTypeId: ItemTypeEnum.TYPE_PAYMENT_CREDIT,
      description: paymentCreditItem.description,
      unit: 1,
      amount: 0,
      code: paymentCreditItem.code,
      cost: 0,
      rate: 0,
      taxType: taxData.taxTypeName,
      taxRate: 0,
      taxCode: taxData.taxCodeCode,
      taxStatus: taxData.taxStatusName,
      netTotal: 0,
      royaltyFree: paymentCreditItem.royaltyFree,
      royaltyCategoryId: royaltySnapshot.categoryId || null,
      royaltyRateApplied: royaltySnapshot.rate,
      advertisementRateApplied: royaltySnapshot.advertisementRate,
      isDeleted: false,
    });
    await manager.save(InvoiceLineItem, lineItem);

    return savedInvoice;
  }

  private async findPaymentCreditItem(manager: EntityManager): Promise<Item | null> {
    return manager
      .getRepository(Item)
      .createQueryBuilder('item')
      .where('item.code = :code', { code: 'PAYMENT CREDIT' })
      .andWhere('item.isDeleted = false')
      .orderBy('item.id', 'ASC')
      .getOne();
  }

  private async getTaxDataForItem(
    taxStatusId: number,
    manager: EntityManager,
  ): Promise<TaxDataRow | null> {
    const row = await manager
      .createQueryBuilder()
      .select('tt.name', 'taxTypeName')
      .addSelect('tc.rate', 'taxCodeRate')
      .addSelect('tc.code', 'taxCodeCode')
      .addSelect('ts.name', 'taxStatusName')
      .from('tax_status', 'ts')
      .innerJoin('tax_type_tax_status_assoc', 'ttsa', 'ttsa.tax_status_id = ts.id')
      .innerJoin('tax_type', 'tt', 'tt.id = ttsa.tax_type_id')
      .innerJoin('tax_code', 'tc', 'tc.tax_type_id = tt.id')
      .where('ts.id = :taxStatusId', { taxStatusId })
      .getRawOne<TaxDataRow>();

    if (!row) {
      return null;
    }

    return {
      taxTypeName: row.taxTypeName,
      taxCodeRate: Number(row.taxCodeRate || 0),
      taxCodeCode: row.taxCodeCode,
      taxStatusName: row.taxStatusName,
    };
  }

  async findInvoiceTargetsForCustomer(
    ids: number[],
    customerId: number,
    locationId: number,
    manager: EntityManager,
  ): Promise<Map<number, InvoiceTargetRow>> {
    if (ids.length === 0) {
      return new Map<number, InvoiceTargetRow>();
    }

    const rows = await manager
      .getRepository(Invoice)
      .createQueryBuilder('invoice')
      .select('invoice.id', 'id')
      .addSelect('invoice.invoiceNumber', 'invoiceNumber')
      .addSelect('invoice.balance', 'balance')
      .where('invoice.id IN (:...ids)', { ids })
      .andWhere('invoice.userId = :customerId', { customerId })
      .andWhere('invoice.locationId = :locationId', { locationId })
      .andWhere('invoice.isDeleted = false')
      .andWhere('invoice.isCanceled = false')
      .andWhere('invoice.type = :invoiceType', { invoiceType: Invoice.TYPE_INVOICE })
      .andWhere('invoice.isVoid = 0')
      .orderBy('invoice.id', 'ASC')
      .setLock('pessimistic_write')
      .getRawMany();

    const map = new Map<number, InvoiceTargetRow>();
    for (const row of rows) {
      map.set(Number(row.id), {
        id: Number(row.id),
        invoiceNumber: Number(row.invoiceNumber),
        balance: Number(row.balance || 0),
      });
    }
    return map;
  }

  async findPrivateLessonTargetsForCustomer(
    ids: number[],
    customerId: number,
    locationId: number,
    manager: EntityManager,
  ): Promise<Map<number, PrivateLessonTargetRow>> {
    if (ids.length === 0) {
      return new Map<number, PrivateLessonTargetRow>();
    }

    const rows = await manager
      .getRepository(Lesson)
      .createQueryBuilder('lesson')
      .innerJoin(PrivateLesson, 'privateLesson', 'privateLesson.lessonId = lesson.id')
      .innerJoin('lesson.course', 'course')
      .innerJoin('course.enrolments', 'enrolment', 'enrolment.isDeleted = false')
      .innerJoin('enrolment.student', 'student')
      .select('lesson.id', 'lessonId')
      .addSelect('enrolment.id', 'enrolmentId')
      .addSelect('privateLesson.balance', 'balance')
      .where('lesson.id IN (:...ids)', { ids })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('student.customerId = :customerId', { customerId })
      .andWhere('lesson.isDeleted = false')
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.status <> :cancelled', { cancelled: LessonStatusEnum.CANCELED })
      .orderBy('enrolment.id', 'ASC')
      .getRawMany();

    const map = new Map<number, PrivateLessonTargetRow>();
    for (const row of rows) {
      const lessonId = Number(row.lessonId);
      if (!map.has(lessonId)) {
        map.set(lessonId, {
          lessonId,
          enrolmentId: Number(row.enrolmentId),
          balance: Number(row.balance || 0),
        });
      }
    }
    return map;
  }

  async findGroupLessonTargetsForCustomer(
    ids: number[],
    customerId: number,
    locationId: number,
    manager: EntityManager,
  ): Promise<Map<number, GroupLessonTargetRow>> {
    if (ids.length === 0) {
      return new Map<number, GroupLessonTargetRow>();
    }

    const rows = await manager
      .getRepository(GroupLesson)
      .createQueryBuilder('groupLesson')
      .innerJoin('groupLesson.lesson', 'lesson')
      .innerJoin('lesson.course', 'course')
      .innerJoin('groupLesson.enrolment', 'enrolment')
      .innerJoin('enrolment.student', 'student')
      .select('groupLesson.id', 'id')
      .addSelect('groupLesson.lessonId', 'lessonId')
      .addSelect('groupLesson.enrolmentId', 'enrolmentId')
      .addSelect('groupLesson.balance', 'balance')
      .where('groupLesson.id IN (:...ids)', { ids })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('student.customerId = :customerId', { customerId })
      .andWhere('groupLesson.isDeleted = false')
      .andWhere('lesson.isDeleted = false')
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.status <> :cancelled', { cancelled: LessonStatusEnum.CANCELED })
      .andWhere('enrolment.isDeleted = false')
      .andWhere('enrolment.isConfirmed = true')
      .getRawMany();

    const map = new Map<number, GroupLessonTargetRow>();
    for (const row of rows) {
      map.set(Number(row.id), {
        id: Number(row.id),
        lessonId: Number(row.lessonId),
        enrolmentId: Number(row.enrolmentId),
        balance: Number(row.balance || 0),
      });
    }
    return map;
  }

  async findInvoiceCreditSourcesForCustomer(
    ids: number[],
    customerId: number,
    locationId: number,
    manager: EntityManager,
  ): Promise<Map<number, InvoiceCreditSourceRow>> {
    if (ids.length === 0) {
      return new Map<number, InvoiceCreditSourceRow>();
    }

    const rows = await manager
      .getRepository(Invoice)
      .createQueryBuilder('invoice')
      .select('invoice.id', 'id')
      .addSelect('invoice.invoiceNumber', 'invoiceNumber')
      .addSelect('invoice.balance', 'balance')
      .where('invoice.id IN (:...ids)', { ids })
      .andWhere('invoice.userId = :customerId', { customerId })
      .andWhere('invoice.locationId = :locationId', { locationId })
      .andWhere('invoice.isDeleted = false')
      .andWhere('invoice.isCanceled = false')
      .andWhere('invoice.type = :invoiceType', { invoiceType: Invoice.TYPE_INVOICE })
      .getRawMany();

    const map = new Map<number, InvoiceCreditSourceRow>();
    for (const row of rows) {
      map.set(Number(row.id), {
        id: Number(row.id),
        invoiceNumber: Number(row.invoiceNumber),
        balance: Number(row.balance || 0),
      });
    }
    return map;
  }

  async findPaymentCreditSourcesForCustomer(
    ids: number[],
    customerId: number,
    manager: EntityManager,
  ): Promise<Map<number, PaymentCreditSourceRow>> {
    if (ids.length === 0) {
      return new Map<number, PaymentCreditSourceRow>();
    }

    const rows = await manager
      .getRepository(Payment)
      .createQueryBuilder('payment')
      .select('payment.id', 'id')
      .addSelect('payment.reference', 'reference')
      .addSelect('payment.balance', 'balance')
      .where('payment.id IN (:...ids)', { ids })
      .andWhere('payment.userId = :customerId', { customerId })
      .andWhere('payment.isDeleted = false')
      .andWhere('ROUND(payment.balance, 2) > 0.09')
      .andWhere('payment.paymentMethodId NOT IN (:...excludedMethods)', {
        excludedMethods: [
          PaymentMethodType.CREDIT_USED,
          PaymentMethodType.CREDIT_APPLIED,
        ],
      })
      .getRawMany();

    const map = new Map<number, PaymentCreditSourceRow>();
    for (const row of rows) {
      map.set(Number(row.id), {
        id: Number(row.id),
        reference: row.reference || null,
        balance: Number(row.balance || 0),
      });
    }
    return map;
  }

  async recalculatePaymentBalance(
    paymentId: number,
    updatedUserId: number,
    manager: EntityManager,
  ): Promise<number> {
    this.setAuditTrailUserId(manager, updatedUserId);
    const payment = await manager.getRepository(Payment).findOne({ where: { id: paymentId } });
    if (!payment) {
      return 0;
    }

    const ipResult = await manager
      .getRepository(InvoicePayment)
      .createQueryBuilder('ip')
      .select('COALESCE(SUM(ip.amount), 0)', 'total')
      .where('ip.paymentId = :paymentId', { paymentId })
      .andWhere('ip.isDeleted = 0')
      .getRawOne();

    const lpResult = await manager
      .getRepository(LessonPayment)
      .createQueryBuilder('lp')
      .select('COALESCE(SUM(lp.amount), 0)', 'total')
      .where('lp.paymentId = :paymentId', { paymentId })
      .andWhere('lp.isDeleted = 0')
      .getRawOne();

    const nextBalance = RoundingUtils.calculatePaymentBalance(
      payment.amount,
      ipResult?.total || 0,
      lpResult?.total || 0,
    );
    const shouldPersist =
      Number(payment.balance || 0) !== Number(nextBalance || 0) ||
      Number(payment.updatedByUserId || 0) !== Number(updatedUserId || 0);

    if (!shouldPersist) {
      return Number(payment.balance || 0);
    }

    payment.balance = nextBalance;
    payment.updatedByUserId = updatedUserId;
    await manager.getRepository(Payment).save(payment);
    return Number(payment.balance);
  }

  async recalculateInvoiceBalance(
    invoiceId: number,
    updatedUserId: number,
    manager: EntityManager,
  ): Promise<void> {
    this.setAuditTrailUserId(manager, updatedUserId);
    const invoice = await manager.getRepository(Invoice).findOne({ where: { id: invoiceId } });
    if (!invoice) {
      return;
    }

    const paidResult = await manager
      .getRepository(InvoicePayment)
      .createQueryBuilder('ip')
      .select('COALESCE(SUM(ip.amount), 0)', 'total')
      .where('ip.invoiceId = :invoiceId', { invoiceId })
      .andWhere('ip.isDeleted = 0')
      .getRawOne();

    const paidAmount = Number(paidResult?.total || 0);
    const roundedTotal = RoundingUtils.roundHalfUp(Number(invoice.total || 0), 2);
    const roundedPaid = RoundingUtils.roundHalfUp(paidAmount, 2);
    const balance =
      roundedPaid === roundedTotal ? 0 : RoundingUtils.roundHalfUp(roundedTotal - roundedPaid, 2);

    let status = Invoice.STATUS_PAID;
    if (roundedTotal > roundedPaid) {
      status = Invoice.STATUS_OWING;
    } else if (roundedTotal < roundedPaid) {
      status = Invoice.STATUS_CREDIT;
    }

    const shouldPersist =
      Number(invoice.balance || 0) !== Number(balance || 0) ||
      Number(invoice.status || 0) !== Number(status || 0) ||
      Number(invoice.updatedUserId || 0) !== Number(updatedUserId || 0);

    if (!shouldPersist) {
      return;
    }

    invoice.balance = balance;
    invoice.status = status;
    invoice.updatedUserId = updatedUserId;
    await manager.getRepository(Invoice).save(invoice);
  }

  async recalculatePrivateLessonBalance(lessonId: number, manager: EntityManager): Promise<void> {
    const privateLessonRepo = manager.getRepository(PrivateLesson);
    const privateLesson = await privateLessonRepo.findOne({ where: { lessonId } });
    if (!privateLesson) {
      return;
    }

    const paidResult = await manager
      .getRepository(LessonPayment)
      .createQueryBuilder('lp')
      .select('COALESCE(SUM(lp.amount), 0)', 'total')
      .where('lp.lessonId = :lessonId', { lessonId })
      .andWhere('lp.isDeleted = 0')
      .getRawOne();

    privateLesson.balance = RoundingUtils.calculateBalance(
      privateLesson.total || 0,
      paidResult?.total || 0,
      2,
    );
    await privateLessonRepo.save(privateLesson);
  }

  async recalculateGroupLessonBalance(
    lessonId: number,
    enrolmentId: number,
    updatedByUserId: number,
    manager: EntityManager,
  ): Promise<void> {
    this.setAuditTrailUserId(manager, updatedByUserId);
    const groupLessonRepo = manager.getRepository(GroupLesson);
    const groupLesson = await groupLessonRepo.findOne({ where: { lessonId, enrolmentId } });
    if (!groupLesson) {
      return;
    }

    const paidResult = await manager
      .getRepository(LessonPayment)
      .createQueryBuilder('lp')
      .select('COALESCE(SUM(lp.amount), 0)', 'total')
      .where('lp.lessonId = :lessonId', { lessonId })
      .andWhere('lp.enrolmentId = :enrolmentId', { enrolmentId })
      .andWhere('lp.isDeleted = 0')
      .getRawOne();

    const balance = RoundingUtils.calculateBalance(
      groupLesson.total || 0,
      paidResult?.total || 0,
      2,
    );
    let paidStatus = GroupLesson.STATUS_PAID;
    if (balance > 0) {
      paidStatus = GroupLesson.STATUS_OWING;
    } else if (balance < 0) {
      paidStatus = GroupLesson.STATUS_CREDIT;
    }

    const shouldPersist =
      Number(groupLesson.balance || 0) !== Number(balance || 0) ||
      Number(groupLesson.paidStatus || 0) !== Number(paidStatus || 0) ||
      Number(groupLesson.updatedByUserId || 0) !== Number(updatedByUserId || 0);

    if (!shouldPersist) {
      return;
    }

    groupLesson.balance = balance;
    groupLesson.paidStatus = paidStatus;
    groupLesson.updatedByUserId = updatedByUserId;
    await groupLessonRepo.save(groupLesson);
  }
}
