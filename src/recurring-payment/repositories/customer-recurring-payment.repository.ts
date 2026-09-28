import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { CustomerRecurringPayment } from '../entities/customer-recurring-payment.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { PaymentFrequency } from '../../payment/entities/payment-frequency.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { RecurringPaymentEnrolmentDto } from '../dto/customer-recurring-payment-info-response.dto';
import {
  COMPLETED_ENROLMENT_LINK_WARNING,
  RecurringPaymentEnrolmentWarningDto,
} from '../dto/recurring-payment-enrolment-warning.dto';
import { calculateRecurringPaymentEnrolmentAmount } from '../helpers/recurring-payment-enrolment-amount.helper';

interface EnrolmentLinkWarningRow {
  recurringPaymentId: string | number;
  studentId: string | number;
  studentName: string;
  programName: string;
  completedEnrolmentId: string | number;
  currentEnrolmentId: string | number;
}

@Injectable()
export class CustomerRecurringPaymentRepository {
  constructor(
    @InjectRepository(CustomerRecurringPayment)
    private readonly customerRecurringPaymentRepository: Repository<CustomerRecurringPayment>,
    @InjectRepository(PaymentMethod)
    private readonly paymentMethodRepository: Repository<PaymentMethod>,
    @InjectRepository(PaymentFrequency)
    private readonly paymentFrequencyRepository: Repository<PaymentFrequency>,
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
  ) {}

  /**
   * Get recurring payments by customer ID with pagination
   */
  async getRecurringPaymentsByCustomerId(
    customerId: number,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ recurringPayments: any[]; total: number }> {
    const [recurringPayments, total] = await this.customerRecurringPaymentRepository
      .findAndCount({
        where: { customerId, isDeleted: false },
        relations: ['paymentFrequency', 'paymentMethod', 'enrolments'],
        skip: (page - 1) * limit,
        take: limit,
        order: { id: 'DESC' },
      });

    return { recurringPayments, total };
  }

  /**
   * Find recurring payment by ID (for edit mode)
   */
  async getRecurringPaymentById(recurringPaymentId: number): Promise<CustomerRecurringPayment | null> {
    return this.customerRecurringPaymentRepository.findOne({
      where: { id: recurringPaymentId, isDeleted: false },
      relations: ['paymentFrequency', 'paymentMethod', 'customer', 'customer.profile'],
    });
  }

  /**
   * Get active and displayed payment methods, sorted by sortOrder
   */
  async getPaymentMethods(): Promise<PaymentMethod[]> {
    return this.paymentMethodRepository
      .createQueryBuilder('pm')
      .where('pm.active = :active', { active: true })
      .andWhere('pm.displayed = :displayed', { displayed: true })
      .orderBy('pm.sortOrder', 'ASC')
      .getMany();
  }

  /**
   * Get payment frequencies ordered by ID
   */
  async getPaymentFrequencies(): Promise<PaymentFrequency[]> {
    return this.paymentFrequencyRepository.find({
      order: { id: 'ASC' },
    });
  }

  /**
   * Get minimal enrolment info for create/update customer-details form.
   * Legacy parity: only show active/future enrolments, not completed past enrolments.
   */
  async getRecurringPaymentCreateEnrolments(
    customerId: number,
    locationId: number,
    recurringPaymentId?: number,
  ): Promise<RecurringPaymentEnrolmentDto[]> {
    const currentDate = new Date().toISOString().slice(0, 10);

    // Build base query for checking enrolments
    const checkQuery = this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .innerJoin('enrolment.student', 'student')
      .innerJoin('enrolment.course', 'course')
      .leftJoin('course.program', 'program')
      .where('student.customerId = :customerId', { customerId })
      .andWhere('enrolment.isDeleted = false')
      .andWhere('enrolment.isConfirmed = true')
      .andWhere('course.isDeleted = false')
      .andWhere('course.isConfirmed = true')
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('program.type = :programType', { programType: 1 })
      .andWhere('course.type = :courseType', { courseType: 1 });

    // Legacy parity: hide completed enrolments in both create and edit mode.
    checkQuery.andWhere('DATE(enrolment.endDateTime) >= :currentDate', { currentDate });

    const hasAnyEnrolments = await checkQuery.getCount();

    // If no enrolments exist, return empty array
    if (hasAnyEnrolments === 0) {
      return [];
    }

    // Build main query
    const queryBuilder = this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .innerJoin('enrolment.student', 'student')
      .innerJoin('enrolment.course', 'course')
      .leftJoin('course.program', 'program')
      .leftJoin('course.lessons', 'lessons')
      .leftJoin('enrolment.paymentFrequency', 'paymentFrequency')
      .leftJoin('enrolment.customerRecurringPaymentEnrolments', 'crpEnrol', 'crpEnrol.isDeleted = false')
      .leftJoin('course.teacher', 'teacher')
      .leftJoin('teacher.profile', 'profile')
      .leftJoin('course_schedule', 'courseSchedule', 'courseSchedule.courseId = course.id')
      .leftJoin('course_program_rate', 'courseProgramRate', `courseProgramRate.courseId = course.id AND GREATEST('${currentDate}', DATE(course.startDate)) BETWEEN courseProgramRate.startDate AND courseProgramRate.endDate`)
      .leftJoin('enrolment_discount', 'paymentFrequencyDiscount', 'paymentFrequencyDiscount.enrolmentId = enrolment.id AND paymentFrequencyDiscount.type = 1')
      .leftJoin('enrolment_discount', 'multipleEnrolmentDiscount', 'multipleEnrolmentDiscount.enrolmentId = enrolment.id AND multipleEnrolmentDiscount.type = 2')
      .where('student.customerId = :customerId', { customerId })
      .andWhere('enrolment.isDeleted = false')
      .andWhere('enrolment.isConfirmed = true')
      .andWhere('course.isDeleted = false')
      .andWhere('course.isConfirmed = true')
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('program.type = :programType', { programType: 1 })
      .andWhere('course.type = :courseType', { courseType: 1 })
      .andWhere('lessons.isDeleted = false')
      .andWhere('lessons.isConfirmed = true')
      .andWhere('lessons.status IN (:...lessonStatuses)', {
        lessonStatuses: [
          LessonStatusEnum.RESCHEDULED,
          LessonStatusEnum.SCHEDULED,
          LessonStatusEnum.UNSCHEDULED,
          LessonStatusEnum.COMPLETED,
        ],
      });

    // Legacy parity: hide completed enrolments in both create and edit mode.
    queryBuilder.andWhere('DATE(enrolment.endDateTime) >= :currentDate', { currentDate });

    const rows = await queryBuilder
      .andWhere(new Brackets(qb => {
        // Create mode: crpEnrol.id IS NULL (active links only because join filters isDeleted=false)
        // Edit mode: unlinked OR linked to this payment id
        qb.where('(:recurringPaymentId IS NULL AND crpEnrol.id IS NULL)', { recurringPaymentId: recurringPaymentId ?? null })
          .orWhere('(crpEnrol.id IS NULL OR crpEnrol.customerRecurringPaymentId = :recurringPaymentId)', {
            recurringPaymentId: recurringPaymentId ?? null,
          });
      }))
      .select([
        'enrolment.id AS id',
        'program.name AS programName',
        'paymentFrequency.name AS paymentFrequency',
        "CONCAT(COALESCE(student.firstName, ''), ' ', COALESCE(student.lastName, '')) AS studentName",
        "CONCAT(COALESCE(profile.firstName, ''), ' ', COALESCE(profile.lastName, '')) AS teacherName",
        'enrolment.paymentFrequencyId AS paymentFrequencyId',
        'COALESCE(courseProgramRate.programRate * (TIME_TO_SEC(courseSchedule.duration) / 3600) * enrolment.paymentFrequencyId * 4, 0) AS grossDueAmount',
        'paymentFrequencyDiscount.discount AS paymentFrequencyDiscount',
        'paymentFrequencyDiscount.discountType AS paymentFrequencyDiscountType',
        'multipleEnrolmentDiscount.discount AS multipleEnrolmentDiscount',
        'multipleEnrolmentDiscount.discountType AS multipleEnrolmentDiscountType',
        'MAX(CASE WHEN crpEnrol.customerRecurringPaymentId = :recurringPaymentId THEN 1 ELSE 0 END) AS isSelected',
      ])
      .groupBy('enrolment.id')
      .orderBy('enrolment.id', 'ASC')
      .getRawMany();

    const result = rows.map((e: any) => ({
      id: e.id,
      programName: e.programName || null,
      paymentFrequency: e.paymentFrequency || null,
      studentName: e.studentName || null,
      teacherName: e.teacherName || null,
      dueAmount: calculateRecurringPaymentEnrolmentAmount({
        grossAmount: e.grossDueAmount,
        paymentFrequencyId: e.paymentFrequencyId,
        paymentFrequencyDiscount: e.paymentFrequencyDiscount,
        paymentFrequencyDiscountType: e.paymentFrequencyDiscountType,
        multipleEnrolmentDiscount: e.multipleEnrolmentDiscount,
        multipleEnrolmentDiscountType: e.multipleEnrolmentDiscountType,
      }),
      isSelected: Boolean(Number(e.isSelected || 0)),
    }));

    return result;
  }

  /**
   * Find an active recurring-payment link that still targets a completed
   * enrolment while an eligible current enrolment for the same student and
   * program is not linked to any recurring payment.
   *
   * This is deliberately read-only. Staff must review and save the recurring
   * payment because some current enrolments may be intentionally excluded.
   */
  async getEnrolmentLinkWarnings(
    recurringPaymentId: number,
    customerId: number,
    locationId: number,
  ): Promise<RecurringPaymentEnrolmentWarningDto[]> {
    const rows = await this.getEnrolmentLinkWarningRows(
      [recurringPaymentId],
      locationId,
      customerId,
    );

    return rows.map((row) => {
      const studentName = row.studentName || 'This student';
      const programName = row.programName || 'program';

      return {
        code: COMPLETED_ENROLMENT_LINK_WARNING,
        message:
          `${studentName}'s completed ${programName} enrolment is still selected, ` +
          `while the current enrolment is not selected. Review this recurring payment before its next processing date.`,
        studentId: Number(row.studentId),
        studentName,
        programName,
        completedEnrolmentId: Number(row.completedEnrolmentId),
        currentEnrolmentId: Number(row.currentEnrolmentId),
      };
    });
  }

  /**
   * Batch version used by recurring-payment lists. It evaluates only the
   * payments on the requested page and returns their IDs for a lightweight
   * status indicator.
   */
  async getRecurringPaymentIdsWithEnrolmentLinkWarnings(
    recurringPaymentIds: number[],
    locationId: number,
  ): Promise<Set<number>> {
    const warningPaymentIds = new Set<number>();
    const uniqueIds = [...new Set(recurringPaymentIds)];
    const chunkSize = 500;

    for (let index = 0; index < uniqueIds.length; index += chunkSize) {
      const rows = await this.getEnrolmentLinkWarningRows(
        uniqueIds.slice(index, index + chunkSize),
        locationId,
      );

      for (const row of rows) {
        warningPaymentIds.add(Number(row.recurringPaymentId));
      }
    }

    return warningPaymentIds;
  }

  private async getEnrolmentLinkWarningRows(
    recurringPaymentIds: number[],
    locationId: number,
    customerId?: number,
  ): Promise<EnrolmentLinkWarningRow[]> {
    if (recurringPaymentIds.length === 0) {
      return [];
    }

    const currentDate = new Date().toISOString().slice(0, 10);

    const queryBuilder = this.customerRecurringPaymentRepository
      .createQueryBuilder('recurringPayment')
      .innerJoin(
        'recurringPayment.enrolments',
        'completedPaymentLink',
        'completedPaymentLink.isDeleted = false',
      )
      .innerJoin('completedPaymentLink.enrolment', 'completedEnrolment')
      .innerJoin('completedEnrolment.student', 'student')
      .innerJoin('completedEnrolment.course', 'completedCourse')
      .innerJoin('completedCourse.program', 'program')
      .innerJoin(
        Enrolment,
        'currentEnrolment',
        [
          'currentEnrolment.studentId = completedEnrolment.studentId',
          'currentEnrolment.id != completedEnrolment.id',
          'currentEnrolment.isDeleted = false',
          'currentEnrolment.isConfirmed = true',
        ].join(' AND '),
      )
      .innerJoin(
        'currentEnrolment.course',
        'currentCourse',
        [
          'currentCourse.programId = completedCourse.programId',
          'currentCourse.locationId = :locationId',
          'currentCourse.type = :courseType',
          'currentCourse.isDeleted = false',
          'currentCourse.isConfirmed = true',
        ].join(' AND '),
        {
          locationId,
          courseType: 1,
        },
      )
      .innerJoin(
        'currentCourse.lessons',
        'currentLesson',
        [
          'currentLesson.isDeleted = false',
          'currentLesson.isConfirmed = true',
          'currentLesson.status IN (:...lessonStatuses)',
        ].join(' AND '),
        {
          lessonStatuses: [
            LessonStatusEnum.RESCHEDULED,
            LessonStatusEnum.SCHEDULED,
            LessonStatusEnum.UNSCHEDULED,
            LessonStatusEnum.COMPLETED,
          ],
        },
      )
      .leftJoin(
        'currentEnrolment.customerRecurringPaymentEnrolments',
        'currentPaymentLink',
        'currentPaymentLink.isDeleted = false',
      )
      .where('recurringPayment.id IN (:...recurringPaymentIds)', {
        recurringPaymentIds,
      })
      .andWhere('recurringPayment.isDeleted = false')
      .andWhere('recurringPayment.isRecurringPaymentEnabled = true')
      .andWhere('student.customerId = recurringPayment.customerId')
      .andWhere('student.isDeleted = false')
      .andWhere('completedEnrolment.isDeleted = false')
      .andWhere('completedEnrolment.isConfirmed = true')
      .andWhere('completedCourse.isDeleted = false')
      .andWhere('completedCourse.isConfirmed = true')
      .andWhere('completedCourse.locationId = :locationId', { locationId })
      .andWhere('completedCourse.type = :courseType', { courseType: 1 })
      .andWhere('program.type = :programType', { programType: 1 })
      .andWhere('DATE(completedEnrolment.endDateTime) < :currentDate', {
        currentDate,
      })
      .andWhere('DATE(currentEnrolment.endDateTime) >= :currentDate', {
        currentDate,
      })
      .andWhere('DATE(currentCourse.endDate) >= :currentDate', {
        currentDate,
      })
      .andWhere('currentPaymentLink.id IS NULL')
      .select([
        'recurringPayment.id AS recurringPaymentId',
        'student.id AS studentId',
        "TRIM(CONCAT(COALESCE(student.firstName, ''), ' ', COALESCE(student.lastName, ''))) AS studentName",
        'program.name AS programName',
        'completedEnrolment.id AS completedEnrolmentId',
        'currentEnrolment.id AS currentEnrolmentId',
      ])
      .distinct(true)
      .orderBy('student.id', 'ASC')
      .addOrderBy('currentEnrolment.id', 'ASC');

    if (customerId !== undefined) {
      queryBuilder.andWhere('recurringPayment.customerId = :customerId', {
        customerId,
      });
    }

    return queryBuilder.getRawMany<EnrolmentLinkWarningRow>();
  }
}
