import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { CustomerAccount } from '../../customer/entities/customer-account.entity';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { GroupLesson } from '../../lesson/entities/group-lesson.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { Payment } from '../../payment/entities/payment.entity';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { getCurrentESTDate } from '../../utils/date-utils';

export interface UpsertCustomerBalanceOptions {
  manager?: EntityManager;
  updatedByUserId?: number;
}

@Injectable()
export class CustomerBalanceCalculationRepository {
  constructor(
    private readonly dataSource: DataSource,
  ) {}

  async calculateBalance(
    customerId: number,
    manager?: EntityManager,
  ): Promise<number> {
    const entityManager = manager ?? this.dataSource.manager;

    // TODO: If business requires per-location balance, add optional locationId filters
    // across lessons/invoices/credits queries and thread locationId through callers.
    const [lessonsDue, invoiceOwingAmountTotal, totalCredits] = await Promise.all([
      this.getLessonsDue(customerId, entityManager),
      this.getInvoiceOwingAmountTotal(customerId, entityManager),
      this.getTotalCredits(customerId, entityManager),
    ]);

    return lessonsDue + invoiceOwingAmountTotal - totalCredits;
  }

  async upsertCustomerAccountBalance(
    customerId: number,
    balance: number,
    options: UpsertCustomerBalanceOptions = {},
  ): Promise<void> {
    const entityManager = options.manager ?? this.dataSource.manager;
    const customerAccountRepository = entityManager.getRepository(CustomerAccount);
    const customerAccount = await customerAccountRepository.findOne({
      where: { customerId },
    });

    // TODO: If business requires auto-healing, create missing customer_account row here.
    // Current behavior intentionally matches legacy update-only semantics.
    if (customerAccount) {
      customerAccount.balance = balance;
      if (this.isValidPositiveId(options.updatedByUserId)) {
        customerAccount.updatedByUserId = options.updatedByUserId;
      }
      await customerAccountRepository.save(customerAccount);
    }
  }

  private isValidPositiveId(value?: number): value is number {
    return Number.isFinite(value) && Number(value) > 0;
  }

  private async getLessonsDue(customerId: number, manager: EntityManager): Promise<number> {
    const [privateLessonsDue, groupLessonsDue] = await Promise.all([
      this.getPrivateLessonsDue(customerId, manager),
      this.getGroupLessonOwingAmount(customerId, manager),
    ]);

    return privateLessonsDue + groupLessonsDue;
  }

  private async getPrivateLessonsDue(customerId: number, manager: EntityManager): Promise<number> {
    const lessonRepository = manager.getRepository(Lesson);
    const now = getCurrentESTDate();

    const invoicedLessonSubQuery = lessonRepository
      .createQueryBuilder('ilesson')
      .leftJoin('ilesson.course', 'icourse')
      .leftJoin('icourse.program', 'iprogram')
      .leftJoin('icourse.enrolments', 'ienrolment')
      .leftJoin('ienrolment.student', 'istudent')
      .leftJoin('ilesson.invoiceItemLessons', 'iill')
      .leftJoin('iill.invoiceLineItem', 'iili')
      .leftJoin('iili.invoice', 'iinv')
      .where('ilesson.isDeleted = false')
      .andWhere('ilesson.isConfirmed = true')
      .andWhere('ilesson.status != :canceled', { canceled: LessonStatusEnum.CANCELED })
      .andWhere('icourse.isDeleted = false')
      .andWhere('iprogram.type = :privateProgram', { privateProgram: 1 })
      .andWhere('ienrolment.isDeleted = false')
      .andWhere('ienrolment.isConfirmed = true')
      .andWhere('istudent.customerId = :customerId', { customerId })
      .andWhere('iili.isDeleted = false')
      .andWhere('iinv.isDeleted = false')
      .andWhere('iinv.type = :invoiceType', { invoiceType: Invoice.TYPE_INVOICE })
      .select('ilesson.id', 'id');

    const lessonBalancesRows = await lessonRepository
      .createQueryBuilder('lesson')
      .leftJoin('lesson.course', 'course')
      .leftJoin('course.program', 'program')
      .leftJoin('lesson.privateLesson', 'privateLesson')
      .leftJoin('course.enrolments', 'enrolment')
      .leftJoin('enrolment.student', 'student')
      .leftJoin(
        `(${invoicedLessonSubQuery.getQuery()})`,
        'invoiced_lesson',
        'lesson.id = invoiced_lesson.id',
      )
      .setParameters(invoicedLessonSubQuery.getParameters())
      .where('lesson.isDeleted = false')
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.status != :canceled', { canceled: LessonStatusEnum.CANCELED })
      .andWhere('lesson.dueDate < :now', { now })
      .andWhere('invoiced_lesson.id IS NULL')
      .andWhere('course.isDeleted = false')
      .andWhere('program.type = :privateProgram', { privateProgram: 1 })
      .andWhere('privateLesson.balance > 0.09')
      .andWhere('enrolment.isDeleted = false')
      .andWhere('enrolment.isConfirmed = true')
      .andWhere('student.customerId = :customerId', { customerId })
      .select('lesson.id', 'lessonId')
      .addSelect('MAX(privateLesson.balance)', 'balance')
      .groupBy('lesson.id')
      .getRawMany();

    return lessonBalancesRows.reduce((sum, row) => sum + parseFloat(row.balance ?? '0'), 0);
  }

  private async getGroupLessonOwingAmount(
    customerId: number,
    manager: EntityManager,
  ): Promise<number> {
    const groupLessonRepository = manager.getRepository(GroupLesson);
    const now = getCurrentESTDate();

    const invoicedGroupLessonSubQuery = groupLessonRepository
      .createQueryBuilder('igl')
      .leftJoin('igl.lesson', 'ilesson')
      .leftJoin('ilesson.invoiceItemLessons', 'iill')
      .leftJoin('iill.invoiceLineItem', 'iili')
      .leftJoin('iili.invoice', 'iinv')
      .leftJoin('igl.enrolment', 'ienrol')
      .leftJoin('ienrol.invoiceItemEnrolment', 'iie')
      .leftJoin('iie.invoiceLineItem', 'iieli')
      .leftJoin('iieli.invoice', 'iienv')
      .where('iill.id IS NOT NULL')
      .andWhere('iili.isDeleted = false')
      .andWhere('iinv.isDeleted = false')
      .andWhere('iieli.isDeleted = false')
      .andWhere('iienv.isDeleted = false')
      .select('igl.id', 'id');

    const groupLessonsOwingAmount = await groupLessonRepository
      .createQueryBuilder('groupLesson')
      .leftJoin('groupLesson.lesson', 'lesson')
      .leftJoin('groupLesson.enrolment', 'enrolment')
      .leftJoin('enrolment.student', 'student')
      .leftJoin(
        `(${invoicedGroupLessonSubQuery.getQuery()})`,
        'invoiced_lesson',
        'groupLesson.id = invoiced_lesson.id',
      )
      .setParameters(invoicedGroupLessonSubQuery.getParameters())
      .where('groupLesson.isDeleted = false')
      .andWhere('invoiced_lesson.id IS NULL')
      .andWhere('groupLesson.balance > 0.09')
      .andWhere('groupLesson.dueDate < :now', { now })
      .andWhere('lesson.isDeleted = false')
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.status != :canceled', { canceled: LessonStatusEnum.CANCELED })
      .andWhere('enrolment.isDeleted = false')
      .andWhere('enrolment.isConfirmed = true')
      .andWhere('student.customerId = :customerId', { customerId })
      .select('COALESCE(SUM(groupLesson.balance), 0)', 'total')
      .getRawOne();

    return parseFloat(groupLessonsOwingAmount?.total || '0');
  }

  /**
   * Canceled and void invoices are excluded: they are hidden from every invoice
   * list, so counting their leftover balance here surfaces an amount owing that
   * the customer has no way to see or pay.
   */
  private async getInvoiceOwingAmountTotal(
    customerId: number,
    manager: EntityManager,
  ): Promise<number> {
    const invoiceOwingAmount = await manager
      .getRepository(Invoice)
      .createQueryBuilder('invoice')
      .where('invoice.userId = :customerId', { customerId })
      .andWhere('invoice.type = :type', { type: Invoice.TYPE_INVOICE })
      .andWhere('invoice.balance > 0.09')
      .andWhere('invoice.isDeleted = false')
      .andWhere('invoice.isCanceled = false')
      .andWhere('invoice.isVoid = :isVoid', { isVoid: 0 })
      .select('COALESCE(SUM(invoice.balance), 0)', 'total')
      .getRawOne();

    return parseFloat(invoiceOwingAmount?.total || '0');
  }

  /**
   * Deliberately does NOT exclude canceled/void invoices, unlike
   * getInvoiceOwingAmountTotal above. The asymmetry is intentional:
   *
   *   positive balance on a canceled/void invoice = phantom debt  -> exclude
   *   negative balance on a canceled/void invoice = real credit   -> keep
   *
   * Voiding clears the invoice total (see markInvoiceAsVoid) but leaves any
   * payment already applied to it in place, so the balance lands at
   * -(amount the customer paid). That is money the customer is genuinely owed.
   * Filtering canceled/void out here would erase those credits and flip the
   * affected customers into apparent debt.
   */
  private async getTotalCredits(customerId: number, manager: EntityManager): Promise<number> {
    const invoiceRepository = manager.getRepository(Invoice);
    const paymentRepository = manager.getRepository(Payment);

    const [invoiceCredits, rentalInvoiceCredits, paymentCredits] = await Promise.all([
      invoiceRepository
        .createQueryBuilder('invoice')
        .where('invoice.userId = :customerId', { customerId })
        .andWhere('invoice.isDeleted = false')
        .andWhere('ROUND(invoice.balance, 2) < -0.1')
        .select('COALESCE(SUM(invoice.balance), 0)', 'total')
        .getRawOne(),
      invoiceRepository
        .createQueryBuilder('invoice')
        .where('invoice.userId = :customerId', { customerId })
        .andWhere('invoice.isDeleted = true')
        .andWhere('ROUND(invoice.balance, 2) < -0.1')
        .select('COALESCE(SUM(invoice.balance), 0)', 'total')
        .getRawOne(),
      paymentRepository
        .createQueryBuilder('payment')
        .where('payment.userId = :customerId', { customerId })
        .andWhere('payment.isDeleted = false')
        .andWhere('payment.balance > 0.09')
        .andWhere('payment.paymentMethodId NOT IN (:...autoPaymentMethods)', {
          autoPaymentMethods: [PaymentMethod.TYPE_CREDIT_USED, PaymentMethod.TYPE_CREDIT_APPLIED],
        })
        .select('COALESCE(SUM(payment.balance), 0)', 'total')
        .getRawOne(),
    ]);

    return (
      Math.abs(parseFloat(invoiceCredits?.total || '0')) +
      Math.abs(parseFloat(rentalInvoiceCredits?.total || '0')) +
      Math.abs(parseFloat(paymentCredits?.total || '0'))
    );
  }
}
