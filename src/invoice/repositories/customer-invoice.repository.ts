import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceStatus } from '../enums/invoice-status.enum';

type CustomerInvoicePrintFilters = {
  startDate: string;
  endDate: string;
  invoiceStatus?: number;
  studentId?: number;
};

@Injectable()
export class CustomerInvoiceRepository {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
  ) {}


  // Get  invoices by customer ID
  async getInvoicesByCustomerId(
    customerId: number,
    locationId: number,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ invoices: any[]; total: number }> {
    
    const qb = this.invoiceRepository.createQueryBuilder('invoice')
    .leftJoinAndSelect('invoice.lineItems', 'lineItems')
    .leftJoinAndSelect('lineItems.invoiceItemEnrolment', 'invoiceItemEnrolment')
    .leftJoinAndSelect('invoiceItemEnrolment.enrolment', 'enrolment')
    .leftJoinAndSelect('enrolment.student', 'student')
    .where('invoice.userId = :customerId', { customerId })
    .andWhere('invoice.locationId = :locationId', { locationId })
    .andWhere('invoice.type = :type', { type: Invoice.TYPE_INVOICE })
    .andWhere('invoice.isDeleted = false')
    .andWhere('invoice.isCanceled = false')
    .orderBy('invoice.date', 'DESC')
    .addOrderBy('invoice.id', 'DESC')
  
  const [invoices, total] = await qb
    .skip((page - 1) * limit)
    .take(limit)
    .getManyAndCount();

    return { invoices, total };
  }

  // Get invoices for print
  async getInvoicesForPrint(
    customerId: number,
    locationId: number,
    filters: any,
  ): Promise<{
    invoices: Invoice[];
    rentalStudentMap: Map<number, { firstName: string; lastName: string }>;
  }> {
    const query = this.invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.lineItems', 'lineItems', 'lineItems.isDeleted = false')
      .leftJoinAndSelect('lineItems.invoiceItemLesson', 'invoiceItemLesson')
      .leftJoinAndSelect('invoiceItemLesson.lesson', 'lesson')
      .leftJoinAndSelect('lesson.course', 'lessonCourse')
      .leftJoinAndSelect('lessonCourse.program', 'lessonProgram')
      .leftJoinAndSelect(
        'lessonCourse.enrolments',
        'lessonCourseEnrolments',
        'lessonCourseEnrolments.isDeleted = false',
      )
      .leftJoinAndSelect('lessonCourseEnrolments.student', 'lessonCourseStudent')
      .leftJoin(
        'equipment_rental_invoice',
        'equipmentRentalInvoice',
        'equipmentRentalInvoice.invoiceId = invoice.id AND equipmentRentalInvoice.isDeleted = 0',
      )
      .leftJoin(
        'equipment_rentals',
        'equipmentRental',
        'equipmentRental.id = equipmentRentalInvoice.equipmentRentalsId AND equipmentRental.isDeleted = 0',
      )
      .leftJoin(
        'student',
        'rentalStudent',
        'rentalStudent.id = equipmentRental.studentId AND rentalStudent.isDeleted = 0',
      )
      .addSelect('rentalStudent.first_name', 'rentalStudentFirstName')
      .addSelect('rentalStudent.last_name', 'rentalStudentLastName')
      .where('invoice.userId = :customerId', { customerId })
      .andWhere('invoice.locationId = :locationId', { locationId })
      .andWhere('invoice.type = :type', { type: Invoice.TYPE_INVOICE })
      .andWhere('invoice.isDeleted = false')
      .andWhere('DATE(invoice.date) BETWEEN :startDate AND :endDate', {
        startDate: filters.startDate,
        endDate: filters.endDate,
      });

    if (
      filters.invoiceStatus !== undefined &&
      Number(filters.invoiceStatus) !== InvoiceStatus.ALL
    ) {
      // Deferred for now:
      // if (Number(filters.invoiceStatus) === InvoiceStatus.VOID) {
      //   query.andWhere('invoice.isVoid = :isVoid', { isVoid: 1 });
      // } else {
      //   query.andWhere('invoice.status = :invoiceStatus', {
      //     invoiceStatus: filters.invoiceStatus,
      //   });
      //   query.andWhere('invoice.isVoid = :isVoid', { isVoid: 0 });
      // }
      query.andWhere('invoice.status = :invoiceStatus', {
        invoiceStatus: filters.invoiceStatus,
      });
    }

    if (filters.studentId) {
      query.andWhere('lessonCourseStudent.id = :studentId', { studentId: filters.studentId });
    }

    query.orderBy('invoice.date', 'ASC').addOrderBy('invoice.id', 'ASC');

    const { entities: invoices, raw } = await query.getRawAndEntities();

    const rentalStudentMap = new Map<number, { firstName: string; lastName: string }>();
    raw.forEach((row) => {
      const invoiceId = Number(row.invoice_id);
      if (!invoiceId) {
        return;
      }

      if (!rentalStudentMap.has(invoiceId)) {
        rentalStudentMap.set(invoiceId, {
          firstName: row.rentalStudentFirstName || '',
          lastName: row.rentalStudentLastName || '',
        });
      }
    });

    return { invoices, rentalStudentMap };
  }

  async getLocationHstRegistrationNo(locationId: number): Promise<string> {
    const row = await this.invoiceRepository.manager
      .createQueryBuilder()
      .select('location.hst_registration_no', 'hstRegistrationNo')
      .from('location', 'location')
      .where('location.id = :locationId', { locationId })
      .getRawOne();

    return row?.hstRegistrationNo || '';
  }

  // Get invoice credits by customer ID
  async getInvoiceCredits(customerId: number,page: number = 1, limit: number = 10) {
    const offset = (page - 1) * limit;
    const [invoices, total] = await this.invoiceRepository.findAndCount({
      where: {
        userId: customerId,
        type: Invoice.TYPE_INVOICE,
        isDeleted: false,
        balance: LessThan(-0.09),
        
      },
      order: { id: 'ASC' },
      skip: offset,
      take: limit,
    });

    return { invoices, total, offset, limit };
  }
}
