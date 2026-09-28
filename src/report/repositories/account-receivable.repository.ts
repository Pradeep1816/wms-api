import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from '../../location/entities/location.entity';
import { User } from '../../user/entities/user.entity';
import { UserProfile } from '../../user/entities/user-profile.entity';
import { UserLocation } from '../../user/entities/user-location.entity';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { Payment } from '../../payment/entities/payment.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { PrivateLesson } from '../../lesson/entities/private-lesson.entity';

@Injectable()
export class AccountReceivableRepository {
  constructor(
    @InjectRepository(Location) private readonly locationRepo: Repository<Location>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserProfile) private readonly userProfileRepo: Repository<UserProfile>,
    @InjectRepository(UserLocation) private readonly userLocationRepo: Repository<UserLocation>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(PrivateLesson) private readonly privateLessonRepo: Repository<PrivateLesson>,
  ) {}

  /**
   * Find location by slug
   */
  async findLocationBySlug(slug: string): Promise<Location | null> {
    return this.locationRepo.findOne({ where: { slug } });
  }

  /**
   * Get customers with balance based on filters
   */
  async getCustomersWithBalance(
    locationId: number,
    showAllActive: boolean | undefined,
    showAllInActive: boolean | undefined,
  ): Promise<any[]> {
    // Handle undefined values (default to true for backward compatibility)
    const activeFilter = showAllActive ?? true;
    const inactiveFilter = showAllInActive ?? true;
    
    // Handle the case where both filters are false (no customers should be shown)
    if (!activeFilter && !inactiveFilter) {
      console.log(`[DEBUG] Both filters are false - returning empty result`);
      return [];
    }

    // Get all customers first (match legacy: User::find()->customers($locationId)->notDeleted())
    let customersQuery = this.userRepo
      .createQueryBuilder('u')
      .select('u.id', 'id')
      .addSelect('u.status', 'status')
      .addSelect('up.firstname', 'firstname')
      .addSelect('up.lastname', 'lastname')
      .innerJoin('user_profile', 'up', 'up.user_id = u.id')
      .innerJoin('user_location', 'ul', 'ul.user_id = u.id')
      .innerJoin('rbac_auth_assignment', 'raa', 'raa.user_id = u.id')
      .where('ul.location_id = :locationId', { locationId })
      .andWhere('raa.item_name = :itemName', { itemName: 'customer' })
      .andWhere('u.isDeleted = :isDeleted', { isDeleted: false })
      .distinct(true)
      .orderBy('up.firstname', 'ASC')
      .addOrderBy('u.id', 'DESC');

    // Apply status filter
    if (activeFilter && !inactiveFilter) {
      customersQuery = customersQuery.andWhere('u.status = :status', { status: 2 });
    } else if (inactiveFilter && !activeFilter) {
      customersQuery = customersQuery.andWhere('u.status != :status', { status: 2 });
    }

    return customersQuery.getRawMany();
  }

  /**
   * Get batch outstanding invoices for multiple customers
   *
   * Canceled and void invoices are excluded: they are hidden from every invoice
   * list, so counting their leftover balance here reports a receivable that the
   * customer has no way to see or pay.
   */
  async getBatchOutstandingInvoices(customerIds: number[]): Promise<Map<number, number>> {
    const result = await this.invoiceRepo
      .createQueryBuilder('invoice')
      .select('invoice.userId', 'customerId')
      .addSelect('SUM(invoice.balance)', 'total')
      .where('invoice.userId IN (:...customerIds)', { customerIds })
      .andWhere('invoice.type = :type', { type: 2 }) // Invoice type
      .andWhere('invoice.balance > :minBalance', { minBalance: 0.09 })
      .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('invoice.isCanceled = :isCanceled', { isCanceled: false })
      .andWhere('invoice.isVoid = :isVoid', { isVoid: 0 })
      .groupBy('invoice.userId')
      .getRawMany();

    const map = new Map<number, number>();
    result.forEach(row => {
      map.set(row.customerId, parseFloat(row.total) || 0);
    });
    return map;
  }

  /**
   * Get batch prepaid lessons for multiple customers
   */
  async getBatchPrePaidLessons(customerIds: number[]): Promise<Map<number, number>> {
    // Use TypeORM Query Builder with subquery to find lessons that are NOT invoiced
    const invoicedLessonsSubquery = this.lessonRepo
      .createQueryBuilder('invoiced_lesson')
      .select('invoiced_lesson.id')
      .leftJoin('invoiced_lesson.course', 'invoiced_course', 'invoiced_course.isDeleted = FALSE')
      .leftJoin('invoiced_course.program', 'invoiced_program')
      .leftJoin('enrolment', 'invoiced_enrolment', 'invoiced_enrolment.courseId = invoiced_lesson.courseId AND invoiced_enrolment.isDeleted = FALSE AND invoiced_enrolment.isConfirmed = TRUE')
      .leftJoin('student', 'invoiced_student', 'invoiced_student.id = invoiced_enrolment.studentId')
      .leftJoin('invoice_item_lesson', 'iil', 'iil.lessonId = invoiced_lesson.id')
      .leftJoin('invoice_line_item', 'ili', 'ili.id = iil.invoiceLineItemId AND ili.isDeleted = FALSE')
      .leftJoin('invoice', 'inv', 'inv.id = ili.invoiceId AND inv.isDeleted = FALSE AND inv.type = 2')
      .where('invoiced_lesson.isDeleted = FALSE')
      .andWhere('invoiced_lesson.isConfirmed = TRUE')
      .andWhere('invoiced_lesson.status != :canceledStatus', { canceledStatus: 4 })
      .andWhere('invoiced_course.isDeleted = FALSE')
      .andWhere('invoiced_program.type = :programType', { programType: 1 })
      .andWhere('invoiced_enrolment.id IS NOT NULL')
      .andWhere('invoiced_student.customerId IN (:...customerIds)', { customerIds })
      .andWhere('inv.id IS NOT NULL');

    // Main query: Get prepaid lessons that are NOT in the invoiced lessons subquery
    const result = await this.lessonRepo
      .createQueryBuilder('lesson')
      .select('student.customerId', 'customerId')
      .addSelect('SUM(payment.amount)', 'total')
      .leftJoin('lesson.course', 'course', 'course.isDeleted = FALSE')
      .leftJoin('course.program', 'program')
      .leftJoin('lesson_payment', 'payment', 'payment.lessonId = lesson.id AND payment.isDeleted = FALSE')
      .leftJoin('enrolment', 'enrolment', 'enrolment.courseId = lesson.courseId AND enrolment.isDeleted = FALSE AND enrolment.isConfirmed = TRUE')
      .leftJoin('student', 'student', 'student.id = enrolment.studentId')
      .where('lesson.isDeleted = FALSE')
      .andWhere('lesson.isConfirmed = TRUE')
      .andWhere('lesson.status != :canceledStatus', { canceledStatus: 4 })
      .andWhere('course.isDeleted = FALSE')
      .andWhere('program.type = :programType', { programType: 1 })
      .andWhere('payment.id IS NOT NULL')
      .andWhere('enrolment.id IS NOT NULL')
      .andWhere('student.customerId IN (:...customerIds)', { customerIds })
      .andWhere(`lesson.id NOT IN (${invoicedLessonsSubquery.getQuery()})`)
      .setParameters(invoicedLessonsSubquery.getParameters())
      .groupBy('student.customerId')
      .getRawMany();

    const map = new Map<number, number>();
    result.forEach(row => {
      map.set(row.customerId, parseFloat(row.total) || 0);
    });
    return map;
  }

  /**
   * Get batch credits for multiple customers
   *
   * Deliberately does NOT exclude canceled/void invoices, unlike the owing-side
   * queries above. Voiding zeroes an invoice's total but leaves any payment
   * applied, so balance becomes -(amount paid): a real credit the customer is
   * owed. Filtering those out here would erase money they actually paid.
   */
  async getBatchCredits(customerIds: number[]): Promise<Map<number, number>> {
    // Get invoice credits (negative balance invoices)
    const invoiceCredits = await this.invoiceRepo
      .createQueryBuilder('invoice')
      .select('invoice.userId', 'customerId')
      .addSelect('SUM(invoice.balance)', 'total')
      .where('invoice.userId IN (:...customerIds)', { customerIds })
      .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('ROUND(invoice.balance, 2) < :threshold', { threshold: -0.1 })
      .groupBy('invoice.userId')
      .getRawMany();

    // Get rental invoice credits (deleted invoices with negative balance)
    const rentalInvoiceCredits = await this.invoiceRepo
      .createQueryBuilder('invoice')
      .select('invoice.userId', 'customerId')
      .addSelect('SUM(invoice.balance)', 'total')
      .where('invoice.userId IN (:...customerIds)', { customerIds })
      .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: true })
      .andWhere('ROUND(invoice.balance, 2) < :threshold', { threshold: -0.1 })
      .groupBy('invoice.userId')
      .getRawMany();

    // Get payment credits (positive balance payments, excluding auto payments)
    const paymentCredits = await this.paymentRepo
      .createQueryBuilder('payment')
      .select('payment.userId', 'customerId')
      .addSelect('SUM(payment.balance)', 'total')
      .where('payment.userId IN (:...customerIds)', { customerIds })
      .andWhere('payment.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('payment.balance > :threshold', { threshold: 0.09 })
      .andWhere('payment.paymentMethodId NOT IN (:...excludeMethods)', { 
        excludeMethods: [2, 3] // TYPE_CREDIT_USED, TYPE_CREDIT_APPLIED
      })
      .groupBy('payment.userId')
      .getRawMany();

    // Combine all credits
    const map = new Map<number, number>();
    
    // Add invoice credits
    invoiceCredits.forEach(row => {
      const existing = map.get(row.customerId) || 0;
      map.set(row.customerId, existing + Math.abs(parseFloat(row.total) || 0));
    });
    
    // Add rental invoice credits
    rentalInvoiceCredits.forEach(row => {
      const existing = map.get(row.customerId) || 0;
      map.set(row.customerId, existing + Math.abs(parseFloat(row.total) || 0));
    });
    
    // Add payment credits
    paymentCredits.forEach(row => {
      const existing = map.get(row.customerId) || 0;
      map.set(row.customerId, existing + Math.abs(parseFloat(row.total) || 0));
    });
    
    return map;
  }

  /**
   * Get batch aging data for multiple customers
   */
  async getBatchAgingData(customerIds: number[], days: number): Promise<Map<number, number>> {
    const now = new Date();

    if (days > 90) {
      // For 90+ days, get invoices strictly older than 90 days
      const cutoffDate = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));

      const result = await this.invoiceRepo
        .createQueryBuilder('invoice')
        .select('invoice.userId', 'customerId')
        .addSelect('SUM(invoice.balance)', 'total')
        .where('invoice.userId IN (:...customerIds)', { customerIds })
        .andWhere('invoice.type = :type', { type: 2 })
        .andWhere('invoice.balance > :minBalance', { minBalance: 0.09 })
        .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('invoice.isCanceled = :isCanceled', { isCanceled: false })
        .andWhere('invoice.isVoid = :isVoid', { isVoid: 0 })
        .andWhere('invoice.date < :cutoffDate', {
          cutoffDate: cutoffDate.toISOString().split('T')[0],
        })
        .groupBy('invoice.userId')
        .getRawMany();

      const map = new Map<number, number>();
      result.forEach(row => {
        map.set(row.customerId, parseFloat(row.total) || 0);
      });
      return map;
    } else {
      // For other buckets, calculate the range
      const daysFrom = days;
      const daysTo = days - 30;
      const fromDate = new Date(now.getTime() - (daysFrom * 24 * 60 * 60 * 1000));
      const toDate = new Date(now.getTime() - (daysTo * 24 * 60 * 60 * 1000));

      const result = await this.invoiceRepo
        .createQueryBuilder('invoice')
        .select('invoice.userId', 'customerId')
        .addSelect('SUM(invoice.balance)', 'total')
        .where('invoice.userId IN (:...customerIds)', { customerIds })
        .andWhere('invoice.type = :type', { type: 2 })
        .andWhere('invoice.balance > :minBalance', { minBalance: 0.09 })
        .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('invoice.isCanceled = :isCanceled', { isCanceled: false })
        .andWhere('invoice.isVoid = :isVoid', { isVoid: 0 })
        .andWhere('invoice.date BETWEEN :fromDate AND :toDate', {
          fromDate: fromDate.toISOString().split('T')[0],
          toDate: toDate.toISOString().split('T')[0],
        })
        .groupBy('invoice.userId')
        .getRawMany();

      const map = new Map<number, number>();
      result.forEach(row => {
        map.set(row.customerId, parseFloat(row.total) || 0);
      });
      return map;
    }
  }

  /**
   * Get recent invoices balance total for a single customer
   */
  async getRecentInvoicesBalanceTotal(customerId: number, days: number): Promise<number> {
    // Calculate date range for aging buckets
    const now = new Date();

    if (days > 90) {
      // For 90+ days, get invoices strictly older than 90 days (use < to exclude boundary)
      const cutoffDate = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));

      const result = await this.invoiceRepo
        .createQueryBuilder('invoice')
        .select('SUM(invoice.balance)', 'total')
        .where('invoice.userId = :customerId', { customerId })
        .andWhere('invoice.type = :type', { type: 2 })
        .andWhere('invoice.balance > :minBalance', { minBalance: 0.09 })
        .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('invoice.isCanceled = :isCanceled', { isCanceled: false })
        .andWhere('invoice.isVoid = :isVoid', { isVoid: 0 })
        .andWhere('invoice.date < :cutoffDate', {
          cutoffDate: cutoffDate.toISOString().split('T')[0],
        })
        .getRawOne();

      return parseFloat(result?.total) || 0;
    } else {
      // For other buckets, calculate the range
      const daysFrom = days;
      const daysTo = days - 30;
      const fromDate = new Date(now.getTime() - (daysFrom * 24 * 60 * 60 * 1000));
      const toDate = new Date(now.getTime() - (daysTo * 24 * 60 * 60 * 1000));

      const result = await this.invoiceRepo
        .createQueryBuilder('invoice')
        .select('SUM(invoice.balance)', 'total')
        .where('invoice.userId = :customerId', { customerId })
        .andWhere('invoice.type = :type', { type: 2 })
        .andWhere('invoice.balance > :minBalance', { minBalance: 0.09 })
        .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('invoice.isCanceled = :isCanceled', { isCanceled: false })
        .andWhere('invoice.isVoid = :isVoid', { isVoid: 0 })
        .andWhere('invoice.date BETWEEN :fromDate AND :toDate', {
          fromDate: fromDate.toISOString().split('T')[0],
          toDate: toDate.toISOString().split('T')[0],
        })
        .getRawOne();

      return parseFloat(result?.total) || 0;
    }
  }

  /**
   * Get invoice owing amount total for a single customer
   *
   * Canceled and void invoices are excluded, matching getBatchOutstandingInvoices.
   */
  async getInvoiceOwingAmountTotal(customerId: number): Promise<number> {
    // Use TypeORM Query Builder
    const result = await this.invoiceRepo
      .createQueryBuilder('invoice')
      .select('SUM(invoice.balance)', 'total')
      .where('invoice.userId = :customerId', { customerId })
      .andWhere('invoice.type = :type', { type: 2 })
      .andWhere('invoice.balance > :minBalance', { minBalance: 0.09 })
      .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('invoice.isCanceled = :isCanceled', { isCanceled: false })
      .andWhere('invoice.isVoid = :isVoid', { isVoid: 0 })
      .getRawOne();

    return parseFloat(result?.total) || 0;
  }

  /**
   * Get prepaid lessons for a single customer
   */
  async getPrePaidLessons(customerId: number): Promise<number> {
    // Use TypeORM Query Builder with subquery to find lessons that are NOT invoiced
    const invoicedLessonsSubquery = this.lessonRepo
      .createQueryBuilder('invoiced_lesson')
      .select('invoiced_lesson.id')
      .leftJoin('invoiced_lesson.course', 'invoiced_course', 'invoiced_course.isDeleted = FALSE')
      .leftJoin('invoiced_course.program', 'invoiced_program')
      .leftJoin('enrolment', 'invoiced_enrolment', 'invoiced_enrolment.courseId = invoiced_lesson.courseId AND invoiced_enrolment.isDeleted = FALSE AND invoiced_enrolment.isConfirmed = TRUE')
      .leftJoin('student', 'invoiced_student', 'invoiced_student.id = invoiced_enrolment.studentId')
      .leftJoin('invoice_item_lesson', 'iil', 'iil.lessonId = invoiced_lesson.id')
      .leftJoin('invoice_line_item', 'ili', 'ili.id = iil.invoiceLineItemId AND ili.isDeleted = FALSE')
      .leftJoin('invoice', 'inv', 'inv.id = ili.invoiceId AND inv.isDeleted = FALSE AND inv.type = 2')
      .where('invoiced_lesson.isDeleted = FALSE')
      .andWhere('invoiced_lesson.isConfirmed = TRUE')
      .andWhere('invoiced_lesson.status != :canceledStatus', { canceledStatus: 4 })
      .andWhere('invoiced_course.isDeleted = FALSE')
      .andWhere('invoiced_program.type = :programType', { programType: 1 })
      .andWhere('invoiced_enrolment.id IS NOT NULL')
      .andWhere('invoiced_student.customerId = :customerId', { customerId })
      .andWhere('inv.id IS NOT NULL');

    // Main query: Get prepaid lessons that are NOT in the invoiced lessons subquery
    const result = await this.lessonRepo
      .createQueryBuilder('lesson')
      .select('SUM(payment.amount)', 'total')
      .leftJoin('lesson.course', 'course', 'course.isDeleted = FALSE')
      .leftJoin('course.program', 'program')
      .leftJoin('lesson_payment', 'payment', 'payment.lessonId = lesson.id AND payment.isDeleted = FALSE')
      .leftJoin('enrolment', 'enrolment', 'enrolment.courseId = lesson.courseId AND enrolment.isDeleted = FALSE AND enrolment.isConfirmed = TRUE')
      .leftJoin('student', 'student', 'student.id = enrolment.studentId')
      .where('lesson.isDeleted = FALSE')
      .andWhere('lesson.isConfirmed = TRUE')
      .andWhere('lesson.status != :canceledStatus', { canceledStatus: 4 })
      .andWhere('course.isDeleted = FALSE')
      .andWhere('program.type = :programType', { programType: 1 })
      .andWhere('payment.id IS NOT NULL')
      .andWhere('enrolment.id IS NOT NULL')
      .andWhere('student.customerId = :customerId', { customerId })
      .andWhere(`lesson.id NOT IN (${invoicedLessonsSubquery.getQuery()})`)
      .setParameters(invoicedLessonsSubquery.getParameters())
      .getRawOne();

    return parseFloat(result?.total) || 0;
  }

  /**
   * Get total credits for a single customer
   */
  async getTotalCredits(customerId: number): Promise<number> {
    // Use TypeORM Query Builder for all credit queries
    
    // Invoice credits (negative balance invoices)
    const invoiceCreditsResult = await this.invoiceRepo
      .createQueryBuilder('invoice')
      .select('SUM(invoice.balance)', 'total')
      .where('invoice.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('invoice.userId = :customerId', { customerId })
      .andWhere('ROUND(invoice.balance, 2) < :threshold', { threshold: -0.1 })
      .getRawOne();

    // Rental invoice credits (deleted invoices with negative balance)
    const rentalInvoiceCreditsResult = await this.invoiceRepo
      .createQueryBuilder('invoice')
      .select('SUM(invoice.balance)', 'total')
      .where('invoice.isDeleted = :isDeleted', { isDeleted: true })
      .andWhere('invoice.userId = :customerId', { customerId })
      .andWhere('ROUND(invoice.balance, 2) < :threshold', { threshold: -0.1 })
      .getRawOne();

    // Payment credits (positive balance payments, excluding auto payments)
    const paymentCreditsResult = await this.paymentRepo
      .createQueryBuilder('payment')
      .select('SUM(payment.balance)', 'total')
      .where('payment.userId = :customerId', { customerId })
      .andWhere('payment.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('payment.balance > :threshold', { threshold: 0.09 })
      .andWhere('payment.paymentMethodId NOT IN (:...excludeMethods)', { 
        excludeMethods: [2, 3] 
      })
      .getRawOne();

    const invoiceTotal = Math.abs(parseFloat(invoiceCreditsResult?.total) || 0);
    const rentalTotal = Math.abs(parseFloat(rentalInvoiceCreditsResult?.total) || 0);
    const paymentTotal = Math.abs(parseFloat(paymentCreditsResult?.total) || 0);

    return invoiceTotal + rentalTotal + paymentTotal;
  }

  /**
   * Find user profile by user ID
   */
  async findUserProfileByUserId(userId: number): Promise<UserProfile | null> {
    return this.userProfileRepo.findOne({ where: { userId } });
  }
}
