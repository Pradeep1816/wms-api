import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../../payment/entities/payment.entity';
import { InvoicePayment } from '../entities/invoice-payment.entity';
import { LessonPayment } from '../../lesson/entities/lesson-payment.entity';
import { EmailTemplate } from '../../notification/entities/email-template.entity';
import { ReminderNote } from '../../notification/entities/reminder-note.entity';
import { UserEmail } from '../../user/entities/user-email.entity';
import { Invoice } from '../entities/invoice.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { GroupLesson } from '../../lesson/entities/group-lesson.entity';
import { CreditUsage } from '../../payment/entities/credit-usage.entity';
import { UserLocation } from '../../user/entities/user-location.entity';
import { publicProgramName } from '../../pricing/utils/program-public-name';

@Injectable()
export class InvoicePaymentEmailRepository {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(InvoicePayment)
    private readonly invoicePaymentRepository: Repository<InvoicePayment>,
    @InjectRepository(LessonPayment)
    private readonly lessonPaymentRepository: Repository<LessonPayment>,
    @InjectRepository(EmailTemplate)
    private readonly emailTemplateRepository: Repository<EmailTemplate>,
    @InjectRepository(ReminderNote)
    private readonly reminderNoteRepository: Repository<ReminderNote>,
    @InjectRepository(UserEmail)
    private readonly userEmailRepository: Repository<UserEmail>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(GroupLesson)
    private readonly groupLessonRepository: Repository<GroupLesson>,
    @InjectRepository(CreditUsage)
    private readonly creditUsageRepository: Repository<CreditUsage>,
    @InjectRepository(UserLocation)
    private readonly userLocationRepository: Repository<UserLocation>,
  ) {}

  /**
   * Get payment with user and payment method relations
   */
  async getPaymentWithUser(paymentId: number, locationId: number): Promise<Payment | null> {
    return this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.user', 'user')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('payment.paymentMethod', 'paymentMethod')
      .leftJoin('user.userLocation', 'userLocation')
      .where('payment.id = :paymentId', { paymentId })
      .andWhere('payment.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .getOne();
  }

  /**
   * Get invoices paid by this payment
   */
  async getInvoicesPaidByPayment(paymentId: number): Promise<any[]> {
    const invoicePayments = await this.invoicePaymentRepository
      .createQueryBuilder('invoicePayment')
      .leftJoinAndSelect('invoicePayment.invoice', 'invoice')
      .where('invoicePayment.payment_id = :paymentId', { paymentId })
      .andWhere('invoicePayment.isDeleted = false')
      .andWhere('invoice.isDeleted = false')
      .getMany();

    return invoicePayments.map(ip => ({
      invoiceId: ip.invoice.id,
      invoiceNumber: ip.invoice.invoiceNumber,
      date: ip.invoice.date,
      total: ip.invoice.total,
      balance: ip.invoice.balance,
      amountPaid: ip.amount,
      walkinBuyerName: ip.invoice.walkinBuyerName,
    }));
  }

  /**
   * Get private lessons paid by this payment
   */
  async getLessonsPaidByPayment(paymentId: number): Promise<any[]> {
    const lessonPayments = await this.lessonPaymentRepository
      .createQueryBuilder('lessonPayment')
      .leftJoinAndSelect('lessonPayment.lesson', 'lesson')
      .leftJoinAndSelect('lesson.privateLesson', 'privateLesson')
      .leftJoinAndSelect('lessonPayment.enrolment', 'enrolment')
      .leftJoinAndSelect('enrolment.student', 'student')
      .leftJoinAndSelect('lesson.course', 'course')
      .leftJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('lesson.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'teacherProfile')
      .where('lessonPayment.paymentId = :paymentId', { paymentId })
      .andWhere('lessonPayment.isDeleted = false')
      .andWhere('lesson.isDeleted = false')
      .andWhere('privateLesson.id IS NOT NULL') // Check if private_lesson record exists
      .getMany();

    return lessonPayments.map(lp => {
      const privateLesson = lp.lesson.privateLesson?.[0];
      const teacherName = lp.lesson.teacher?.profile
        ? `${lp.lesson.teacher.profile.firstname || ''} ${lp.lesson.teacher.profile.lastname || ''}`.trim()
        : '';
      const studentName = lp.enrolment?.student
        ? `${lp.enrolment.student.firstName || ''} ${lp.enrolment.student.lastName || ''}`.trim()
        : '';

      return {
        lessonId: lp.lesson.id,
        originalDate: lp.lesson.originalDate || lp.lesson.date, // Use originalDate if available, fallback to date
        date: lp.lesson.date,
        studentName,
        // A payment receipt a customer reads. It must agree with the
        // invoice for the same lesson, which already uses the public name.
        programName: publicProgramName(
          lp.lesson.course?.program,
          lp.lesson.course?.locationId,
        ) || '',
        teacherName,
        total: privateLesson?.total || 0,
        balance: privateLesson?.balance || 0,
        amountPaid: lp.amount,
      };
    });
  }

  /**
   * Get group lessons paid by this payment
   */
  async getGroupLessonsPaidByPayment(paymentId: number): Promise<any[]> {
    const lessonPayments = await this.lessonPaymentRepository
      .createQueryBuilder('lessonPayment')
      .leftJoinAndSelect('lessonPayment.lesson', 'lesson')
      .leftJoinAndSelect('lesson.groupLesson', 'groupLesson')
      .leftJoinAndSelect('groupLesson.enrolment', 'enrolment')
      .leftJoinAndSelect('enrolment.student', 'student')
      .leftJoinAndSelect('lesson.course', 'course')
      .leftJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('lesson.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'teacherProfile')
      .where('lessonPayment.paymentId = :paymentId', { paymentId })
      .andWhere('lessonPayment.isDeleted = false')
      .andWhere('lesson.isDeleted = false')
      .andWhere('groupLesson.id IS NOT NULL') // Check if group_lesson record exists
      .andWhere('groupLesson.isDeleted = false')
      .getMany();

    return lessonPayments.map(lp => {
      const groupLesson = lp.lesson.groupLesson?.[0];
      const teacherName = lp.lesson.teacher?.profile
        ? `${lp.lesson.teacher.profile.firstname || ''} ${lp.lesson.teacher.profile.lastname || ''}`.trim()
        : '';
      const studentName = groupLesson?.enrolment?.student
        ? `${groupLesson.enrolment.student.firstName || ''} ${groupLesson.enrolment.student.lastName || ''}`.trim()
        : '';

      return {
        lessonId: lp.lesson.id,
        originalDate: lp.lesson.originalDate || lp.lesson.date, // Use originalDate if available, fallback to date
        date: lp.lesson.date,
        studentName,
        // A payment receipt a customer reads. It must agree with the
        // invoice for the same lesson, which already uses the public name.
        programName: publicProgramName(
          lp.lesson.course?.program,
          lp.lesson.course?.locationId,
        ) || '',
        teacherName,
        total: groupLesson?.total || 0,
        balance: groupLesson?.balance || 0,
        amountPaid: lp.amount,
      };
    });
  }

  /**
   * Get customer email addresses
   */
  async getCustomerEmails(customerId: number): Promise<string[]> {
    const emails = await this.userEmailRepository
      .createQueryBuilder('userEmail')
      .innerJoin('userEmail.userContact', 'userContact')
      .where('userContact.userId = :customerId', { customerId })
      .andWhere('userEmail.isDeleted = false')
      .select('userEmail.email')
      .orderBy('userEmail.email', 'ASC')
      .getMany();

    return emails.map(e => e.email);
  }

  /**
   * Get email template by type
   * emailTypeId = 5 for RECEIPT
   */
  async getEmailTemplate(emailTypeId: number): Promise<EmailTemplate | null> {
    return this.emailTemplateRepository.findOne({
      where: { emailTypeId },
    });
  }

  /**
   * Get HST registration number from customer's primary location
   */
  async getHstNumber(userId: number): Promise<string | null> {
    const userLocation = await this.userLocationRepository
      .createQueryBuilder('userLocation')
      .leftJoinAndSelect('userLocation.location', 'location')
      .where('userLocation.userId = :userId', { userId })
      .orderBy('userLocation.id', 'ASC')
      .getOne();

    return userLocation?.location?.hstRegistrationNo || null;
  }

  /**
   * Get payments used section data
   * In PHP, this includes payment credits and invoice credits from request parameters.
   * In NestJS, we only have the main payment from database.
   * Credit usage data is not stored in a queryable format.
   */
  async getPaymentsUsed(paymentId: number): Promise<any[]> {
    // Get the main payment
    const payment = await this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.paymentMethod', 'paymentMethod')
      .where('payment.id = :paymentId', { paymentId })
      .andWhere('payment.isDeleted = false')
      .getOne();

    if (!payment) {
      return [];
    }

    // Return only the main payment with required fields
    // PHP shows: reference, date, paymentMethod, amount
    return [{
      reference: payment.notes || payment.reference || payment.id.toString(),
      date: payment.date,
      paymentMethod: payment.paymentMethod?.name || '',
      amount: payment.amount,
    }];
  }

  /**
   * Get global reminder notes (policies)
   */
  async getReminderNotes(): Promise<string | null> {
    const reminderNote = await this.reminderNoteRepository.findOne({
      where: {},
      order: { id: 'ASC' },
    });

    return reminderNote?.notes || null;
  }

  /**
   * Get payment with user profile (for POST - sending email)
   */
  async getPaymentWithUserProfile(paymentId: number, locationId: number): Promise<Payment | null> {
    return this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.user', 'user')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('payment.paymentMethod', 'paymentMethod')
      .leftJoin('user.userLocation', 'userLocation')
      .where('payment.id = :paymentId', { paymentId })
      .andWhere('payment.isDeleted = false')
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .getOne();
  }

  /**
   * Get user with profile (for log message)
   */
  async getUserWithProfile(userId: number): Promise<any> {
    return this.paymentRepository.manager
      .createQueryBuilder()
      .select('user')
      .from('user', 'user')
      .leftJoinAndSelect('user.profile', 'profile')
      .where('user.id = :userId', { userId })
      .getOne();
  }
}
