import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceLineItem } from '../entities/invoice-line-item.entity';
import { Invoice } from '../entities/invoice.entity';

@Injectable()
export class UserInvoicedLessonsRepository {
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
      const invoiceLineItems = await this.invoiceLineItemRepository
        .createQueryBuilder('lineItem')
        .innerJoinAndSelect('lineItem.invoice', 'invoice')
        .leftJoinAndSelect('lineItem.invoiceItemLesson', 'itemLesson')
        .leftJoinAndSelect('itemLesson.lesson', 'lesson', 'lesson.teacherId = :teacherId', { teacherId })
        .leftJoinAndSelect('lesson.course', 'course')
        .leftJoinAndSelect('course.program', 'program')
        .leftJoinAndSelect(
          'course.enrolments',
          'enrolment',
          'enrolment.isDeleted = :enrolmentDeleted AND enrolment.isConfirmed = :enrolmentConfirmed',
          { enrolmentDeleted: false, enrolmentConfirmed: true },
        )
        .leftJoinAndSelect('enrolment.student', 'student')
        .leftJoinAndSelect('lineItem.invoiceItemEnrolment', 'itemEnrolment')
        .leftJoinAndSelect('itemEnrolment.enrolment', 'invoicedEnrolment')
        .leftJoinAndSelect('invoicedEnrolment.student', 'invoicedStudent')
        .where('lineItem.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('invoice.isDeleted = :invoiceDeleted', { invoiceDeleted: false })
        .andWhere('invoice.type = :invoiceType', { invoiceType: Invoice.TYPE_INVOICE })
        .andWhere('DATE(invoice.date) >= :fromDate', { fromDate })
        .andWhere('DATE(invoice.date) <= :toDate', { toDate })
        .andWhere('lesson.id IS NOT NULL')
        .andWhere('course.locationId = :locationId', { locationId })
        .orderBy('invoice.date', 'ASC')
        .addOrderBy('lesson.id', 'ASC')
        .getMany();

      return invoiceLineItems;
    } catch (error) {
      console.error('Error in UserInvoicedLessonsRepository:', error);
      throw new InternalServerErrorException(
        'Failed to retrieve user teacher invoiced lessons',
      );
    }
  }
}
