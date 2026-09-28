import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { CustomerRecurringPayment } from '../entities/customer-recurring-payment.entity';
import { CustomerRecurringPaymentEnrolment } from '../entities/customer-recurring-payment-enrolment.entity';
import { PaymentFrequency } from '../../payment/entities/payment-frequency.entity';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { calculateRecurringPaymentEnrolmentAmount } from '../helpers/recurring-payment-enrolment-amount.helper';

@Injectable()
export class RecurringPaymentUpdateRepository {
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

  async getPaymentFrequencyById(
    paymentFrequencyId: number,
  ): Promise<PaymentFrequency | null> {
    return this.paymentFrequencyRepository.findOne({
      where: { id: paymentFrequencyId },
    });
  }

  async getLatestRecordedRecurringPayment(
    recurringPaymentId: number,
  ): Promise<{ date: string } | null> {
    const row = await this.customerRecurringPaymentRepository.manager
      .createQueryBuilder()
      .select('rp.date', 'date')
      .from('recurring_payment', 'rp')
      .where('rp.customerRecurringPaymentId = :recurringPaymentId', {
        recurringPaymentId,
      })
      .orderBy('rp.date', 'DESC')
      .limit(1)
      .getRawOne<{ date: string }>();

    return row ?? null;
  }

  async hasRecordedRecurringPaymentBetween(
    recurringPaymentId: number,
    fromDate: string,
    toDate: string,
  ): Promise<boolean> {
    const row = await this.customerRecurringPaymentRepository.manager
      .createQueryBuilder()
      .select('rp.id', 'id')
      .from('recurring_payment', 'rp')
      .where('rp.customerRecurringPaymentId = :recurringPaymentId', {
        recurringPaymentId,
      })
      .andWhere('DATE(rp.date) BETWEEN :fromDate AND :toDate', {
        fromDate,
        toDate,
      })
      .limit(1)
      .getRawOne<{ id: number }>();

    return !!row;
  }

  async getEligibleEnrolmentIds(
    customerId: number,
    recurringPaymentId: number,
  ): Promise<number[]> {
    const currentDate = new Date().toISOString().slice(0, 10);

    // Enrolment validation - Legacy query used 'anotherRecurringPaymentExcluded()'
    // which allowed enrolments linked to current recurring payment OR not linked to any
    // New System validates enrolment IDs belong to customer (additional security check)
    // Ensure this doesn't break any legacy workflows

    // Dedicated update-mode eligible enrolments query (legacy-style constraints).
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
      .andWhere('program.type = :programType', { programType: 1 })
      .andWhere('course.type = :courseType', { courseType: 1 })
      .andWhere('DATE(course.endDate) > :currentDate', { currentDate })
      .andWhere(
        new Brackets((qb) => {
          qb.where('crpEnrol.id IS NULL').orWhere(
            'crpEnrol.customerRecurringPaymentId = :recurringPaymentId',
            { recurringPaymentId },
          );
        }),
      )
      .select('DISTINCT enrolment.id', 'id')
      .getRawMany<{ id: number }>();

    return rows.map((row) => Number(row.id));
  }

  async updateRecurringPayment(
    recurringPaymentId: number,
    recurringPaymentData: Partial<CustomerRecurringPayment>,
    enrolmentIds: number[],
    userId: number,
  ): Promise<void> {
    await this.customerRecurringPaymentRepository.manager.transaction(
      async (manager) => {
        const recurringPaymentRepo = manager.getRepository(
          CustomerRecurringPayment,
        );
        const enrolmentLinkRepo = manager.getRepository(
          CustomerRecurringPaymentEnrolment,
        );

        const recurringPayment = await recurringPaymentRepo.findOne({
          where: { id: recurringPaymentId, isDeleted: false },
        });

        if (!recurringPayment) {
          throw new Error(`Recurring payment not found: ${recurringPaymentId}`);
        }

        Object.assign(recurringPayment, recurringPaymentData, {
          updatedByUserId: userId,
        });
        await recurringPaymentRepo.save(recurringPayment);

        const existingLinks = await enrolmentLinkRepo.find({
          where: {
            customerRecurringPaymentId: recurringPaymentId,
            isDeleted: false,
          },
        });

        if (existingLinks.length > 0) {
          existingLinks.forEach((link) => {
            link.isDeleted = true;
            link.updatedByUserId = userId;
          });
          await enrolmentLinkRepo.save(existingLinks);
        }

        if (enrolmentIds.length === 0) {
          return;
        }

        const newLinks = enrolmentIds.map((enrolmentId) =>
          enrolmentLinkRepo.create({
            enrolmentId,
            customerRecurringPaymentId: recurringPaymentId,
            isDeleted: false,
            createdByUserId: userId,
            updatedByUserId: userId,
          }),
        );

        await enrolmentLinkRepo.save(newLinks);
      },
    );
  }

  // GET API methods for update form data (legacy parity)

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

  async getAllPaymentFrequencies(): Promise<PaymentFrequency[]> {
    return this.paymentFrequencyRepository.find({
      order: {
        id: 'ASC',
      },
    });
  }

  async getSelectedEnrolmentIds(
    recurringPaymentId: number,
  ): Promise<number[]> {
    const rows = await this.customerRecurringPaymentEnrolmentRepository.find({
      where: {
        customerRecurringPaymentId: recurringPaymentId,
        isDeleted: false,
      },
      select: ['enrolmentId'],
    });

    return rows.map((row) => row.enrolmentId);
  }

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

    return rows.map((row) => ({
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
  }
}
