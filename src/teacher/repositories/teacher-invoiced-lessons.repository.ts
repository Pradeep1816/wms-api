import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { getCurrentESTDate } from '../../utils/date-utils';

@Injectable()
export class TeacherInvoicedLessonsRepository {
  constructor(
    @InjectRepository(InvoiceLineItem)
    private readonly invoiceLineItemRepository: Repository<InvoiceLineItem>,
  ) {}

  async findInvoicedLessonsByTeacher(
    teacherId: number,
    locationId: number,
    fromDate: string,
    toDate: string,
  ): Promise<InvoiceLineItem[]> {
    try {
      //InvoiceLineItem -> Invoice -> Lesson via InvoiceItemLesson
      const invoiceLineItems = await this.invoiceLineItemRepository
        .createQueryBuilder('lineItem')
        .innerJoinAndSelect('lineItem.invoice', 'invoice')
        .leftJoinAndSelect('lineItem.invoiceItemLesson', 'itemLesson')
        .leftJoinAndSelect('itemLesson.lesson', 'lesson', 'lesson.teacherId = :teacherId', { teacherId })
        .leftJoinAndSelect('lesson.course', 'course')
        .leftJoinAndSelect('lesson.privateLesson', 'privateLesson')
        .leftJoinAndSelect('course.program', 'program')
        .leftJoinAndSelect('course.enrolments', 'enrolment', 'enrolment.isDeleted = :enrolmentDeleted AND enrolment.isConfirmed = :enrolmentConfirmed', { enrolmentDeleted: false, enrolmentConfirmed: true })
        .leftJoinAndSelect('enrolment.student', 'student')
        .where('lineItem.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('invoice.isDeleted = :invoiceDeleted', { invoiceDeleted: false })
        .andWhere('invoice.type = :invoiceType', { invoiceType: Invoice.TYPE_INVOICE })
        .andWhere('DATE(invoice.date) >= :fromDate', { fromDate })
        .andWhere('DATE(invoice.date) <= :toDate', { toDate })
        .andWhere('lesson.id IS NOT NULL') // Only get line items with lessons
        .andWhere(
          `(
            lesson.status != :expiredLessonStatus
            AND (
              lesson.status != :unscheduledLessonStatus
              OR privateLesson.id IS NULL
              OR privateLesson.expiryDate IS NULL
              OR privateLesson.expiryDate >= :currentDateTime
            )
          )`,
          {
            currentDateTime: getCurrentESTDate(),
            expiredLessonStatus: LessonStatusEnum.EXPIRED,
            unscheduledLessonStatus: LessonStatusEnum.UNSCHEDULED,
          },
        )
        .andWhere('course.locationId = :locationId', { locationId })
        .orderBy('invoice.date', 'ASC')
        .addOrderBy('lesson.id', 'ASC')
        .getMany();

      return invoiceLineItems;
    } catch (error) {
      console.error('Error in TeacherInvoicedLessonsRepository:', error);
      throw new InternalServerErrorException(
        'Failed to retrieve teacher invoiced lessons',
      );
    }
  }

  async findInvoicedLessonsByCustomer(
    customerId: number,
    locationId: number,
    fromDate: string,
    toDate: string,
  ): Promise<InvoiceLineItem[]> {
    try {
      const invoiceLineItems = await this.invoiceLineItemRepository
        .createQueryBuilder('lineItem')
        .innerJoinAndSelect('lineItem.invoice', 'invoice')
        .leftJoinAndSelect('lineItem.invoiceItemLesson', 'itemLesson')
        .leftJoinAndSelect('itemLesson.lesson', 'lesson')
        .leftJoinAndSelect('lesson.course', 'course')
        .leftJoinAndSelect('course.program', 'program')
        .leftJoinAndSelect(
          'course.enrolments',
          'enrolment',
          'enrolment.isDeleted = :enrolmentDeleted AND enrolment.isConfirmed = :enrolmentConfirmed',
          { enrolmentDeleted: false, enrolmentConfirmed: true },
        )
        .leftJoinAndSelect('enrolment.student', 'student')
        .where('lineItem.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('invoice.isDeleted = :invoiceDeleted', {
          invoiceDeleted: false,
        })
        .andWhere('invoice.type = :invoiceType', {
          invoiceType: Invoice.TYPE_INVOICE,
        })
        .andWhere('invoice.userId = :customerId', { customerId })
        .andWhere('DATE(invoice.date) >= :fromDate', { fromDate })
        .andWhere('DATE(invoice.date) <= :toDate', { toDate })
        .andWhere('lesson.id IS NOT NULL')
        .andWhere('course.locationId = :locationId', { locationId })
        .orderBy('invoice.date', 'ASC')
        .addOrderBy('lesson.id', 'ASC')
        .getMany();

      return invoiceLineItems;
    } catch (error) {
      console.error('Error in TeacherInvoicedLessonsRepository:', error);
      throw new InternalServerErrorException(
        'Failed to retrieve customer invoiced lessons',
      );
    }
  }
}
