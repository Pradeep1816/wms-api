import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { PrivateLessonInvoiceRepository } from '../repositories/generate-invoice.repository';
import type {
  CreateInvoiceData,
  CreateLineItemData,
  CreateDiscountData,
  CreditTransferData,
} from '../repositories/generate-invoice.repository';
import { LessonRepository } from '../repositories/lesson.repository';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { InvoiceLineItemDiscount } from '../../invoice/entities/invoice-line-item-discount.entity';
import { Lesson } from '../entities/lesson.entity';
import { GeneratePrivateInvoiceDto } from '../dto/generate-private-invoice.dto';
import { LessonStatusEnum } from '../enums/lesson-status';
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
import { publicProgramName } from '../../pricing/utils/program-public-name';

/**
 * Business logic for private lesson invoice generation.
 * Legacy-identical to PrivateLessonController::actionGenerateInvoice() and Invoiceable::createPrivateLessonInvoice()
 */
@Injectable()
export class PrivateLessonInvoiceService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly repo: PrivateLessonInvoiceRepository,
    private readonly lessonRepo: LessonRepository,
    private readonly logRepository: LogRepository,
    private readonly logObjectRepository: LogObjectRepository,
    private readonly logActivityRepository: LogActivityRepository,
    private readonly locationRepository: LocationRepository,
  ) {}

  async generateInvoicesForLessons(
    locationId: number,
    dto: GeneratePrivateInvoiceDto,
    loggedInUserId: number,
  ): Promise<{ status: boolean; message?: string; error?: string; customerId?: number; invoiceId?: number }> {
    const lessonIds = dto.lessonIds ?? [];
    if (lessonIds.length === 0) {
      throw new BadRequestException("Selected lesson's have not been invoiced");
    }

    const lessons = await this.repo.findLessonsForInvoice(
      locationId,
      lessonIds,
      this.entityManager,
    );

    let noOfInvoicedLesson = 0;
    let noOfNotInvoicedLesson = 0;
    let noOfAlreadyInvoicedLesson = 0;
    let customerId: number | undefined;
    let invoiceId: number | undefined;

    for (const lesson of lessons) {
      const canInvoice = this.canInvoice(lesson);

      if (canInvoice) {
        const hasInvoice = await this.repo.findOneByLessonId(
          lesson.id,
          this.entityManager,
        );

        if (hasInvoice) {
          noOfAlreadyInvoicedLesson++;
          if (!customerId && hasInvoice.userId) {
            customerId = hasInvoice.userId;
          }
          if (!invoiceId) {
            invoiceId = hasInvoice.id;
          }
          continue;
        }

        const newInvoice = await this.entityManager.transaction((manager) =>
          this.createPrivateLessonInvoice(lesson, manager, loggedInUserId),
        );
        noOfInvoicedLesson++;
        if (newInvoice) {
          if (!customerId && newInvoice.userId) {
            customerId = newInvoice.userId;
          }
          if (!invoiceId) {
            invoiceId = newInvoice.id;
          }
          await this.createLegacyInvoiceLogs(lesson, newInvoice, loggedInUserId);
        }
      } else {
        noOfNotInvoicedLesson++;
      }
    }

    const response = this.validateInvoiceResponse(
      noOfInvoicedLesson,
      noOfAlreadyInvoicedLesson,
      noOfNotInvoicedLesson,
    );

    return {
      ...response,
      customerId,
      invoiceId,
    };
  }

  canInvoice(lesson: Lesson): boolean {
    if (lesson.isDeleted) return false;
    if (!lesson.isConfirmed) return false;
    if (lesson.status === LessonStatusEnum.CANCELED) return false;
    const privateLesson = Array.isArray(lesson.privateLesson)
      ? lesson.privateLesson?.[0]
      : lesson.privateLesson;
    if (!privateLesson) return false;

    const currentDate = getCurrentESTDate();
    const isCompleted = new Date(lesson.date) <= currentDate;
    const isScheduledOrRescheduled =
      lesson.status === LessonStatusEnum.SCHEDULED ||
      lesson.status === LessonStatusEnum.RESCHEDULED;
    const isExpired =
      privateLesson?.expiryDate &&
      lesson.status === LessonStatusEnum.UNSCHEDULED &&
      currentDate > new Date(privateLesson.expiryDate);
    const isPresent = lesson.isPresent ?? true;

    return (
      (isCompleted && isScheduledOrRescheduled) || isExpired || !isPresent
    );
  }

  private async createPrivateLessonInvoice(
    lesson: Lesson,
    manager: EntityManager,
    loggedInUserId: number,
  ): Promise<{ id: number; userId: number; invoiceNumber: number } | null> {
    const enrolment =
      (lesson as any).enrolment ??
      (lesson as any).course?.enrolments?.[0];
    const student = enrolment?.student;
    const customer = student?.user;
    const customerUserId = customer?.id;
    const userLocation = (customer as any)?.userLocation;
    const locationId = userLocation?.locationId ?? userLocation?.[0]?.locationId;

    if (!customerUserId || !locationId) {
      throw new Error(
        `Lesson ${lesson.id}: cannot determine customer or location`,
      );
    }

    const nextNumber = await this.repo.getNextInvoiceNumber(
      locationId,
      Invoice.TYPE_INVOICE,
      manager,
    );

    const privateLesson = Array.isArray(lesson.privateLesson)
      ? lesson.privateLesson?.[0]
      : lesson.privateLesson;
    const currentDate = getCurrentESTDate();
    const isExpired =
      privateLesson?.expiryDate &&
      lesson.status === LessonStatusEnum.UNSCHEDULED &&
      currentDate > new Date(privateLesson.expiryDate);
    const invoiceDate = isExpired
      ? privateLesson.expiryDate
      : lesson.date;

    const invoiceData: CreateInvoiceData = {
      userId: customerUserId,
      locationId,
      invoiceNumber: nextNumber,
      date: invoiceDate,
    };
    const invoice = await this.repo.createInvoice(
      invoiceData,
      manager,
      loggedInUserId,
    );

    const item = await this.repo.findLessonItem(manager);
    const taxData = await this.repo.getTaxDataForItem(
      Number(item.taxStatusId),
      manager,
    );

    const programRate = Number(lesson.programRate ?? 0);
    const unit = lesson.getUnit ? lesson.getUnit() : 1;
    const rate = Number(lesson.teacherRate ?? 0);
    const isUnscheduled = lesson.status === LessonStatusEnum.UNSCHEDULED;
    const cost = isUnscheduled ? 0 : rate * unit;
    const grossPrice = lesson.getGrossPrice();
    const taxCodeRate = Number(taxData?.taxCodeRate ?? 0);
    const lineItemTax = RoundingUtils.roundDecimal(
      (grossPrice * taxCodeRate) / 100,
      4,
    );

    const lineItemData: CreateLineItemData = {
      invoiceId: invoice.id,
      itemId: Number(item.id),
      unit,
      amount: programRate,
      description: this.buildDescription(lesson),
      cost,
      rate,
      netTotal: grossPrice,
      taxType: taxData?.taxTypeName ?? 'NO TAX',
      taxRate: lineItemTax,
      taxStatus: taxData?.taxStatusName ?? 'No Tax',
      taxCode: taxData?.taxCodeCode ?? 'ON',
    };
    const lineItem = await this.repo.createInvoiceLineItem(
      lineItemData,
      manager,
    );

    await this.repo.createInvoiceItemLesson(lineItem.id, lesson.id, manager);

    const discounts = this.getDiscountsToApply(lesson, lineItem.id);
    if (discounts.length > 0) {
      await this.repo.createLineItemDiscounts(discounts, manager);
    }

    const calculatedNetTotal = this.computeDiscountedNetTotal(
      grossPrice,
      discounts,
    );
    const calculatedTax = RoundingUtils.roundDecimal(
      (calculatedNetTotal * taxCodeRate) / 100,
      4,
    );
    const { netTotal, tax, total } = this.resolveInvoiceAmounts(
      lesson,
      calculatedNetTotal,
      calculatedTax,
    );
    await this.repo.updateLineItemTotals(lineItem.id, netTotal, tax, manager);

    const subTotal = netTotal;
    await this.repo.updateInvoiceTotals(
      invoice.id,
      subTotal,
      tax,
      total,
      total,
      manager,
    );

    await this.applyCreditTransfer(
      lesson,
      invoice,
      enrolment,
      manager,
      loggedInUserId,
    );

    // Return invoice info for redirect URL
    return {
      id: invoice.id,
      userId: invoice.userId,
      invoiceNumber: invoice.invoiceNumber,
    };
  }

  /**
   * Explode stores a cent-preserving total for each child. Its independently
   * split discount rows can recalculate one cent differently, so invoices must
   * keep the stored child total instead of recreating the rounding remainder.
   */
  private resolveInvoiceAmounts(
    lesson: Lesson,
    calculatedNetTotal: number,
    calculatedTax: number,
  ): { netTotal: number; tax: number; total: number } {
    const privateLesson = Array.isArray(lesson.privateLesson)
      ? lesson.privateLesson[0]
      : lesson.privateLesson;
    const storedTotal = Number(privateLesson?.total);
    const isStoredExplodedTotal =
      Number(lesson.isExploded ?? 0) === 1 && Number.isFinite(storedTotal);

    if (!isStoredExplodedTotal) {
      return {
        netTotal: calculatedNetTotal,
        tax: calculatedTax,
        total: calculatedNetTotal + calculatedTax,
      };
    }

    const total = RoundingUtils.roundDecimal(storedTotal, 2);
    const storedTax = Number(lesson.tax ?? 0);
    const tax = Number.isFinite(storedTax)
      ? RoundingUtils.roundDecimal(storedTax, 4)
      : calculatedTax;

    return {
      netTotal: RoundingUtils.roundDecimal(total - tax, 4),
      tax,
      total,
    };
  }

  private buildDescription(lesson: Lesson): string {
    const enrolment =
      (lesson as any).enrolment ?? (lesson as any).course?.enrolments?.[0];
    const student = enrolment?.student;
    const studentName = student
      ? `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim()
      : '';
    // The invoice line a customer reads. Internal markers must not appear.
    const programName =
      publicProgramName(
        (lesson as any).course?.program,
        (lesson as any).course?.locationId,
      ) ?? '';
    const teacher = (lesson as any).teacher?.profile;
    const teacherName = teacher
      ? `${teacher.firstname ?? ''} ${teacher.lastname ?? ''}`.trim()
      : '';
    const dateStr = this.formatDateLegacy(lesson.date);
    return `${programName} for ${studentName} with ${teacherName} on ${dateStr}`;
  }

  private formatDateLegacy(date: Date): string {
    const d = new Date(date);
    const months = [
      'Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.',
      'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.',
    ];
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

  private computeDiscountedNetTotal(
    grossPrice: number,
    discounts: CreateDiscountData[],
  ): number {
    const getByType = (type: number) =>
      discounts.find((d) => d.type === type);

    let discount = 0;
    let lineItemPrice = grossPrice;

    const applyDiscount = (d: CreateDiscountData) => {
      const discountValue = Number(d.value ?? 0);
      if (!Number.isFinite(discountValue)) {
        return;
      }

      // Legacy behavior: multi-enrolment discount is always a flat dollar value.
      const isLegacyFlatMulti =
        d.type === InvoiceLineItemDiscount.TYPE_MULTIPLE_ENROLMENT;

      if (
        !isLegacyFlatMulti &&
        d.valueType === InvoiceLineItemDiscount.VALUE_TYPE_PERCENTAGE
      ) {
        discount += (discountValue / 100) * lineItemPrice;
      } else {
        discount += lineItemPrice < 0 ? -discountValue : discountValue;
      }
      lineItemPrice = grossPrice - discount;
    };

    const multi = getByType(InvoiceLineItemDiscount.TYPE_MULTIPLE_ENROLMENT);
    if (multi) applyDiscount(multi);

    const lineItem = getByType(InvoiceLineItemDiscount.TYPE_LINE_ITEM);
    if (lineItem) applyDiscount(lineItem);

    const customer = getByType(InvoiceLineItemDiscount.TYPE_CUSTOMER);
    if (customer) applyDiscount(customer);

    const prepaid = getByType(InvoiceLineItemDiscount.TYPE_PREPAID_CYCLE);
    if (prepaid) {
      discount += RoundingUtils.prepaidReduction(
        Number(prepaid.value ?? 0),
        lineItemPrice,
      ).toNumber();
    } else {
      const pf = getByType(
        InvoiceLineItemDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
      );
      if (pf) applyDiscount(pf);
    }

    const totalDiscount = Number.isFinite(discount) ? discount : 0;
    const netTotal = grossPrice - totalDiscount;
    return Number.isFinite(netTotal)
      ? RoundingUtils.roundHalfUpForLesson(netTotal, 2)
      : 0;
  }

  private getDiscountsToApply(
    lesson: Lesson,
    invoiceLineItemId: number,
  ): CreateDiscountData[] {
    const discounts = (lesson as any).discounts ?? [];
    const getByType = (type: number) =>
      discounts.find((d: any) => d.type === type);

    const result: CreateDiscountData[] = [];

    const customer = getByType(InvoiceLineItemDiscount.TYPE_CUSTOMER);
    if (customer) {
      result.push({
        invoiceLineItemId,
        value: Number(customer.value ?? 0),
        valueType: InvoiceLineItemDiscount.VALUE_TYPE_PERCENTAGE,
        type: InvoiceLineItemDiscount.TYPE_CUSTOMER,
      });
    }

    const lineItem = getByType(InvoiceLineItemDiscount.TYPE_LINE_ITEM);
    if (lineItem) {
      result.push({
        invoiceLineItemId,
        value: Number(lineItem.value ?? 0),
        valueType: lineItem.valueType ? 1 : 0,
        type: InvoiceLineItemDiscount.TYPE_LINE_ITEM,
      });
    }

    // Prepaid replaces payment frequency rather than stacking with it. The
    // payment-frequency row is deliberately left on the lesson so prepaid can be
    // backed out by deleting one row, and every calculator suppresses it while a
    // prepaid row is present. Copying both onto the line item would discount the
    // invoice twice.
    const prepaid = getByType(InvoiceLineItemDiscount.TYPE_PREPAID_CYCLE);
    if (prepaid) {
      result.push({
        invoiceLineItemId,
        value: Number(prepaid.value ?? 0),
        valueType: InvoiceLineItemDiscount.VALUE_TYPE_DOLLAR,
        type: InvoiceLineItemDiscount.TYPE_PREPAID_CYCLE,
      });
    }

    const pf = prepaid
      ? null
      : getByType(InvoiceLineItemDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY);
    if (pf) {
      result.push({
        invoiceLineItemId,
        value: Number(pf.value ?? 0),
        valueType: InvoiceLineItemDiscount.VALUE_TYPE_PERCENTAGE,
        type: InvoiceLineItemDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
      });
    }

    const multi = getByType(InvoiceLineItemDiscount.TYPE_MULTIPLE_ENROLMENT);
    if (multi) {
      result.push({
        invoiceLineItemId,
        value: Number(multi.value ?? 0),
        // Legacy addMultiEnrolmentDiscount always writes VALUE_TYPE_DOLLAR.
        valueType: InvoiceLineItemDiscount.VALUE_TYPE_DOLLAR,
        type: InvoiceLineItemDiscount.TYPE_MULTIPLE_ENROLMENT,
      });
    }

    return result;
  }

  private async applyCreditTransfer(
    lesson: Lesson,
    invoice: { id: number; invoiceNumber: number; userId: number },
    enrolment: any,
    manager: EntityManager,
    loggedInUserId: number,
  ): Promise<void> {
    if (!enrolment?.id) return;

    const customer = enrolment?.student?.user;
    const customerUserId = customer?.id ?? invoice.userId;

    const lessonCreditAmount = await this.lessonRepo.getLessonNetCreditAmount(
      lesson.id,
      enrolment.id,
      manager,
    );
    if (lessonCreditAmount > 0.01) {
      const data: CreditTransferData = {
        fromLessonId: lesson.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceUserId: invoice.userId,
        enrolmentId: enrolment.id,
        userId: customerUserId,
        amount: RoundingUtils.roundDecimal(lessonCreditAmount, 2),
      };
      await this.repo.saveCreditTransfer(data, manager, loggedInUserId);
    }

    const usedLessonSplits = (lesson as any).usedLessonSplits ?? [];
    for (const split of usedLessonSplits) {
      const splitLesson = split.lesson;
      if (!splitLesson) continue;

      const splitCredit = await this.lessonRepo.getLessonNetCreditAmount(
        splitLesson.id,
        enrolment.id,
        manager,
      );
      if (splitCredit <= 0.01) continue;

      let amount = await this.repo.getLegacySplitAmount(splitLesson.id, manager);
      if (amount <= 0) {
        amount = splitCredit;
      }
      if (amount > splitCredit) amount = splitCredit;
      amount = RoundingUtils.roundDecimal(amount, 2);

      const data: CreditTransferData = {
        fromLessonId: splitLesson.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceUserId: invoice.userId,
        enrolmentId: enrolment.id,
        userId: customerUserId,
        amount,
      };
      await this.repo.saveCreditTransfer(data, manager, loggedInUserId);
    }
  }

  private validateInvoiceResponse(
    noOfInvoiced: number,
    noOfAlready: number,
    noOfSkipped: number,
  ): { status: boolean; message?: string; error?: string } {
    // All selected lessons successfully invoiced (no already / skipped)
    if (noOfAlready === 0 && noOfSkipped === 0) {
      return { status: true, message: 'Lesson has been invoiced Successfully.' };
    }
  
    // None could be invoiced because selected lessons are not invoice-eligible.
    if (noOfSkipped > 0 && noOfAlready === 0 && noOfInvoiced === 0) {
      throw new BadRequestException(
        'Invoice can be generated against completed scheduled lessons only.',
      );
    }

    // None could be invoiced now and none were already invoiced
    if (noOfAlready === 0 && noOfInvoiced === 0) {
      throw new BadRequestException("Selected lesson's have not been invoiced");
    }
  
    // All were already invoiced
    if (noOfAlready > 0 && noOfSkipped === 0 && noOfInvoiced === 0) {
      throw new BadRequestException("Lesson's already invoiced");
    }
  
    // Mixed cases -> still success, with informative message
    if (noOfAlready > 0 && noOfInvoiced > 0 && noOfSkipped === 0) {
      return {
        status: true,
        message: `${noOfAlready} lesson Already Invoiced and ${noOfInvoiced} lesson has been Invoiced Successfully`,
      };
    }
    if (noOfAlready > 0 && noOfSkipped > 0 && noOfInvoiced === 0) {
      return {
        status: true,
        message: `${noOfAlready} lesson Already Invoiced and ${noOfSkipped} skipped`,
      };
    }
    return {
      status: true,
      message: `${noOfAlready} lesson Already Invoiced and ${noOfInvoiced} lesson has been Invoiced Successfully and ${noOfSkipped} skipped`,
    };
  }

  private async createLegacyInvoiceLogs(
    lesson: Lesson,
    invoice: { id: number; userId: number; invoiceNumber: number },
    loggedInUserId: number,
  ): Promise<void> {
    try {
      const logObjectInvoice = await this.logObjectRepository.findLogObjectByName(
        LogObjectType.INVOICE,
      );
      const logObjectLesson = await this.logObjectRepository.findLogObjectByName(
        LogObjectType.LESSON,
      );
      const logActivity = await this.logActivityRepository.findLogActivityByName(
        LogActivityType.TYPE_CREATE,
      );
      if (!logObjectInvoice || !logObjectLesson || !logActivity) {
        return;
      }

      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const loggedUserName = await this.getUserDisplayName(loggedInUserId);
      const customer = this.getLessonCustomer(lesson);
      const customerName = await this.getCustomerDisplayName(customer);
      const locationId = Number((lesson as any).course?.locationId || 0);
      const locationSlug = await this.getLocationSlug(locationId);
      if (!locationSlug) {
        throw new Error(`Location slug not found for location ${locationId}`);
      }
      const formattedInvoiceNumber = this.formatInvoiceNumber(invoice.invoiceNumber);
      const invoiceIndex = `invoice #${formattedInvoiceNumber}`;
      const invoicePath = `/v2/admin/${locationSlug}/invoices/${invoice.id}`;
      const lessonSnapshot = this.serializeLessonSnapshot(lesson);
      const invoiceSnapshot = this.serializeInvoiceSnapshot(lesson, invoice);

      const { log: invoiceLog } = await this.logRepository.createLog(
        {
          logObjectId: logObjectInvoice.id,
          logActivityId: logActivity.id,
          message: `${loggedUserName} created an {{${invoiceIndex}}} for {{${customerName}}}`,
          data: invoiceSnapshot,
          locationId,
          createdOn: getCurrentESTDate(),
          createdUserId: loggedInUserId,
        },
        {
          index: invoiceIndex,
          baseUrl,
          path: invoicePath,
        },
        {
          instanceId: invoice.id,
          instanceType: LogObjectType.INVOICE,
        },
      );

      await this.entityManager.getRepository(LogLink).save({
        logId: invoiceLog.id,
        index: customerName,
        baseUrl,
        path: `/v2/admin/${locationSlug}/customers/${invoice.userId}`,
      });

      if (this.isExpiredLesson(lesson)) {
        await this.logRepository.createLog(
          {
            logObjectId: logObjectLesson.id,
            logActivityId: logActivity.id,
            message: `Lesson is Expired on ${this.formatDateOnly((lesson.privateLesson as any)?.[0]?.expiryDate)}`,
            data: lessonSnapshot,
            locationId,
            createdOn: getCurrentESTDate(),
            createdUserId: loggedInUserId,
          },
          {
            index: formattedInvoiceNumber,
            baseUrl,
            path: invoicePath,
          },
          {
            instanceId: lesson.id,
            instanceType: LogObjectType.LESSON,
          },
        );
      }

      await this.logRepository.createLog(
        {
          logObjectId: logObjectLesson.id,
          logActivityId: logActivity.id,
          message: `${loggedUserName} created an invoice #{{${formattedInvoiceNumber}}} for this Lesson`,
          data: lessonSnapshot,
          locationId,
          createdOn: getCurrentESTDate(),
          createdUserId: loggedInUserId,
        },
        {
          index: formattedInvoiceNumber,
          baseUrl,
          path: invoicePath,
        },
        {
          instanceId: lesson.id,
          instanceType: LogObjectType.LESSON,
        },
      );
    } catch (error) {
      console.error('Error creating legacy private invoice logs:', error);
    }
  }

  private async getUserDisplayName(userId: number): Promise<string> {
    const user = await this.entityManager.getRepository(User).findOne({
      where: { id: userId },
      relations: ['profile'],
    });
    const firstName = user?.profile?.firstname?.trim() || '';
    const lastName = user?.profile?.lastname?.trim() || '';
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || user?.username || `User ${userId}`;
  }

  private getLessonCustomer(lesson: Lesson): any {
    const enrolment =
      (lesson as any).enrolment ?? (lesson as any).course?.enrolments?.[0];
    return enrolment?.student?.user;
  }

  private async getCustomerDisplayName(customer: any): Promise<string> {
    const hydratedCustomer =
      customer?.profile || !customer?.id
        ? customer
        : await this.entityManager.getRepository(User).findOne({
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

  private formatInvoiceNumber(invoiceNumber: number): string {
    return `I-${String(invoiceNumber).padStart(5, '0')}`;
  }

  private isExpiredLesson(lesson: Lesson): boolean {
    const privateLesson = Array.isArray(lesson.privateLesson)
      ? lesson.privateLesson?.[0]
      : (lesson.privateLesson as any);
    return Boolean(
      privateLesson?.expiryDate &&
        lesson.status === LessonStatusEnum.UNSCHEDULED &&
        getCurrentESTDate() > new Date(privateLesson.expiryDate),
    );
  }

  private formatDateOnly(date: Date | string | undefined): string {
    if (!date) {
      return '';
    }
    return new Date(date).toISOString().split('T')[0];
  }

  private serializeInvoiceSnapshot(
    lesson: Lesson,
    invoice: { id: number; userId: number; invoiceNumber: number },
  ): string {
    const locationId = Number((lesson as any).course?.locationId || 0);
    return JSON.stringify({
      id: invoice.id,
      user_id: invoice.userId,
      location_id: locationId,
      invoice_number: invoice.invoiceNumber,
      date: this.isExpiredLesson(lesson)
        ? (Array.isArray(lesson.privateLesson)
            ? lesson.privateLesson?.[0]?.expiryDate
            : (lesson.privateLesson as any)?.expiryDate)
        : lesson.date,
      type: Invoice.TYPE_INVOICE,
    });
  }

  private serializeLessonSnapshot(lesson: Lesson): string {
    return JSON.stringify({
      id: lesson.id,
      courseId: lesson.courseId,
      teacherId: lesson.teacherId,
      date: lesson.date,
      duration: lesson.duration,
      status: lesson.status,
      isPresent: lesson.isPresent,
      programRate: lesson.programRate,
      teacherRate: lesson.teacherRate,
    });
  }
}
