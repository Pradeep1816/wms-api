import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { CustomerRecurringPayment } from '../entities/customer-recurring-payment.entity';
import { CustomerRecurringPaymentEnrolment } from '../entities/customer-recurring-payment-enrolment.entity';
import { PaymentFrequency } from '../../payment/entities/payment-frequency.entity';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { getCurrentESTDate } from '../../utils/date-utils';
import { calculateRecurringPaymentEnrolmentAmount } from '../helpers/recurring-payment-enrolment-amount.helper';

@Injectable()
export class CreateRecurringPaymentRepository {
  constructor(
    @InjectRepository(CustomerRecurringPayment)
    private readonly customerRecurringPaymentRepository: Repository<CustomerRecurringPayment>,
    @InjectRepository(CustomerRecurringPaymentEnrolment)
    private readonly customerRecurringPaymentEnrolmentRepository: Repository<CustomerRecurringPaymentEnrolment>,
    @InjectRepository(PaymentFrequency)
    private readonly paymentFrequencyRepository: Repository<PaymentFrequency>,
    @InjectRepository(PaymentMethod)
    private readonly paymentMethodRepository: Repository<PaymentMethod>,
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
  ) {}

  /**
   * Get payment frequency by ID
   */
  async getPaymentFrequencyById(
    paymentFrequencyId: number,
  ): Promise<PaymentFrequency | null> {
    return this.paymentFrequencyRepository.findOne({
      where: { id: paymentFrequencyId },
    });
  }

  /**
   * Get active payment methods
   */
  async getActivePaymentMethods(): Promise<PaymentMethod[]> {
    return this.paymentMethodRepository.find({
      where: {
        active: 1,
        displayed: 1,
      },
      order: {
        sortOrder: 'ASC',
      },
    });
  }

  /**
   * Get all payment frequencies
   */
  async getAllPaymentFrequencies(): Promise<PaymentFrequency[]> {
    return this.paymentFrequencyRepository.find({
      order: {
        id: 'ASC',
      },
    });
  }
 
  async getEligibleEnrolmentIds(
    customerId: number,
    locationId: number,
  ): Promise<number[]> {
    const currentDate = new Date().toISOString().slice(0, 10);

    const rows = await this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .innerJoin('enrolment.student', 'student')
      .innerJoin('enrolment.course', 'course')
      .innerJoin('course.program', 'program')
      .innerJoin('course.lessons', 'lessons')
      .leftJoin(
        'enrolment.customerRecurringPaymentEnrolments',
        'crpEnrol',
        'crpEnrol.isDeleted = false',
      )
      .where('student.customerId = :customerId', { customerId })
      .andWhere('enrolment.isDeleted = false')
      .andWhere('enrolment.isConfirmed = true')
      .andWhere('course.isDeleted = false')
      .andWhere('course.isConfirmed = true')
      .andWhere('course.locationId = :locationId', { locationId }) 
      .andWhere('program.type = :programType', { programType: 1 })
      .andWhere('course.type = :courseType', { courseType: 1 })
      .andWhere('DATE(course.endDate) > :currentDate', { currentDate })
      .andWhere('crpEnrol.id IS NULL')
      .select('DISTINCT enrolment.id', 'id')
      .getRawMany<{ id: number }>();

    return rows.map((row) => Number(row.id));
  }

  /**
   * Get enrolment details for create form
   */
  async getEnrolmentDetails(
    enrolmentIds: number[],
  ): Promise<
    Array<{
      id: number;
      studentName: string;
      programName: string;
      paymentFrequency: string;
      teacherName: string;
      dueAmount: number;
    }>
  > {
    if (enrolmentIds.length === 0) {
      return [];
    }

    const currentDate = new Date().toISOString().slice(0, 10);

    const rows = await this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .innerJoin('enrolment.student', 'student')
      .innerJoin('enrolment.course', 'course')
      .innerJoin('course.program', 'program')
      .leftJoin('enrolment.paymentFrequency', 'paymentFrequency')
      .leftJoin('course.teacher', 'teacher')
      .leftJoin('teacher.profile', 'profile')
      .leftJoin('course_schedule', 'courseSchedule', 'courseSchedule.courseId = course.id')
      .leftJoin('course_program_rate', 'courseProgramRate', `courseProgramRate.courseId = course.id AND GREATEST('${currentDate}', DATE(course.startDate)) BETWEEN courseProgramRate.startDate AND courseProgramRate.endDate`)
      .leftJoin('enrolment_discount', 'paymentFrequencyDiscount', 'paymentFrequencyDiscount.enrolmentId = enrolment.id AND paymentFrequencyDiscount.type = 1')
      .leftJoin('enrolment_discount', 'multipleEnrolmentDiscount', 'multipleEnrolmentDiscount.enrolmentId = enrolment.id AND multipleEnrolmentDiscount.type = 2')
      .where('enrolment.id IN (:...enrolmentIds)', { enrolmentIds })
      .andWhere('enrolment.isDeleted = false')
      .andWhere('course.isDeleted = false')
      .andWhere('course.isConfirmed = true')
      .select([
        'enrolment.id AS id',
        "CONCAT(COALESCE(student.firstName, ''), ' ', COALESCE(student.lastName, '')) AS studentName",
        'program.name AS programName',
        'paymentFrequency.name AS paymentFrequency',
        "CONCAT(COALESCE(profile.firstName, ''), ' ', COALESCE(profile.lastName, '')) AS teacherName",
        'enrolment.paymentFrequencyId AS paymentFrequencyId',
        'COALESCE(courseProgramRate.programRate * (TIME_TO_SEC(courseSchedule.duration) / 3600) * enrolment.paymentFrequencyId * 4, 0) AS grossDueAmount',
        'paymentFrequencyDiscount.discount AS paymentFrequencyDiscount',
        'paymentFrequencyDiscount.discountType AS paymentFrequencyDiscountType',
        'multipleEnrolmentDiscount.discount AS multipleEnrolmentDiscount',
        'multipleEnrolmentDiscount.discountType AS multipleEnrolmentDiscountType',
      ])
      .groupBy('enrolment.id')
      .getRawMany();

    const enrolmentData = rows.map((row) => ({
      id: Number(row.id),
      studentName: row.studentName?.trim() || '',
      programName: row.programName || '',
      paymentFrequency: row.paymentFrequency || '',
      teacherName: row.teacherName?.trim() || '',
      dueAmount: calculateRecurringPaymentEnrolmentAmount({
        grossAmount: row.grossDueAmount,
        paymentFrequencyId: row.paymentFrequencyId,
        paymentFrequencyDiscount: row.paymentFrequencyDiscount,
        paymentFrequencyDiscountType: row.paymentFrequencyDiscountType,
        multipleEnrolmentDiscount: row.multipleEnrolmentDiscount,
        multipleEnrolmentDiscountType: row.multipleEnrolmentDiscountType,
      }),
    }));
    return enrolmentData;
  }

  /**
   * Create recurring payment in transaction
   */
  async createRecurringPayment(
    recurringPaymentData: Partial<CustomerRecurringPayment>,
    enrolmentIds: number[],
    userId: number,
  ): Promise<{ id: number }> {
    return await this.customerRecurringPaymentRepository.manager.transaction(
      async (manager) => {
        const recurringPaymentRepo = manager.getRepository(
          CustomerRecurringPayment,
        );
        const enrolmentLinkRepo = manager.getRepository(
          CustomerRecurringPaymentEnrolment,
        );
        const now = getCurrentESTDate();

        // Create the recurring payment
        const recurringPayment = recurringPaymentRepo.create({
          ...recurringPaymentData,
          isDeleted: false,
          createdByUserId: userId,
          updatedByUserId: userId,
          createdOn: now,
          updatedOn: now,
        });

        const savedPayment = await recurringPaymentRepo.save(recurringPayment);

        // Link enrolments if provided
        if (enrolmentIds && enrolmentIds.length > 0) {
          const newLinks = enrolmentIds.map((enrolmentId) =>
            enrolmentLinkRepo.create({
              enrolmentId,
              customerRecurringPaymentId: savedPayment.id,
              isDeleted: false,
              createdByUserId: userId,
              updatedByUserId: userId,
              createdOn: now,
              updatedOn: now,
            }),
          );

          await enrolmentLinkRepo.save(newLinks);
        }

        return { id: savedPayment.id };
      },
    );
  }
}
