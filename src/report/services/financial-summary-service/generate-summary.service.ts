import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Location } from '../../../location/entities/location.entity';
import { Invoice } from '../../../invoice/entities/invoice.entity';
import { Lesson } from '../../../lesson/entities/lesson.entity';
import { GroupLesson } from '../../../lesson/entities/group-lesson.entity';
import { PrivateLesson } from '../../../lesson/entities/private-lesson.entity';
import { Enrolment } from '../../../enrolment/entities/enrolment.entity';
import { Student } from '../../../student/entities/student.entity';
import { User } from '../../../user/entities/user.entity';
import { Course } from '../../../course/entities/course.entity';
import { CustomerAccount } from '../../../customer/entities/customer-account.entity';
import { formatDateToEasternString } from '../../../utils/formatters';
import { FinancialSummarySummaryResponseDto, FinancialSummarySummaryItemDto } from '../../dto/financial-summary-dto/financial-summary-summary.dto';

@Injectable()
export class GenerateSummaryService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Location) private readonly locationRepo: Repository<Location>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(GroupLesson) private readonly groupLessonRepo: Repository<GroupLesson>,
    @InjectRepository(PrivateLesson) private readonly privateLessonRepo: Repository<PrivateLesson>,
    @InjectRepository(Enrolment) private readonly enrolmentRepo: Repository<Enrolment>,
    @InjectRepository(Student) private readonly studentRepo: Repository<Student>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Course) private readonly courseRepo: Repository<Course>,
    @InjectRepository(CustomerAccount) private readonly customerAccountRepo: Repository<CustomerAccount>,
  ) {}

  async getFinancialSummary(
    locationSlug: string,
    goToDate?: string,
  ): Promise<FinancialSummarySummaryResponseDto> {
    try {
      const location = await this.locationRepo.findOne({ where: { slug: locationSlug } });
      if (!location) {
        throw new Error(`Location not found: ${locationSlug}`);
      }

      const currentDate = goToDate ? new Date(goToDate) : new Date();
      const currentDateStr = currentDate.toISOString().slice(0, 10);

      // Get counts and totals for summary
      const [
        prepaidFutureGroupCount,
        prepaidFutureGroupTotal,
        paidUnscheduledGroupCount,
        paidUnscheduledGroupTotal,
        prepaidFuturePrivateCount,
        prepaidFuturePrivateTotal,
        paidUnscheduledPrivateCount,
        paidUnscheduledPrivateTotal,
        activeOutstandingCount,
        activeOutstandingTotal,
        inactiveOutstandingCount,
        inactiveOutstandingTotal,
        activeOwingCustomersCount,
        activeEnrolmentsCount,
      ] = await Promise.all([
        // Prepaid Future Group Lessons
        this.groupLessonRepo
          .createQueryBuilder('group_lesson')
          .select('COUNT(DISTINCT group_lesson.id)', 'count')
          .innerJoin('lesson', 'lesson', 'lesson.id = group_lesson.lessonId')
          .innerJoin('enrolment', 'enrolment', 'enrolment.id = group_lesson.enrolmentId')
          .innerJoin('student', 'student', 'student.id = enrolment.studentId')
          .innerJoin('user', 'user', 'user.id = student.customerId')
          .innerJoin('course', 'course', 'course.id = lesson.courseId')
          .where('course.locationId = :locationId', { locationId: location.id })
          .andWhere('lesson.date >= :currentDate', { currentDate: currentDateStr })
          .andWhere('lesson.isDeleted = false')
          .andWhere('group_lesson.isDeleted = false')
          .andWhere('enrolment.isDeleted = false')
          .andWhere('student.isDeleted = false')
          .andWhere('user.isDeleted = false')
          .andWhere('lesson.isConfirmed = true')
          .andWhere('lesson.status != :canceledStatus', { canceledStatus: 4 })
          .andWhere('(group_lesson.paidStatus = :paidStatus OR (group_lesson.paidStatus = :owingStatus AND group_lesson.balance != group_lesson.total))', {
            paidStatus: 1,
            owingStatus: 2,
          })
          .andWhere('group_lesson.balance < group_lesson.total')
          .andWhere('group_lesson.total != 0')
          .getRawOne(),
        
        this.groupLessonRepo
          .createQueryBuilder('group_lesson')
          .select('COALESCE(SUM(group_lesson.total - group_lesson.balance), 0)', 'total')
          .innerJoin('lesson', 'lesson', 'lesson.id = group_lesson.lessonId')
          .innerJoin('enrolment', 'enrolment', 'enrolment.id = group_lesson.enrolmentId')
          .innerJoin('student', 'student', 'student.id = enrolment.studentId')
          .innerJoin('user', 'user', 'user.id = student.customerId')
          .innerJoin('course', 'course', 'course.id = lesson.courseId')
          .where('course.locationId = :locationId', { locationId: location.id })
          .andWhere('lesson.date >= :currentDate', { currentDate: currentDateStr })
          .andWhere('lesson.isDeleted = false')
          .andWhere('group_lesson.isDeleted = false')
          .andWhere('enrolment.isDeleted = false')
          .andWhere('student.isDeleted = false')
          .andWhere('user.isDeleted = false')
          .andWhere('lesson.isConfirmed = true')
          .andWhere('lesson.status != :canceledStatus', { canceledStatus: 4 })
          .andWhere('(group_lesson.paidStatus = :paidStatus OR (group_lesson.paidStatus = :owingStatus AND group_lesson.balance != group_lesson.total))', {
            paidStatus: 1,
            owingStatus: 2,
          })
          .andWhere('group_lesson.balance < group_lesson.total')
          .andWhere('group_lesson.total != 0')
          .getRawOne(),

        // Paid Unscheduled Group Lessons
        this.groupLessonRepo
          .createQueryBuilder('group_lesson')
          .select('COUNT(*)', 'count')
          .innerJoin('lesson', 'lesson', 'lesson.id = group_lesson.lessonId')
          .innerJoin('enrolment', 'enrolment', 'enrolment.id = group_lesson.enrolmentId')
          .innerJoin('student', 'student', 'student.id = enrolment.studentId')
          .innerJoin('user', 'user', 'user.id = student.customerId')
          .innerJoin('course', 'course', 'course.id = lesson.courseId')
          .where('course.locationId = :locationId', { locationId: location.id })
          .andWhere('DATE(lesson.date) < :currentDate', { currentDate: currentDateStr })
          .andWhere('lesson.isDeleted = false')
          .andWhere('group_lesson.isDeleted = false')
          .andWhere('enrolment.isDeleted = false')
          .andWhere('student.isDeleted = false')
          .andWhere('user.isDeleted = false')
          .andWhere('group_lesson.total != 0')
          .andWhere('lesson.status = :unscheduledStatus', { unscheduledStatus: 5 })
          .andWhere('(group_lesson.paidStatus = :paidStatus OR (group_lesson.paidStatus = :owingStatus AND group_lesson.balance != group_lesson.total))', {
            paidStatus: 1,
            owingStatus: 2,
          })
          .andWhere('group_lesson.balance < group_lesson.total')
          .getRawOne(),

        this.groupLessonRepo
          .createQueryBuilder('group_lesson')
          .select('COALESCE(SUM(group_lesson.total - group_lesson.balance), 0)', 'total')
          .innerJoin('lesson', 'lesson', 'lesson.id = group_lesson.lessonId')
          .innerJoin('enrolment', 'enrolment', 'enrolment.id = group_lesson.enrolmentId')
          .innerJoin('student', 'student', 'student.id = enrolment.studentId')
          .innerJoin('user', 'user', 'user.id = student.customerId')
          .innerJoin('course', 'course', 'course.id = lesson.courseId')
          .where('course.locationId = :locationId', { locationId: location.id })
          .andWhere('DATE(lesson.date) < :currentDate', { currentDate: currentDateStr })
          .andWhere('lesson.isDeleted = false')
          .andWhere('group_lesson.isDeleted = false')
          .andWhere('enrolment.isDeleted = false')
          .andWhere('student.isDeleted = false')
          .andWhere('user.isDeleted = false')
          .andWhere('group_lesson.total != 0')
          .andWhere('lesson.status = :unscheduledStatus', { unscheduledStatus: 5 })
          .andWhere('(group_lesson.paidStatus = :paidStatus OR (group_lesson.paidStatus = :owingStatus AND group_lesson.balance != group_lesson.total))', {
            paidStatus: 1,
            owingStatus: 2,
          })
          .andWhere('group_lesson.balance < group_lesson.total')
          .getRawOne(),

        // Prepaid Future Private Lessons
        this.lessonRepo
          .createQueryBuilder('lesson')
          .select('COUNT(DISTINCT lesson.id)', 'count')
          .leftJoin(
            'enrolment', 
            'enrolment', 
            'enrolment.courseId = lesson.courseId AND enrolment.id = (SELECT MIN(e2.id) FROM enrolment e2 WHERE e2.courseId = lesson.courseId AND e2.isDeleted = false)'
          )
          .leftJoin('student', 'student', 'student.id = enrolment.studentId')
          .leftJoin('user', 'user', 'user.id = student.customerId')
          .leftJoin('user_profile', 'user_profile', 'user_profile.user_id = user.id')
          .leftJoin('user_email', 'user_email', 'user_email.id = user.id AND user_email.isDeleted = false')
          .leftJoin('private_lesson', 'private_lesson', 'private_lesson.lessonId = lesson.id')
          .leftJoin('lesson_payment', 'lesson_payment', 'lesson_payment.lessonId = lesson.id AND lesson_payment.isDeleted = false')
          .leftJoin('payment', 'payment', 'payment.id = lesson_payment.paymentId AND payment.isDeleted = false')
          .innerJoin('course', 'course', 'course.id = lesson.courseId')
          .innerJoin('program', 'program', 'program.id = course.programId')
          .where('course.locationId = :locationId', { locationId: location.id })
          .andWhere('lesson.date > :currentDate', { currentDate: currentDateStr })
          .andWhere('lesson.isDeleted = false')
          .andWhere('program.type = :privateProgram', { privateProgram: 1 })
          .andWhere('course.isDeleted = false')
          .andWhere('lesson.isConfirmed = true')
          .andWhere('lesson.status != :canceledStatus', { canceledStatus: 4 })
          .andWhere('lesson.status != :expiredStatus', { expiredStatus: 10 })
          .andWhere('lesson_payment.lessonId IS NOT NULL')
          .getRawOne(),

        // Sum of paid amounts for prepaid future private lessons
        this.lessonRepo.manager
          .createQueryBuilder()
          .select('COALESCE(SUM(lesson_payment.amount), 0)', 'total')
          .from('lesson', 'lesson')
          .leftJoin(
            'enrolment', 
            'enrolment', 
            'enrolment.courseId = lesson.courseId AND enrolment.id = (SELECT MIN(e2.id) FROM enrolment e2 WHERE e2.courseId = lesson.courseId AND e2.isDeleted = false)'
          )
          .leftJoin('student', 'student', 'student.id = enrolment.studentId')
          .leftJoin('user', 'user', 'user.id = student.customerId')
          .leftJoin('user_profile', 'user_profile', 'user_profile.user_id = user.id')
          .leftJoin('user_email', 'user_email', 'user_email.id = user.id AND user_email.isDeleted = false')
          .leftJoin('private_lesson', 'private_lesson', 'private_lesson.lessonId = lesson.id')
          .leftJoin('lesson_payment', 'lesson_payment', 'lesson_payment.lessonId = lesson.id AND lesson_payment.isDeleted = false')
          .leftJoin('payment', 'payment', 'payment.id = lesson_payment.paymentId AND payment.isDeleted = false')
          .innerJoin('course', 'course', 'course.id = lesson.courseId')
          .innerJoin('program', 'program', 'program.id = course.programId')
          .where('course.locationId = :locationId', { locationId: location.id })
          .andWhere('lesson.date > :currentDate', { currentDate: currentDateStr })
          .andWhere('lesson.isDeleted = false')
          .andWhere('program.type = :privateProgram', { privateProgram: 1 })
          .andWhere('course.isDeleted = false')
          .andWhere('lesson.isConfirmed = true')
          .andWhere('lesson.status != :canceledStatus', { canceledStatus: 4 })
          .andWhere('lesson.status != :expiredStatus', { expiredStatus: 10 })
          .andWhere('lesson_payment.lessonId IS NOT NULL')
          .getRawOne(),

        // Paid Unscheduled Private Lessons - Match detailed query logic
        this.lessonRepo
          .createQueryBuilder('lesson')
          .select('COUNT(*)', 'count')
          .leftJoin('lesson_payment', 'lesson_payment', 'lesson_payment.lessonId = lesson.id AND lesson_payment.isDeleted = false')
          .innerJoin('course', 'course', 'course.id = lesson.courseId AND course.isDeleted = false')
          .innerJoin('program', 'program', 'program.id = course.programId')
          .leftJoin('private_lesson', 'private_lesson', 'private_lesson.lessonId = lesson.id')
          .where('lesson.date < :currentDate', { currentDate: currentDateStr })
          .andWhere('lesson.isDeleted = false')
          .andWhere('lesson.isConfirmed = true')
          .andWhere('lesson.status != :canceledStatus', { canceledStatus: 4 })
          .andWhere('lesson.status = :unscheduledStatus', { unscheduledStatus: 5 })
          .andWhere('lesson_payment.lessonId IS NOT NULL')
          .andWhere('course.locationId = :locationId', { locationId: location.id })
          .andWhere('course.isDeleted = false')
          .andWhere('program.type = :type', { type: 1 })
          .andWhere('DATE(private_lesson.expiryDate) > :currentDate', { currentDate: currentDateStr })
          .getRawOne(),

        // Sum of paid amounts for paid unscheduled private lessons
        this.lessonRepo.manager
        .createQueryBuilder()
        .select('COALESCE(SUM(lesson_payment.amount), 0)', 'total')
        .from('lesson', 'lesson')
        .leftJoin('lesson_payment', 'lesson_payment', 'lesson_payment.lessonId = lesson.id AND lesson_payment.isDeleted = false')
        .innerJoin('course', 'course', 'course.id = lesson.courseId AND course.isDeleted = false')
        .innerJoin('program', 'program', 'program.id = course.programId')
        .leftJoin('private_lesson', 'private_lesson', 'private_lesson.lessonId = lesson.id')
        .where('lesson.date < :currentDate', { currentDate: currentDateStr })
        .andWhere('lesson.isDeleted = false')
        .andWhere('lesson.isConfirmed = true')
        .andWhere('lesson.status != :canceledStatus', { canceledStatus: 4 })
        .andWhere('lesson.status = :unscheduledStatus', { unscheduledStatus: 5 })
        .andWhere('lesson_payment.lessonId IS NOT NULL')
        .andWhere('course.locationId = :locationId', { locationId: location.id })
        .andWhere('course.isDeleted = false')
        .andWhere('program.type = :type', { type: 1 })
        .andWhere('DATE(private_lesson.expiryDate) > :currentDate', { currentDate: currentDateStr })
        .getRawOne(),

        // Active Outstanding Invoices
        // Canceled/void invoices are excluded — they are hidden from every invoice
        // list, so counting their leftover balance overstates outstanding revenue.
        this.invoiceRepo
          .createQueryBuilder('invoice')
          .select('COUNT(*)', 'count')
          .leftJoin(User, 'user', 'user.id = invoice.userId')
          .where('invoice.locationId = :locationId', { locationId: location.id })
          .andWhere('invoice.balance > 0')
          .andWhere('invoice.isDeleted = false')
          .andWhere('invoice.isCanceled = false')
          .andWhere('invoice.isVoid = :isVoid', { isVoid: 0 })
          .andWhere('invoice.type = :type', { type: 2 })
          .andWhere('invoice.status = :owingStatus', { owingStatus: 1 })
          .andWhere('user.status = :status', { status: 2 })
          .getRawOne(),

        this.invoiceRepo
          .createQueryBuilder('invoice')
          .select('COALESCE(SUM(invoice.balance), 0)', 'total')
          .leftJoin(User, 'user', 'user.id = invoice.userId')
          .where('invoice.locationId = :locationId', { locationId: location.id })
          .andWhere('invoice.balance > 0')
          .andWhere('invoice.isDeleted = false')
          .andWhere('invoice.isCanceled = false')
          .andWhere('invoice.isVoid = :isVoid', { isVoid: 0 })
          .andWhere('invoice.type = :type', { type: 2 })
          .andWhere('invoice.status = :owingStatus', { owingStatus: 1 })
          .andWhere('user.status = :status', { status: 2 })
          .getRawOne(),

        // Inactive Outstanding Invoices
        this.invoiceRepo
          .createQueryBuilder('invoice')
          .select('COUNT(*)', 'count')
          .leftJoin(User, 'user', 'user.id = invoice.userId')
          .where('invoice.locationId = :locationId', { locationId: location.id })
          .andWhere('invoice.balance > 0')
          .andWhere('invoice.isDeleted = false')
          .andWhere('invoice.isCanceled = false')
          .andWhere('invoice.isVoid = :isVoid', { isVoid: 0 })
          .andWhere('invoice.type = :type', { type: 2 })
          .andWhere('invoice.status = :owingStatus', { owingStatus: 1 })
          .andWhere('user.status != :activeStatus', { activeStatus: 2 })
          .getRawOne(),

        this.invoiceRepo
          .createQueryBuilder('invoice')
          .select('COALESCE(SUM(invoice.balance), 0)', 'total')
          .leftJoin(User, 'user', 'user.id = invoice.userId')
          .where('invoice.locationId = :locationId', { locationId: location.id })
          .andWhere('invoice.balance > 0')
          .andWhere('invoice.isDeleted = false')
          .andWhere('invoice.isCanceled = false')
          .andWhere('invoice.isVoid = :isVoid', { isVoid: 0 })
          .andWhere('invoice.type = :type', { type: 2 })
          .andWhere('invoice.status = :owingStatus', { owingStatus: 1 })
          .andWhere('user.status != :activeStatus', { activeStatus: 2 })
          .getRawOne(),

        // Number of Active Customers (Owing) - exclude walk-in
        this.userRepo.manager
          .createQueryBuilder()
          .select('COUNT(DISTINCT user.id)', 'count')
          .from('user', 'user')
          .innerJoin('rbac_auth_assignment', 'rbac_auth_assignment', 'rbac_auth_assignment.user_id = user.id AND rbac_auth_assignment.item_name = :roleName', { roleName: 'customer' })
          .innerJoin('user_location', 'user_location', 'user_location.user_id = user.id AND user_location.location_id = :locationId', { locationId: location.id })
          .leftJoin('location_walkin_customer', 'location_walkin_customer', 'location_walkin_customer.customerId = user.id AND location_walkin_customer.locationId = :locationId', { locationId: location.id })
          .where('user.isDeleted = false')
          .andWhere('location_walkin_customer.customerId IS NULL')
          .andWhere(`(
            user.status = :activeStatus
            OR (
              user.status != :activeStatus
              AND EXISTS (
                SELECT 1 FROM customer_account customer_account
                WHERE customer_account.customerId = user.id AND customer_account.balance != 0
              )
            )
          )`, { activeStatus: 2 })
          .getRawOne(),

        // Number of Active Enrolments (confirmed, regular, active customers)
        this.enrolmentRepo.manager
        .createQueryBuilder()
        .select('COUNT(*)', 'count')
        .from('enrolment', 'e')
        .innerJoin('course', 'c', 'c.id = e.courseId')
        .where('c.locationId = :locationId', { locationId: location.id })
        .andWhere('e.isDeleted = false')
        .andWhere('c.isDeleted = false')
        .andWhere('e.isConfirmed = true')
        .andWhere('c.type = :regularType', { regularType: Course.TYPE_REGULAR })
        .andWhere('DATE(c.endDate) >= CURRENT_DATE')
        .getRawOne(),
      ]);

      const summaryItems: FinancialSummarySummaryItemDto[] = [
        {
          particulars: 'Prepaid Future Group Lessons',
          count: parseInt(prepaidFutureGroupCount?.count || '0'),
          total: parseFloat(prepaidFutureGroupTotal?.total || '0').toFixed(2),
        },
        {
          particulars: 'Paid Unscheduled Group Lessons',
          count: parseInt(paidUnscheduledGroupCount?.count || '0'),
          total: parseFloat(paidUnscheduledGroupTotal?.total || '0').toFixed(2),
        },
        {
          particulars: 'Prepaid Future Private Lessons',
          count: parseInt(prepaidFuturePrivateCount?.count || '0'),
          total: parseFloat(prepaidFuturePrivateTotal?.total || '0').toFixed(2),
        },
        {
          particulars: 'Paid Unscheduled Private Lessons',
          count: parseInt(paidUnscheduledPrivateCount?.count || '0'),
          total: parseFloat(paidUnscheduledPrivateTotal?.total || '0').toFixed(2),
        },
        {
          particulars: 'Active Outstanding Invoices',
          count: parseInt(activeOutstandingCount?.count || '0'),
          total: parseFloat(activeOutstandingTotal?.total || '0').toFixed(2),
        },
        {
          particulars: 'Inactive Outstanding Invoices',
          count: parseInt(inactiveOutstandingCount?.count || '0'),
          total: parseFloat(inactiveOutstandingTotal?.total || '0').toFixed(2),
        },
        {
          particulars: 'Number of Active Customers',
          count: parseInt(activeOwingCustomersCount?.count || '0'),
          total: '0.00',
        },
        {
          particulars: 'Number of Active Enrolments',
          count: parseInt(activeEnrolmentsCount?.count || '0'),
          total: '0.00',
        },
      ];

      return {
        body: summaryItems,
      };
    } catch (error) {
      throw error;
    }
  }
}
