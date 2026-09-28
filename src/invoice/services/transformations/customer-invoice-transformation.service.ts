import { Injectable } from '@nestjs/common';
import { ICustomerInvoiceTransformationService } from '../../interfaces/customer-invoice-service.interface';
import { CustomerInvoiceDto } from '../../dto/customer-invoice-response.dto';
import { CustomerInvoicePrintItemDto } from '../../dto/customer-invoice-print-response.dto';
import { formatDate } from '../../../utils/date-utils';
import { getInvoiceStatus } from '../../../utils/helper';
import { plainToInstance } from 'class-transformer';
import { formatCurrency } from '../../../utils/formatters';
import { RoundingUtils } from '../../../utils/rounding.utils';

@Injectable()
export class CustomerInvoiceTransformationService implements ICustomerInvoiceTransformationService {
  transformToDto(invoice: any, locationSlug: string): CustomerInvoiceDto {
    // Format invoice date
    const invoiceDate = invoice.date ? new Date(invoice.date) : null;
    const displayBalance = RoundingUtils.applyBalanceTolerance(
      Number(invoice.balance) || 0,
    );

    const dtoData = {
      invoiceId: invoice.id,
      id: `I-${invoice.invoiceNumber}`,
      date: invoiceDate ? formatDate(invoiceDate) : '',
      status: getInvoiceStatus(invoice.status, invoice.type, invoice.balance, invoice.isVoid),
      total: formatCurrency(invoice.total),
      balance: formatCurrency(displayBalance),
      studentName: this.getStudentNameFromInvoice(invoice),
      url: `admin/${locationSlug}/invoices/${invoice.id}`,
    };

    return plainToInstance(CustomerInvoiceDto, dtoData);
  }

  transformInvoicesToDtos(invoices: any[], locationSlug: string): CustomerInvoiceDto[] {
    return invoices.map(invoice => this.transformToDto(invoice, locationSlug));
  }

  transformToPrintDto(
    invoice: any,
    rentalStudentMap?: Map<number, { firstName: string; lastName: string }>,
  ): CustomerInvoicePrintItemDto {
    const dtoData = {
      invoiceNumber: `I-${String(invoice.invoiceNumber).padStart(5, '0')}`,
      date: invoice?.date ? formatDate(new Date(invoice.date)) : null,
      status: getInvoiceStatus(
        invoice.status,
        invoice.type,
        invoice.balance,
        invoice.isVoid,
      ),
      total: formatCurrency(Number(invoice.total) || 0),
      studentName: this.getStudentName(invoice, rentalStudentMap),
    };

    return plainToInstance(CustomerInvoicePrintItemDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  transformInvoicesToPrintDtos(
    invoices: any[],
    rentalStudentMap?: Map<number, { firstName: string; lastName: string }>,
  ): CustomerInvoicePrintItemDto[] {
    return invoices.map((invoice) =>
      this.transformToPrintDto(invoice, rentalStudentMap),
    );
  }

  private getStudentNameFromInvoice(invoice: any): string {
    try {
      if (invoice?.lineItems && invoice.lineItems.length > 0) {
        const li = invoice.lineItems[0];
        const student = li?.invoiceItemEnrolment?.enrolment?.student;
        if (student) {
          const first = student.firstName || '';
          const last = student.lastName || '';
          return `${first} ${last}`.trim();
        }
      }
    } catch (e) {
      // swallow and return empty string
    }
    return '';
  }

  //  Student name for print inoice
  private getStudentName(
    invoice: any,
    rentalStudentMap?: Map<number, { firstName: string; lastName: string }>,
  ): string {
    if (invoice?.isEquipmentRentalContract) {
      const rentalStudent = rentalStudentMap?.get(invoice.id);
      const rentalName = `${rentalStudent?.firstName || ''} ${rentalStudent?.lastName || ''}`.trim();
      return rentalName;
    }

    try {
      const lineItems = Array.isArray(invoice?.lineItems) ? invoice.lineItems : [];
      const firstLineItem = lineItems[0];
      if (!firstLineItem) {
        return '';
      }

      const studentData = this.lineItemStudentForPrint(firstLineItem);
      if (!studentData) {
        return '';
      }

      if (studentData.fullName && studentData.programName) {
        return `${studentData.fullName} (${studentData.programName})`;
      }
      return studentData.fullName;
    } catch (e) {
      return '';
    }
  }

  private lineItemStudentForPrint(
    lineItem: any,
  ): { fullName: string; programName: string } | null {
    const lesson = lineItem?.invoiceItemLesson?.lesson;
    const lessonProgramName = lesson?.course?.program?.name || '';
    const firstCourseEnrolment = Array.isArray(lesson?.course?.enrolments)
      ? lesson.course.enrolments[0]
      : null;
    
     if (!firstCourseEnrolment || !firstCourseEnrolment.student) {
      return null;
    }
      return {
        fullName: `${firstCourseEnrolment?.student?.firstName} ${firstCourseEnrolment?.student?.lastName}`.trim(),
        programName: lessonProgramName,
      };
  }
}
