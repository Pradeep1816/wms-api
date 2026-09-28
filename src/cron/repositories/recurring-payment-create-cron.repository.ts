import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Location } from '../../location/entities/location.entity';
import { CustomerRecurringPayment } from '../../recurring-payment/entities/customer-recurring-payment.entity';
import { Payment } from '../../payment/entities/payment.entity';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { LessonPayment } from '../../lesson/entities/lesson-payment.entity';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { GroupLesson } from '../../lesson/entities/group-lesson.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonDiscount } from '../../lesson/entities/lesson-discount.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { ProgramTypeEnum } from '../../program/enums/program-type';
import { RecurringPayment } from '../../recurring-payment/entities/recurring-payment.entity';
import { addMonthsNoOverflow, getCurrentESTDate } from '../../utils/date-utils';
import { resolveLessonPaymentRoyaltySnapshot } from '../../utils/royality/royalty-calculation.util';
import { RoundingUtils } from '../../utils/rounding.utils';

export interface RecurringPaymentCreateCronLocation {
  id: number;
  name: string;
  slug: string;
}

export interface RecurringPaymentCreateCandidate {
  id: number;
  customerId: number;
  customerName: string | null;
  amount: number;
  paymentMethodId: number;
  paymentFrequencyId: number;
  paymentDay: number;
  expiryDate: string;
  nextEntryDay: string;
}

export interface RecurringPaymentLessonCandidate {
  id: number;
  enrolmentId: number;
  isPrivate: boolean;
  netPrice: number;
  creditApplied: number;
  owingAmount: number;
}

export interface RecurringPaymentCreateProcessResult {
  paymentCreated: boolean;
  paymentId: number | null;
  recurringPaymentId: number | null;
  lessonsPaid: number;
  lessonPaymentsCreated: number;
  amountApplied: number;
  remainingPaymentAmount: number;
}

interface LessonPricingRow {
  id: number;
  enrolmentId: number;
  programType: number;
  programRate: number;
  duration: string;
  tax: number;
  creditApplied: number;
  privateLessonTotal: number | null;
}

interface LessonOwingRow {
  id: number;
  enrolmentId: number;
  programType: number;
  creditApplied: number;
  privateLessonId: number | null;
  privateLessonBalance: number;
  privateLessonTotal: number;
}

interface LessonDiscountRow {
  lessonId: number;
  enrolmentId: number | null;
  type: number;
  valueType: number;
  value: number;
}

@Injectable()
export class RecurringPaymentCreateCronRepository {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(CustomerRecurringPayment)
    private readonly customerRecurringPaymentRepository: Repository<CustomerRecurringPayment>,
  ) {}

  async getCronEnabledLocations(): Promise<RecurringPaymentCreateCronLocation[]> {
    return this.locationRepository
      .createQueryBuilder('location')
      .select([
        'location.id AS id',
        'location.name AS name',
        'location.slug AS slug',
      ])
      .where('location.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('location.isEnabledCron = :isEnabledCron', { isEnabledCron: true })
      .orderBy('location.id', 'ASC')
      .getRawMany<RecurringPaymentCreateCronLocation>();
  }

  async getDueRecurringPayments(
    locationId: number,
    currentDate: string,
  ): Promise<RecurringPaymentCreateCandidate[]> {
    const rows = await this.customerRecurringPaymentRepository
      .createQueryBuilder('customerRecurringPayment')
      .innerJoin(
        'customerRecurringPayment.customer',
        'customer',
        'customer.isDeleted = :customerIsDeleted',
        { customerIsDeleted: false },
      )
      .innerJoin(
        'customer.userLocation',
        'userLocation',
        'userLocation.locationId = :locationId',
        { locationId },
      )
      .leftJoin('customer.profile', 'profile')
      .select([
        'customerRecurringPayment.id AS id',
        'customerRecurringPayment.customerId AS customerId',
        'customerRecurringPayment.amount AS amount',
        'customerRecurringPayment.paymentMethodId AS paymentMethodId',
        'customerRecurringPayment.paymentFrequencyId AS paymentFrequencyId',
        'customerRecurringPayment.paymentDay AS paymentDay',
        'customerRecurringPayment.expiryDate AS expiryDate',
        'customerRecurringPayment.nextEntryDay AS nextEntryDay',
        "TRIM(CONCAT(COALESCE(profile.firstname, ''), ' ', COALESCE(profile.lastname, ''))) AS customerName",
      ])
      .where('customerRecurringPayment.isDeleted = :isDeleted', {
        isDeleted: false,
      })
      .andWhere('DATE(customerRecurringPayment.nextEntryDay) = :currentDate', {
        currentDate,
      })
      .andWhere('DATE(customerRecurringPayment.expiryDate) >= :currentDate', {
        currentDate,
      })
      .andWhere(
        'customerRecurringPayment.isRecurringPaymentEnabled = :isRecurringPaymentEnabled',
        { isRecurringPaymentEnabled: true },
      )
      .andWhere('customerRecurringPayment.amount > :minimumAmount', {
        minimumAmount: 0,
      })
      .andWhere('DATE(customerRecurringPayment.startDate) <= :currentDate', {
        currentDate,
      })
      .orderBy('customerRecurringPayment.id', 'ASC')
      .getRawMany<{
        id: string | number;
        customerId: string | number;
        customerName: string | null;
        amount: string | number;
        paymentMethodId: string | number;
        paymentFrequencyId: string | number;
        paymentDay: string | number;
        expiryDate: string;
        nextEntryDay: string;
      }>();

    return rows
      .map((row) => ({
        id: Number(row.id),
        customerId: Number(row.customerId),
        customerName: row.customerName || null,
        amount: Number(row.amount),
        paymentMethodId: Number(row.paymentMethodId),
        paymentFrequencyId: Number(row.paymentFrequencyId),
        paymentDay: Number(row.paymentDay),
        expiryDate: this.toDateKey(row.expiryDate),
        nextEntryDay: this.toDateKey(row.nextEntryDay),
      }))
      .filter((row) => Number.isFinite(row.id) && Number.isFinite(row.customerId));
  }

  async processRecurringPayment(
    recurringPayment: RecurringPaymentCreateCandidate,
    currentDate: string,
    nextPaymentDate: string,
    startDate: string,
    endDate: string,
    userId: number,
    manager: EntityManager,
  ): Promise<RecurringPaymentCreateProcessResult> {
    const previousRecordedPayment = await this.hasRecordedPayment(
      recurringPayment.id,
      startDate,
      endDate,
      manager,
    );

    if (previousRecordedPayment || recurringPayment.expiryDate < nextPaymentDate) {
      return {
        paymentCreated: false,
        paymentId: null,
        recurringPaymentId: null,
        lessonsPaid: 0,
        lessonPaymentsCreated: 0,
        amountApplied: 0,
        remainingPaymentAmount: recurringPayment.amount,
      };
    }

    const now = getCurrentESTDate();
    const transactionId = await this.createTransaction(userId, manager);
    const payment = manager.create(Payment, {
      transactionId,
      amount: recurringPayment.amount,
      balance: recurringPayment.amount,
      date: this.toDate(nextPaymentDate),
      userId: recurringPayment.customerId,
      paymentMethodId: recurringPayment.paymentMethodId,
      reference: '',
      notes: '',
      isDeleted: 0,
      createdOn: now,
      updatedOn: now,
      createdByUserId: userId,
      updatedByUserId: userId,
    });
    const savedPayment = await manager.save(Payment, payment);

    const recurringPaymentModel = manager.create(RecurringPayment, {
      paymentId: savedPayment.id,
      customerRecurringPaymentId: recurringPayment.id,
      date: currentDate,
      createdOn: now,
      updatedOn: now,
      createdByUserId: userId,
      updatedByUserId: userId,
    });
    const savedRecurringPayment = await manager.save(
      RecurringPayment,
      recurringPaymentModel,
    );

    const nextEntryDay = addMonthsNoOverflow(
      recurringPayment.nextEntryDay,
      recurringPayment.paymentFrequencyId,
    );
    const recurringPaymentEntity = await manager.getRepository(CustomerRecurringPayment).findOne({
      where: { id: recurringPayment.id },
    });
    if (!recurringPaymentEntity) {
      throw new Error(`Customer recurring payment ${recurringPayment.id} not found`);
    }

    recurringPaymentEntity.nextEntryDay = nextEntryDay;
    recurringPaymentEntity.updatedOn = now;
    recurringPaymentEntity.updatedByUserId = userId;
    await manager.save(CustomerRecurringPayment, recurringPaymentEntity);

    const enrolmentIds = await this.getRecurringPaymentEnrolmentIds(
      recurringPayment.id,
      manager,
    );
    let paymentAmount = recurringPayment.amount;
    let amountApplied = 0;
    let lessonsPaid = 0;
    let lessonPaymentsCreated = 0;

    for (const enrolmentId of enrolmentIds) {
      if (paymentAmount <= 0) {
        break;
      }

      const lessonsToPay = await this.getLessonsToPay(
        enrolmentId,
        nextPaymentDate,
        manager,
      );

      for (const lesson of lessonsToPay) {
        if (paymentAmount <= 0) {
          break;
        }

        const amount = Math.min(paymentAmount, this.roundToTwo(lesson.owingAmount));
        if (this.roundToTwo(amount) <= 0) {
          continue;
        }

        const royaltySnapshot = await resolveLessonPaymentRoyaltySnapshot(manager, lesson.id);
        const lessonPayment = manager.create(LessonPayment, {
          enrolmentId,
          paymentId: savedPayment.id,
          lessonId: lesson.id,
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
        await manager.save(LessonPayment, lessonPayment);

        paymentAmount = this.roundToTwo(paymentAmount - amount);
        amountApplied = this.roundToTwo(amountApplied + amount);
        lessonsPaid += 1;
        lessonPaymentsCreated += 1;

        await this.recalculateLessonBalance(lesson.id, enrolmentId, manager);
      }
    }

    await this.recalculatePaymentBalance(savedPayment.id, manager);

    return {
      paymentCreated: true,
      paymentId: savedPayment.id,
      recurringPaymentId: savedRecurringPayment.id,
      lessonsPaid,
      lessonPaymentsCreated,
      amountApplied,
      remainingPaymentAmount: paymentAmount,
    };
  }

  private async hasRecordedPayment(
    customerRecurringPaymentId: number,
    startDate: string,
    endDate: string,
    manager: EntityManager,
  ): Promise<boolean> {
    const count = await manager
      .createQueryBuilder(RecurringPayment, 'recurringPayment')
      .where(
        'recurringPayment.customerRecurringPaymentId = :customerRecurringPaymentId',
        { customerRecurringPaymentId },
      )
      .andWhere('recurringPayment.date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .getCount();

    return count > 0;
  }

  private async getRecurringPaymentEnrolmentIds(
    customerRecurringPaymentId: number,
    manager: EntityManager,
  ): Promise<number[]> {
    const rows = await manager
      .createQueryBuilder()
      .select('crpe.enrolmentId', 'enrolmentId')
      .from('customer_recurring_payment_enrolment', 'crpe')
      .innerJoin(
        'enrolment',
        'enrolment',
        'enrolment.id = crpe.enrolmentId AND enrolment.isDeleted = 0',
      )
      .where('crpe.customerRecurringPaymentId = :customerRecurringPaymentId', {
        customerRecurringPaymentId,
      })
      .andWhere('crpe.isDeleted = :isDeleted', { isDeleted: false })
      .orderBy('crpe.id', 'ASC')
      .getRawMany<{ enrolmentId: string | number }>();

    return rows
      .map((row) => Number(row.enrolmentId))
      .filter((enrolmentId) => Number.isFinite(enrolmentId));
  }

  /**
   * Recurring payment is private-only. Allocate from `private_lesson.balance`
   * so ghost lessons with no owing row are skipped (SMW-1626).
   */
  private async getLessonsToPay(
    enrolmentId: number,
    paymentDate: string,
    manager: EntityManager,
  ): Promise<RecurringPaymentLessonCandidate[]> {
    const invoicedLessonsSubquery = manager
      .createQueryBuilder()
      .subQuery()
      .select('1')
      .from('invoice_item_lesson', 'iil')
      .innerJoin(
        'invoice_line_item',
        'ili',
        'ili.id = iil.invoiceLineItemId AND ili.isDeleted = 0',
      )
      .innerJoin(
        'invoice',
        'invoice',
        'invoice.id = ili.invoice_id AND invoice.isDeleted = 0 AND invoice.type = :invoiceType',
      )
      .where('iil.lessonId = lesson.id')
      .getQuery();

    const rows = await manager
      .createQueryBuilder()
      .select('lesson.id', 'id')
      .addSelect('program.type', 'programType')
      .addSelect(
        `COALESCE(SUM(CASE WHEN payment.payment_method_id != :creditUsedPaymentMethodId THEN lessonPayment.amount ELSE 0 END), 0)`,
        'creditApplied',
      )
      .addSelect('MAX(privateLesson.id)', 'privateLessonId')
      .addSelect('MAX(privateLesson.balance)', 'privateLessonBalance')
      .addSelect('MAX(privateLesson.total)', 'privateLessonTotal')
      .from('lesson', 'lesson')
      .innerJoin('course', 'course', 'course.id = lesson.courseId AND course.isDeleted = 0')
      .innerJoin('program', 'program', 'program.id = course.programId')
      .innerJoin(
        'enrolment',
        'enrolment',
        'enrolment.courseId = course.id AND enrolment.id = :enrolmentId',
        { enrolmentId },
      )
      .innerJoin('private_lesson', 'privateLesson', 'privateLesson.lessonId = lesson.id')
      .leftJoin(
        'lesson_payment',
        'lessonPayment',
        'lessonPayment.lessonId = lesson.id AND lessonPayment.enrolmentId = :enrolmentId AND lessonPayment.isDeleted = 0',
        { enrolmentId },
      )
      .leftJoin(
        'payment',
        'payment',
        'payment.id = lessonPayment.paymentId AND (payment.isDeleted = 0 OR payment.isDeleted IS NULL)',
      )
      .where('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status != :cancelledStatus', {
        cancelledStatus: LessonStatusEnum.CANCELED,
      })
      .andWhere('lesson.dueDate <= :paymentDate', { paymentDate })
      .andWhere('program.type = :privateProgramType', {
        privateProgramType: ProgramTypeEnum.PRIVATE_PROGRAM,
      })
      .andWhere('privateLesson.balance > 0')
      .andWhere(`NOT EXISTS ${invoicedLessonsSubquery}`)
      .setParameter('invoiceType', Invoice.TYPE_INVOICE)
      .setParameter('creditUsedPaymentMethodId', PaymentMethod.TYPE_CREDIT_USED)
      .groupBy('lesson.id')
      .addGroupBy('program.type')
      .orderBy('lesson.dueDate', 'ASC')
      .addOrderBy('lesson.id', 'ASC')
      .getRawMany<{
        id: string | number;
        programType: string | number;
        creditApplied: string | number | null;
        privateLessonId: string | number | null;
        privateLessonBalance: string | number | null;
        privateLessonTotal: string | number | null;
      }>();

    return rows
      .map((row) =>
        this.toOwingCandidate({
          id: Number(row.id),
          enrolmentId,
          programType: Number(row.programType),
          creditApplied: Number(row.creditApplied ?? 0),
          privateLessonId: this.toOptionalId(row.privateLessonId),
          privateLessonBalance: Number(row.privateLessonBalance ?? 0),
          privateLessonTotal: Number(row.privateLessonTotal ?? 0),
        }),
      )
      .filter((row) => Number.isFinite(row.id) && row.owingAmount > 0);
  }

  private async recalculateLessonBalance(
    lessonId: number,
    enrolmentId: number,
    manager: EntityManager,
  ): Promise<void> {
    const pricingRow = await this.getLessonPricingRow(
      lessonId,
      enrolmentId,
      manager,
    );
    if (!pricingRow) {
      return;
    }

    const lessonDiscounts = await this.getLessonDiscounts([lessonId], manager);
    const candidate = this.toLessonCandidate(pricingRow, lessonDiscounts);
    const privateLesson = await manager
      .createQueryBuilder()
      .select('privateLesson.id', 'id')
      .from('private_lesson', 'privateLesson')
      .where('privateLesson.lessonId = :lessonId', { lessonId })
      .getRawOne<{ id: string | number }>();

    if (privateLesson) {
      await manager
        .createQueryBuilder()
        .update('private_lesson')
        .set({ total: candidate.netPrice, balance: candidate.owingAmount })
        .where('id = :id', { id: Number(privateLesson.id) })
        .execute();
      return;
    }

    const groupLesson = await manager
      .createQueryBuilder()
      .select('groupLesson.id', 'id')
      .from('group_lesson', 'groupLesson')
      .where('groupLesson.lessonId = :lessonId', { lessonId })
      .andWhere('groupLesson.enrolmentId = :enrolmentId', { enrolmentId })
      .andWhere('groupLesson.isDeleted = 0')
      .getRawOne<{ id: string | number }>();

    if (groupLesson) {
      await manager.update(
        GroupLesson,
        { id: Number(groupLesson.id) },
        {
          total: candidate.netPrice,
          balance: candidate.owingAmount,
          paidStatus: this.getPaidStatus(candidate.owingAmount),
          updatedOn: getCurrentESTDate(),
        },
      );
    }
  }

  private async getLessonPricingRow(
    lessonId: number,
    enrolmentId: number,
    manager: EntityManager,
  ): Promise<LessonPricingRow | null> {
    const row = await manager
      .createQueryBuilder()
      .select('lesson.id', 'id')
      .addSelect('program.type', 'programType')
      .addSelect('lesson.programRate', 'programRate')
      .addSelect('lesson.duration', 'duration')
      .addSelect('lesson.tax', 'tax')
      .addSelect('privateLesson.total', 'privateLessonTotal')
      .from('lesson', 'lesson')
      .innerJoin('course', 'course', 'course.id = lesson.courseId AND course.isDeleted = 0')
      .innerJoin('program', 'program', 'program.id = course.programId')
      .leftJoin('private_lesson', 'privateLesson', 'privateLesson.lessonId = lesson.id')
      .where('lesson.id = :lessonId', { lessonId })
      .getRawOne<{
        id: string | number;
        programType: string | number;
        programRate: string | number;
        duration: string;
        tax: string | number;
        privateLessonTotal: string | number | null;
      }>();

    if (!row) {
      return null;
    }

    return {
      id: Number(row.id),
      enrolmentId,
      programType: Number(row.programType),
      programRate: Number(row.programRate),
      duration: row.duration,
      tax: Number(row.tax),
      creditApplied: await this.getCreditAppliedAmount(lessonId, enrolmentId, manager),
      privateLessonTotal:
        row.privateLessonTotal === null || row.privateLessonTotal === undefined
          ? null
          : Number(row.privateLessonTotal),
    };
  }

  private async getLessonDiscounts(
    lessonIds: number[],
    manager: EntityManager,
  ): Promise<Map<number, LessonDiscountRow[]>> {
    const validLessonIds = lessonIds.filter((lessonId) => Number.isFinite(lessonId));
    if (!validLessonIds.length) {
      return new Map();
    }

    const rows = await manager
      .createQueryBuilder()
      .select('lessonDiscount.lessonId', 'lessonId')
      .addSelect('lessonDiscount.enrolmentId', 'enrolmentId')
      .addSelect('lessonDiscount.type', 'type')
      .addSelect('lessonDiscount.valueType', 'valueType')
      .addSelect('lessonDiscount.value', 'value')
      .from('lesson_discount', 'lessonDiscount')
      .where('lessonDiscount.lessonId IN (:...lessonIds)', {
        lessonIds: validLessonIds,
      })
      .getRawMany<{
        lessonId: string | number;
        enrolmentId: string | number | null;
        type: string | number;
        valueType: string | number;
        value: string | number | null;
      }>();

    const discountsByLessonId = new Map<number, LessonDiscountRow[]>();
    for (const row of rows) {
      const lessonId = Number(row.lessonId);
      if (!discountsByLessonId.has(lessonId)) {
        discountsByLessonId.set(lessonId, []);
      }
      discountsByLessonId.get(lessonId)!.push({
        lessonId,
        enrolmentId:
          row.enrolmentId === null || row.enrolmentId === undefined
            ? null
            : Number(row.enrolmentId),
        type: Number(row.type),
        valueType: Number(row.valueType),
        value: Number(row.value ?? 0),
      });
    }

    return discountsByLessonId;
  }

  private toOwingCandidate(row: LessonOwingRow): RecurringPaymentLessonCandidate {
    const isPrivate = row.programType === ProgramTypeEnum.PRIVATE_PROGRAM;
    const hasPrivateOwing = isPrivate && row.privateLessonId != null;

    return {
      id: row.id,
      enrolmentId: row.enrolmentId,
      isPrivate,
      netPrice: this.roundToTwo(hasPrivateOwing ? row.privateLessonTotal : 0),
      creditApplied: this.roundToTwo(row.creditApplied),
      owingAmount: this.roundToTwo(hasPrivateOwing ? row.privateLessonBalance : 0),
    };
  }

  private toLessonCandidate(
    row: LessonPricingRow,
    discountsByLessonId: Map<number, LessonDiscountRow[]>,
  ): RecurringPaymentLessonCandidate {
    const isPrivate = row.programType === ProgramTypeEnum.PRIVATE_PROGRAM;
    const discounts = discountsByLessonId.get(row.id) ?? [];
    const netPrice = isPrivate
      ? this.resolvePrivateLessonNetPrice(row, discounts)
      : this.calculateGroupLessonNetPrice(row, discounts);
    const creditApplied = this.roundToTwo(row.creditApplied);

    return {
      id: row.id,
      enrolmentId: row.enrolmentId,
      isPrivate,
      netPrice,
      creditApplied,
      owingAmount: this.roundToTwo(netPrice - creditApplied),
    };
  }

  private resolvePrivateLessonNetPrice(
    row: LessonPricingRow,
    discounts: LessonDiscountRow[],
  ): number {
    if (row.privateLessonTotal !== null && row.privateLessonTotal !== undefined) {
      return this.roundToTwo(row.privateLessonTotal);
    }

    // Legacy fallback: if the stored private_lesson row is missing, rebuild the
    // amount from the source lesson fields so older data still processes.
    return this.calculatePrivateLessonNetPrice(row, discounts);
  }

  private calculatePrivateLessonNetPrice(
    row: LessonPricingRow,
    discounts: LessonDiscountRow[],
  ): number {
    const lesson = Object.assign(new Lesson(), {
      programRate: row.programRate,
      duration: row.duration,
      tax: row.tax,
      discounts: discounts.map((discountRow) =>
        Object.assign(new LessonDiscount(), discountRow),
      ),
    });

    return lesson.getNetPrice();
  }

  private calculateGroupLessonNetPrice(
    row: LessonPricingRow,
    discounts: LessonDiscountRow[],
  ): number {
    const grossPrice = this.roundToTwo(Number(row.programRate));
    const groupDiscount = discounts.find(
      (discountRow) =>
        discountRow.type === LessonDiscount.TYPE_GROUP &&
        discountRow.enrolmentId === row.enrolmentId,
    );
    let discount = 0;

    if (groupDiscount) {
      if (groupDiscount.valueType) {
        discount += (groupDiscount.value / 100) * grossPrice;
      } else {
        discount += grossPrice < 0 ? 0 : groupDiscount.value;
      }
    }

    return this.roundToTwo(grossPrice - discount + Number(row.tax || 0));
  }

  private async getCreditAppliedAmount(
    lessonId: number,
    enrolmentId: number,
    manager: EntityManager,
  ): Promise<number> {
    const row = await manager
      .createQueryBuilder()
      .select('COALESCE(SUM(lessonPayment.amount), 0)', 'total')
      .from('lesson_payment', 'lessonPayment')
      .innerJoin(
        'payment',
        'payment',
        'payment.id = lessonPayment.paymentId AND (payment.isDeleted = 0 OR payment.isDeleted IS NULL) AND payment.payment_method_id != :creditUsedPaymentMethodId',
        { creditUsedPaymentMethodId: PaymentMethod.TYPE_CREDIT_USED },
      )
      .where('lessonPayment.lessonId = :lessonId', { lessonId })
      .andWhere('lessonPayment.enrolmentId = :enrolmentId', { enrolmentId })
      .andWhere('lessonPayment.isDeleted = 0')
      .getRawOne<{ total: string | number }>();

    return this.roundToTwo(Number(row?.total ?? 0));
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
      .select('COALESCE(SUM(invoicePayment.amount), 0)', 'total')
      .from('invoice_payment', 'invoicePayment')
      .where('invoicePayment.payment_id = :paymentId', { paymentId })
      .andWhere('invoicePayment.isDeleted = 0')
      .getRawOne<{ total: string | number }>();

    const lessonPaymentResult = await manager
      .createQueryBuilder()
      .select('COALESCE(SUM(lessonPayment.amount), 0)', 'total')
      .from('lesson_payment', 'lessonPayment')
      .where('lessonPayment.paymentId = :paymentId', { paymentId })
      .andWhere('lessonPayment.isDeleted = 0')
      .getRawOne<{ total: string | number }>();

    payment.balance = RoundingUtils.calculatePaymentBalance(
      payment.amount,
      invoicePaymentResult?.total ?? 0,
      lessonPaymentResult?.total ?? 0,
    );
    payment.updatedOn = getCurrentESTDate();
    await manager.save(Payment, payment);
  }

  private async createTransaction(
    userId: number,
    manager: EntityManager,
  ): Promise<number> {
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

  private getPaidStatus(balance: number): number {
    if (balance > 0.09) {
      return GroupLesson.STATUS_OWING;
    }
    if (balance < -0.09) {
      return GroupLesson.STATUS_CREDIT;
    }
    return GroupLesson.STATUS_PAID;
  }

  private roundToTwo(value: number): number {
    return RoundingUtils.roundDecimal(value, 2);
  }

  private toDate(value: string): Date {
    return new Date(`${value}T00:00:00Z`);
  }

  private toDateKey(value: string | Date): string {
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }
    return String(value).slice(0, 10);
  }

  private toOptionalId(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
}
