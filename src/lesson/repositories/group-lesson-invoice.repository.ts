import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { Lesson } from '../entities/lesson.entity';
import { LessonStatusEnum } from '../enums/lesson-status';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { Item } from '../../item/entities/item.entity';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';
import { ItemTypeEnum } from '../../invoice/enums/item-type.enum';
import { InvoiceItemLesson } from '../../invoice/entities/invoice-item-lesson.entity';
import { InvoiceItemEnrolment } from '../../invoice/entities/invoice-item-enrolment.entity';
import { LessonDiscount } from '../entities/lesson-discount.entity';
import { InvoiceLineItemDiscount } from '../../invoice/entities/invoice-line-item-discount.entity';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { Payment } from '../../payment/entities/payment.entity';
import { InvoicePayment } from '../../invoice/entities/invoice-payment.entity';
import { LessonPayment } from '../entities/lesson-payment.entity';
import { CreditUsage } from '../../payment/entities/credit-usage.entity';
import { Qualification } from '../../qualification/entities/qualification.entity';
import { CourseProgramRate } from '../../course/entities/course-program-rate.entity';
import { getCurrentESTDate } from '../../utils/date-utils';
import { LogRepository } from '../../log/repositories/log.repository';
import { LogObjectRepository } from '../../log/repositories/log-object.repository';
import { LogActivityRepository } from '../../log/repositories/log-activity.repository';
import { LogObjectType } from '../../log/enums/log-object-type.enum';
import { LogActivityType } from '../../log/enums/log-activity.enum';
import { LogLink } from '../../log/entities/log-link.entity';
import { LocationRepository } from '../../location/repositories/location.repository';
import { User } from '../../user/entities/user.entity';
import { RoundingUtils } from '../../utils/rounding.utils';
import {
  resolveLessonPaymentRoyaltySnapshot,
  resolveRoyaltySnapshot,
} from '../../utils/royality/royalty-calculation.util';

@Injectable()
export class GroupLessonInvoiceRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    private readonly logRepository: LogRepository,
    private readonly logObjectRepository: LogObjectRepository,
    private readonly logActivityRepository: LogActivityRepository,
    private readonly locationRepository: LocationRepository,
  ) {}

  async findLesson(
    locationId: number,
    lessonId: number,
  ): Promise<Lesson | null> {
    return this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.course', 'course')
      .leftJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('lesson.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'teacherProfile')
      .where('lesson.id = :lessonId', { lessonId })
      .andWhere('lesson.isDeleted = 0')
      .andWhere('lesson.isConfirmed = 1')
      .andWhere('course.locationId = :locationId', { locationId })
      .getOne();
  }

  async createGroupLessonInvoice(
    lesson: Lesson,
    lessonId: number,
    enrolmentId: number,
    loggedInUserId: number,
  ): Promise<{ invoiceId: number; invoiceNumber: string; alreadyExists: boolean }> {
    const currentDate = getCurrentESTDate();
    const canInvoice =
      lesson.status !== LessonStatusEnum.CANCELED &&
      (((new Date(lesson.date) <= currentDate) &&
        (lesson.status === LessonStatusEnum.SCHEDULED || lesson.status === LessonStatusEnum.RESCHEDULED)) ||
        lesson.status === LessonStatusEnum.EXPIRED ||
        !lesson.isPresent);

    if (!canInvoice) {
      throw new BadRequestException('Generate invoice against completed lesson only.');
    }

    const existingInvoice = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('invoice_item_lesson', 'iil', 'iil.lessonId = lesson.id')
      .innerJoin(
        'invoice_item_enrolment',
        'iie',
        'iie.invoiceLineItemId = iil.invoiceLineItemId AND iie.enrolmentId = :enrolmentId',
        { enrolmentId },
      )
      .innerJoin('invoice_line_item', 'ili', 'ili.id = iil.invoiceLineItemId AND ili.isDeleted = 0')
      .innerJoin('invoice', 'inv', 'inv.id = ili.invoice_id AND inv.isDeleted = 0 AND inv.type = 2')
      .select('inv.id', 'invoiceId')
      .addSelect('inv.invoiceNumber', 'invoiceNumber')
      .where('lesson.id = :lessonId', { lessonId })
      .orderBy('inv.id', 'DESC')
      .limit(1)
      .getRawOne();

    if (existingInvoice?.invoiceId) {
      return {
        invoiceId: Number(existingInvoice.invoiceId),
        invoiceNumber: `I-${String(existingInvoice.invoiceNumber).padStart(5, '0')}`,
        alreadyExists: true,
      };
    }

    const enrolment = await this.lessonRepository.manager.getRepository(Enrolment).findOne({
      where: { id: enrolmentId, courseId: lesson.courseId, isDeleted: 0 as any, isConfirmed: 1 as any },
      relations: ['student', 'student.user', 'student.user.profile', 'student.user.userLocation', 'course', 'course.program'],
    });

    if (!enrolment?.student?.user) {
      throw new BadRequestException('Invalid enrolment for this lesson');
    }

    return await this.createInvoiceForEnrolment(lesson, enrolment, loggedInUserId);
  }

  async createGroupLessonInvoicesForAllEnrolments(
    lesson: Lesson,
    lessonId: number,
    loggedInUserId: number,
  ): Promise<{ createdCount: number; alreadyExistsCount: number; totalEnrolments: number }> {
    const currentDate = getCurrentESTDate();
    const canInvoice =
      lesson.status !== LessonStatusEnum.CANCELED &&
      (((new Date(lesson.date) <= currentDate) &&
        (lesson.status === LessonStatusEnum.SCHEDULED || lesson.status === LessonStatusEnum.RESCHEDULED)) ||
        lesson.status === LessonStatusEnum.EXPIRED ||
        !lesson.isPresent);
    if (!canInvoice) {
      throw new BadRequestException('Generate invoice against completed lesson only.');
    }

    const enrolments = await this.lessonRepository.manager.getRepository(Enrolment).find({
      where: {
        courseId: lesson.courseId,
        isDeleted: 0 as any,
        isConfirmed: 1 as any,
      },
      relations: ['student', 'student.user', 'student.user.profile', 'student.user.userLocation', 'course', 'course.program'],
      order: { id: 'ASC' },
    });

    const existingRows = enrolments.length
      ? await this.lessonRepository
          .createQueryBuilder('lesson')
          .innerJoin('invoice_item_lesson', 'iil', 'iil.lessonId = lesson.id')
          .innerJoin('invoice_item_enrolment', 'iie', 'iie.invoiceLineItemId = iil.invoiceLineItemId')
          .innerJoin('invoice_line_item', 'ili', 'ili.id = iil.invoiceLineItemId AND ili.isDeleted = 0')
          .innerJoin('invoice', 'inv', 'inv.id = ili.invoice_id AND inv.isDeleted = 0 AND inv.type = 2')
          .select('iie.enrolmentId', 'enrolmentId')
          .addSelect('inv.id', 'invoiceId')
          .addSelect('inv.invoiceNumber', 'invoiceNumber')
          .where('lesson.id = :lessonId', { lessonId })
          .andWhere('iie.enrolmentId IN (:...enrolmentIds)', { enrolmentIds: enrolments.map((e) => e.id) })
          .getRawMany()
      : [];
    const existingByEnrolment = new Map<number, { invoiceId: number; invoiceNumber: number }>();
    for (const row of existingRows) {
      const enrolmentKey = Number(row.enrolmentId);
      if (!existingByEnrolment.has(enrolmentKey)) {
        existingByEnrolment.set(enrolmentKey, {
          invoiceId: Number(row.invoiceId),
          invoiceNumber: Number(row.invoiceNumber),
        });
      }
    }

    const item = await this.lessonRepository.manager.findOne(Item, {
      where: { code: 'LESSON', isDeleted: false },
    });
    if (!item) {
      throw new BadRequestException('Lesson item not found');
    }

    const courseProgramRate = await this.lessonRepository.manager
      .getRepository(CourseProgramRate)
      .createQueryBuilder('cpr')
      .where('cpr.courseId = :courseId', { courseId: lesson.courseId })
      .andWhere('DATE(:lessonDate) BETWEEN cpr.startDate AND cpr.endDate', { lessonDate: lesson.date })
      .orderBy('cpr.id', 'DESC')
      .getOne();

    let createdCount = 0;
    let alreadyExistsCount = 0;
    for (const enrolment of enrolments) {
      if (existingByEnrolment.has(enrolment.id)) {
        alreadyExistsCount += 1;
        continue;
      }
      await this.createInvoiceForEnrolment(
        lesson,
        enrolment,
        loggedInUserId,
        {
          item,
          courseProgramRate: courseProgramRate ?? null,
        },
      );
      createdCount += 1;
    }

    return {
      createdCount,
      alreadyExistsCount,
      totalEnrolments: enrolments.length,
    };
  }

  private async createInvoiceForEnrolment(
    lesson: Lesson,
    enrolment: Enrolment,
    loggedInUserId: number,
    preloaded?: {
      item?: Item;
      courseProgramRate?: CourseProgramRate | null;
    },
  ): Promise<{ invoiceId: number; invoiceNumber: string; alreadyExists: boolean }> {
    const customer = enrolment.student.user as any;
    const userLocation = Array.isArray(customer.userLocation)
      ? customer.userLocation[0]
      : customer.userLocation;
    const locationId = Number(userLocation?.locationId || userLocation?.location_id || 0);
    if (!locationId) {
      throw new BadRequestException('Customer location not found for invoice creation');
    }

    const result = await this.lessonRepository.manager.transaction(async (manager) => {
      const transactionResult = await manager
        .createQueryBuilder()
        .insert()
        .into('transaction')
        .values({
          createdOn: new Date(),
          updatedOn: new Date(),
          createdByUserId: loggedInUserId,
          updatedByUserId: loggedInUserId,
        })
        .execute();

      const transactionId =
        transactionResult.identifiers?.[0]?.id ??
        transactionResult.raw?.insertId ??
        transactionResult.generatedMaps?.[0]?.id;

      const lastInvoice = await manager
        .getRepository(Invoice)
        .createQueryBuilder('invoice')
        .where('invoice.location_id = :locationId', { locationId })
        .andWhere('invoice.type = :type', { type: Invoice.TYPE_INVOICE })
        .orderBy('invoice.id', 'DESC')
        .getOne();
      const nextInvoiceNumber = (lastInvoice?.invoiceNumber || 0) + 1;

      const invoice = manager.create(Invoice, {
        transactionId: transactionId || null,
        userId: customer.id,
        locationId,
        invoiceNumber: nextInvoiceNumber,
        date: lesson.date,
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
      });
      // TODO(legacy-parity): Legacy sets runtime `invoice->userName` and triggers model events/log hooks
      // via Invoiceable::createInvoice(). API2 currently persists financial data only.
      await manager.save(Invoice, invoice);

      const item = preloaded?.item ?? (await manager.findOne(Item, {
        where: { code: 'LESSON', isDeleted: false },
      }));
      if (!item) {
        throw new BadRequestException('Lesson item not found');
      }

      const unit = this.parseUnit(lesson.duration);
      // Legacy parity: group lesson gross price is the line-item amount itself,
      // not amount multiplied by duration. See SMW InvoiceLineItem::getGrossPrice().
      const grossPrice = Number(lesson.programRate || 0);
      const firstTeacherId = await this.getFirstLessonTeacherIdForEnrolment(
        manager,
        enrolment.id,
        lesson.teacherId,
      );
      const qualification = await manager.getRepository(Qualification).findOne({
        where: {
          teacherId: firstTeacherId,
          programId: Number(enrolment.course?.program?.id || lesson.course?.program?.id || 0),
          isDeleted: 0 as any,
        },
      });
      const rate = Number(qualification?.rate || 0);
      const studentName = `${(enrolment.student as any)?.firstName || (enrolment.student as any)?.first_name || ''} ${(enrolment.student as any)?.lastName || (enrolment.student as any)?.last_name || ''}`.trim();
      const teacherProfile = (lesson.teacher as any)?.profile;
      const teacherName = teacherProfile
        ? `${teacherProfile.firstname || ''} ${teacherProfile.lastname || ''}`.trim()
        : (lesson.teacher as any)?.username || '';
      const lessonDate = this.formatLegacyLessonDate(lesson.date);
      const royaltySnapshot = await resolveRoyaltySnapshot(
        manager,
        invoice.locationId,
        item,
        0,
      );

      const lineItem = manager.create(InvoiceLineItem, {
        invoiceId: invoice.id,
        itemId: item.id,
        itemTypeId: ItemTypeEnum.TYPE_GROUP_LESSON,
        unit,
        amount: Number(lesson.programRate || 0),
        description: `${lesson.course?.program?.name || 'Program'} for ${studentName} with ${teacherName} on ${lessonDate}`,
        royaltyFree: 0,
        royaltyCategoryId: royaltySnapshot.categoryId || null,
        royaltyRateApplied: royaltySnapshot.rate,
        advertisementRateApplied: royaltySnapshot.advertisementRate,
        taxType: 'NO TAX',
        taxRate: 0,
        taxStatus: 'No Tax',
        taxCode: 'ON',
        code: 'GROUP LESSON',
        cost: rate,
        rate,
        isDeleted: false,
        netTotal: grossPrice,
      });
      await manager.save(InvoiceLineItem, lineItem);

      await manager.save(
        InvoiceItemLesson,
        manager.create(InvoiceItemLesson, {
          invoiceLineItemId: lineItem.id,
          lessonId: lesson.id,
        }),
      );

      await manager.save(
        InvoiceItemEnrolment,
        manager.create(InvoiceItemEnrolment, {
          invoiceLineItemId: lineItem.id,
          enrolmentId: enrolment.id,
        }),
      );

      let discountAmount = 0;
      let remainingPrice = grossPrice;
      const courseProgramRate = preloaded?.courseProgramRate ?? (await manager
        .getRepository(CourseProgramRate)
        .createQueryBuilder('cpr')
        .where('cpr.courseId = :courseId', { courseId: lesson.courseId })
        .andWhere('DATE(:lessonDate) BETWEEN cpr.startDate AND cpr.endDate', { lessonDate: lesson.date })
        .orderBy('cpr.id', 'DESC')
        .getOne());
      const groupDiscount = await manager.findOne(LessonDiscount, {
        where: {
          lessonId: lesson.id,
          enrolmentId: enrolment.id,
          type: LessonDiscount.TYPE_GROUP,
        },
      });
      if (groupDiscount) {
        const value = Number(groupDiscount.value || 0);
        const groupDiscountAmount =
          groupDiscount.valueType === 1 ? (value / 100) * remainingPrice : value;
        discountAmount += groupDiscountAmount;
        remainingPrice = grossPrice - discountAmount;

        await manager.save(
          InvoiceLineItemDiscount,
          manager.create(InvoiceLineItemDiscount, {
            invoiceLineItemId: lineItem.id,
            value,
            valueType: groupDiscount.valueType,
            type: InvoiceLineItemDiscount.TYPE_GROUP,
          }),
        );
      }

      if (courseProgramRate?.applyFullDiscount) {
        await manager.save(
          InvoiceLineItemDiscount,
          manager.create(InvoiceLineItemDiscount, {
            invoiceLineItemId: lineItem.id,
            value: 100,
            valueType: InvoiceLineItemDiscount.VALUE_TYPE_PERCENTAGE,
            type: InvoiceLineItemDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
          }),
        );
        // Legacy full discount behaves like payment-frequency 100% applied at the last step.
        discountAmount += remainingPrice;
      }

      const netTotal = RoundingUtils.roundDecimal(grossPrice - discountAmount, 2);
      lineItem.netTotal = netTotal;
      await manager.save(InvoiceLineItem, lineItem);

      invoice.subTotal = netTotal;
      invoice.tax = 0;
      invoice.total = netTotal;
      invoice.balance = netTotal;
      await manager.save(Invoice, invoice);

      const lessonCreditAmount = await this.getLessonCreditAmount(
        manager,
        lesson.id,
        enrolment.id,
      );
      if (lessonCreditAmount > 0.01) {
        await this.saveCreditTransfer(
          manager,
          {
            fromLessonId: lesson.id,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            enrolmentId: enrolment.id,
            userId: customer.id,
            amount: RoundingUtils.roundDecimal(lessonCreditAmount, 2),
          },
          loggedInUserId,
        );
      }

      return {
        invoiceId: invoice.id,
        invoiceNumber: `I-${String(invoice.invoiceNumber).padStart(5, '0')}`,
        alreadyExists: false,
      };
    });

    await this.createLegacyGroupInvoiceLog(
      lesson,
      enrolment,
      result,
      loggedInUserId,
      locationId,
    );

    return result;
  }

  private async getLessonCreditAmount(
    manager: EntityManager,
    lessonId: number,
    enrolmentId: number,
  ): Promise<number> {
    const result = await manager
      .createQueryBuilder()
      .select('COALESCE(SUM(lp.amount), 0)', 'total')
      .from('lesson_payment', 'lp')
      .innerJoin('payment', 'p', 'p.id = lp.paymentId AND (p.isDeleted = 0 OR p.isDeleted IS NULL)')
      .innerJoin('payment_method', 'pm', 'pm.id = p.payment_method_id')
      .where('lp.lessonId = :lessonId', { lessonId })
      .andWhere('lp.enrolmentId = :enrolmentId', { enrolmentId })
      .andWhere('lp.isDeleted = 0')
      .andWhere('pm.id != :creditUsed', { creditUsed: PaymentMethod.TYPE_CREDIT_USED })
      .getRawOne();

    return result?.total ? parseFloat(String(result.total)) : 0;
  }

  private async saveCreditTransfer(
    manager: EntityManager,
    data: {
      fromLessonId: number;
      invoiceId: number;
      invoiceNumber: number;
      enrolmentId: number;
      userId: number;
      amount: number;
    },
    loggedInUserId: number,
  ): Promise<void> {
    if (data.amount < 0.01) {
      return;
    }

    const transferAmount = RoundingUtils.roundDecimal(data.amount, 2);

    const creditPayment = manager.create(Payment, {
      reference: `L-${data.fromLessonId.toString().padStart(6, '0')}`,
      userId: data.userId,
      amount: transferAmount,
      balance: transferAmount,
      paymentMethodId: PaymentMethod.TYPE_CREDIT_APPLIED,
      isDeleted: 0,
      date: new Date(),
      notes: '',
      createdByUserId: loggedInUserId,
      updatedByUserId: loggedInUserId,
    });
    await manager.save(Payment, creditPayment);

    const invoicePayment = manager.create(InvoicePayment, {
      invoiceId: data.invoiceId,
      paymentId: creditPayment.id,
      amount: transferAmount,
      isDeleted: 0,
      date: new Date(),
      createdByUserId: loggedInUserId,
      updatedByUserId: loggedInUserId,
    });
    await manager.save(InvoicePayment, invoicePayment);

    const debitPayment = manager.create(Payment, {
      reference: `I-${data.invoiceNumber.toString().padStart(5, '0')}`,
      userId: data.userId,
      amount: -Math.abs(transferAmount),
      balance: -Math.abs(transferAmount),
      paymentMethodId: PaymentMethod.TYPE_CREDIT_USED,
      isDeleted: 0,
      date: new Date(),
      notes: '',
      createdByUserId: loggedInUserId,
      updatedByUserId: loggedInUserId,
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
      amount: transferAmount,
      royaltyCategoryId: royaltySnapshot.categoryId,
      royaltyRateApplied: royaltySnapshot.rate,
      advertisementRateApplied: royaltySnapshot.advertisementRate,
      isDeleted: 0,
      date: new Date(),
      createdByUserId: loggedInUserId,
      updatedByUserId: loggedInUserId,
    });
    await manager.save(LessonPayment, lessonPayment);

    const creditUsage = manager.create(CreditUsage, {
      creditPaymentId: creditPayment.id,
      debitPaymentId: debitPayment.id,
    });
    await manager.save(CreditUsage, creditUsage);

    const invoice = await manager.findOne(Invoice, { where: { id: data.invoiceId } });
    if (!invoice) {
      return;
    }

    invoice.balance = RoundingUtils.calculateBalance(
      invoice.balance,
      transferAmount,
      4,
    );
    const balance = Number(invoice.balance);
    const roundedBalance = RoundingUtils.roundDecimal(balance, 2);
    if (roundedBalance > 0.09) {
      invoice.status = Invoice.STATUS_OWING;
    } else if (roundedBalance < -0.09) {
      invoice.status = Invoice.STATUS_CREDIT;
    } else {
      invoice.status = Invoice.STATUS_PAID;
    }
    await manager.save(Invoice, invoice);
  }

  private parseUnit(duration: string): number {
    const [hours, minutes] = (duration || '00:00:00').split(':').map(Number);
    return ((hours || 0) * 60 + (minutes || 0)) / 60;
  }

  private async getFirstLessonTeacherIdForEnrolment(
    manager: EntityManager,
    enrolmentId: number,
    fallbackTeacherId: number,
  ): Promise<number> {
    const row = await manager
      .createQueryBuilder()
      .select('lesson.teacherId', 'teacherId')
      .from('group_lesson', 'gl')
      .innerJoin('lesson', 'lesson', 'lesson.id = gl.lessonId')
      .where('gl.enrolmentId = :enrolmentId', { enrolmentId })
      .andWhere('gl.isDeleted = 0')
      .andWhere('lesson.isDeleted = 0')
      .orderBy('lesson.id', 'ASC')
      .limit(1)
      .getRawOne();

    return row?.teacherId ? Number(row.teacherId) : fallbackTeacherId;
  }

  private formatLegacyLessonDate(date: Date): string {
    const d = new Date(date);
    const months = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
    const day = d.getDate();
    const suffix =
      day === 1 || day === 21 || day === 31
        ? 'st'
        : day === 2 || day === 22
          ? 'nd'
          : day === 3 || day === 23
            ? 'rd'
            : 'th';
    return `${months[d.getMonth()]} ${day}${suffix}, ${d.getFullYear()}`;
  }

  private async createLegacyGroupInvoiceLog(
    lesson: Lesson,
    enrolment: Enrolment,
    invoice: { invoiceId: number; invoiceNumber: string; alreadyExists: boolean },
    loggedInUserId: number,
    locationId: number,
  ): Promise<void> {
    try {
      const logObject = await this.logObjectRepository.findLogObjectByName(
        LogObjectType.INVOICE,
      );
      const logActivity = await this.logActivityRepository.findLogActivityByName(
        LogActivityType.TYPE_CREATE,
      );
      if (!logObject || !logActivity) {
        return;
      }

      const loggedUserName = await this.getUserDisplayName(loggedInUserId);
      const customer = enrolment.student?.user as any;
      const customerName = await this.getCustomerDisplayName(customer);
      const invoiceIndex = `invoice #${invoice.invoiceNumber}`;
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const locationSlug = await this.getLocationSlug(locationId);
      if (!locationSlug) {
        throw new Error(`Location slug not found for location ${locationId}`);
      }

      const { log } = await this.logRepository.createLog(
        {
          logObjectId: logObject.id,
          logActivityId: logActivity.id,
          message: `${loggedUserName} created an {{${invoiceIndex}}} for {{${customerName}}}`,
          data: JSON.stringify({
            id: invoice.invoiceId,
            user_id: customer?.id,
            location_id: locationId,
            invoice_number: invoice.invoiceNumber,
            date: lesson.date,
            type: Invoice.TYPE_INVOICE,
          }),
          locationId,
          createdOn: getCurrentESTDate(),
          createdUserId: loggedInUserId,
        },
        {
          index: invoiceIndex,
          baseUrl,
          path: `/v2/admin/${locationSlug}/invoices/${invoice.invoiceId}`,
        },
        {
          instanceId: invoice.invoiceId,
          instanceType: LogObjectType.INVOICE,
        },
      );

      await this.lessonRepository.manager.getRepository(LogLink).save({
        logId: log.id,
        index: customerName,
        baseUrl,
        path: `/v2/admin/${locationSlug}/customers/${customer?.id}`,
      });
    } catch (error) {
      console.error('Error creating legacy group invoice log:', error);
    }
  }

  private async getUserDisplayName(userId: number): Promise<string> {
    const user = await this.lessonRepository.manager.getRepository(User).findOne({
      where: { id: userId },
      relations: ['profile'],
    });
    const firstName = user?.profile?.firstname?.trim() || '';
    const lastName = user?.profile?.lastname?.trim() || '';
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || user?.username || `User ${userId}`;
  }

  private async getCustomerDisplayName(customer: any): Promise<string> {
    const hydratedCustomer =
      customer?.profile || !customer?.id
        ? customer
        : await this.lessonRepository.manager.getRepository(User).findOne({
            where: { id: customer.id },
            relations: ['profile'],
          });
    const firstName = hydratedCustomer?.profile?.firstname?.trim() || '';
    const lastName = hydratedCustomer?.profile?.lastname?.trim() || '';
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || hydratedCustomer?.username || `User ${customer?.id ?? ''}`.trim();
  }

  private async getLocationSlug(locationId: number): Promise<string | undefined> {
    if (!locationId) {
      return undefined;
    }

    const location = await this.locationRepository.getLocationDetails(locationId);
    return location?.slug;
  }
}
