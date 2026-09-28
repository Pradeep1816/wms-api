import { Injectable } from '@nestjs/common';
import { LessonDto, GroupLessonDto, InvoiceDto, PaymentUsedDto, LocationDetailsDto } from '../../dto/payment-edit-info-response.dto';
import { Payment } from '../../entities/payment.entity';
import { formatLegacyDate, formatDate, formatDateWithTime } from '../../../utils/date-utils';
import { formatCurrency } from '../../../utils/formatters';
import { Location } from '../../../location/entities/location.entity';

@Injectable()
export class PaymentEditInfoTransformation {
  /**
   * Extract customer name from payment user
   */
  extractCustomerName(payment: Payment): string {
    let customerName = '';
    if (payment.user?.profile) {
      const firstName = payment.user.profile.firstname || '';
      const lastName = payment.user.profile.lastname || '';
      customerName = `${firstName} ${lastName}`.trim();
    }
    if (!customerName && payment.user?.username) {
      customerName = payment.user.username;
    }
    return customerName;
  }

  /**
   * Transform private lessons
   */
  transformLessons(lessons: any[]): LessonDto[] {
    return lessons.map((lesson: any) => ({
      id: lesson.id,
      originalDate: lesson.originalDate 
        ? formatDateWithTime(new Date(lesson.originalDate)) 
        : '',
      date: lesson.date 
        ? formatDateWithTime(new Date(lesson.date)) 
        : '',
      student: lesson.studentName || '',
      program: lesson.programName || '',
      teacher: lesson.teacherName || '',
      amount: formatCurrency(lesson.amount || 0),
      payment: formatCurrency(lesson.paymentAmount || 0),
      balance: formatCurrency(lesson.balance || 0),
    }));
  }

  /**
   * Transform group lessons
   */
  transformGroupLessons(groupLessons: any[]): GroupLessonDto[] {
    return groupLessons.map((gl: any) => ({
      id: gl.id,
      date: gl.date 
        ? formatDateWithTime(new Date(gl.date)) 
        : '',
      student: gl.studentName || '',
      program: gl.programName || '',
      invoiced: gl.invoiced || 'No',
      amount: formatCurrency(gl.amount || 0),
      payment: formatCurrency(gl.paymentAmount || 0),
      balance: formatCurrency(gl.balance || 0),
    }));
  }

  /**
   * Transform invoices
   */
  transformInvoices(invoices: any[]): InvoiceDto[] {
    return invoices.map((inv: any) => ({
      id: inv.id,
      date: inv.date 
        ? formatDate(new Date(inv.date)) 
        : '',
      number: `I-${inv.invoice_number.toString().padStart(5, '0')}`,
      amount: formatCurrency(inv.amount || 0),
      payment: formatCurrency(inv.paymentAmount || 0),
      balance: formatCurrency(inv.balance || 0),
    }));
  }

  /**
   * Transform payment used (the payment itself)
   */
  transformPaymentUsed(payment: Payment): PaymentUsedDto[] {
    return [{
      userId: payment.userId || 0,
      reference: payment.reference || '',
      date: payment.date ? formatLegacyDate(new Date(payment.date)) : '',
      paymentMethod: payment.paymentMethod?.name || '',
      amount: parseFloat(payment.amount?.toString() || '0'),
    }];
  }

  /**
   * Transform location details
   */
  transformLocationDetails(location?: Location | null): LocationDetailsDto | null {
    if (!location) {
      return null;
    }

    return {
      name: location.name || '',
      address: location.address || '',
      city: location.city?.name || '',
      province: location.province?.name || '',
      country: location.country?.name || '',
      postalCode: location.postalCode || '',
      phoneNumber: location.phoneNumber || '',
      email: location.email || '',
      hstRegistrationNo: location.hstRegistrationNo || '',
    };
  }
  /**
   * Generate payment receipt acknowledgment message
   * Format: "This is to acknowledge the receipt of payment from [Customer Name] on [Date] in the amount of $[Amount] via [Payment Method]. We have distributed it to the items below."
   */
  generateAcknowledgment(payment: Payment, buyerName?: string): string {
    const customerName = buyerName || this.extractCustomerName(payment);
    const paymentDate = payment.date ? formatLegacyDate(new Date(payment.date)) : '';
    const paymentAmount = formatCurrency(parseFloat(payment.amount?.toString() || '0'));
    const paymentMethod = payment.paymentMethod?.name || '';

    return `This is to acknowledge the receipt of payment from ${customerName} on ${paymentDate} in the amount of ${paymentAmount} via ${paymentMethod}. We have distributed it to the items below.`;
  }
}
