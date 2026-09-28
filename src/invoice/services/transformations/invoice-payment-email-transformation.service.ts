import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Payment } from '../../../payment/entities/payment.entity';
import { EmailTemplate } from '../../../notification/entities/email-template.entity';
import {
  InvoicePaymentEmailDataDto,
  PaymentEmailTemplateDto,
  PaymentContentDto,
  InvoicePaidDto,
  PaymentUsedDto,
  LessonPaidDto,
} from '../../dto/invoice-payment-email-response.dto';
import { formatDate, formatDateWithTime } from '../../../utils/date-utils';
import { formatCurrency } from '../../../utils/formatters';

@Injectable()
export class InvoicePaymentEmailTransformationService {
  transformToResponse(
    payment: Payment,
    invoicesPaid: any[],
    lessonsPaid: any[],
    groupLessonsPaid: any[],
    paymentsUsed: any[],
    emails: string[],
    emailTemplate: EmailTemplate | null,
    hstNumber: string | null,
    reminderNotes: string | null,
  ): InvoicePaymentEmailDataDto {
    const buyerNames = [...new Set(invoicesPaid.map(invoice => invoice.walkinBuyerName).filter(Boolean))];
    const acknowledgment = this.generateAcknowledgmentMessage(payment,
      buyerNames.length === 1 ? `${buyerNames[0]} (Walk-in Customer)` : undefined);
    
    // Format paymentsUsed with currency and date
    const formattedPaymentsUsed = paymentsUsed.map(p => ({
      reference: p.reference,
      date: formatDate(p.date),
      paymentMethod: p.paymentMethod,
      amount: formatCurrency(Number(p.amount)),
    }));
    
    const content = this.formatPaymentContent(
      acknowledgment,
      invoicesPaid,
      lessonsPaid,
      groupLessonsPaid,
      formattedPaymentsUsed,
      hstNumber,
    );

    const template = this.formatEmailTemplate(emailTemplate, emails, reminderNotes);

    const responseData = {
      body: {
        content,
        emailTemplate: template,
      },
    };

    return plainToInstance(InvoicePaymentEmailDataDto, responseData, {
      excludeExtraneousValues: true,
    });
  }

  private generateAcknowledgmentMessage(payment: Payment, buyerName?: string): string {
    const customerName = buyerName || (payment.user?.profile
      ? `${payment.user.profile.firstname || ''} ${payment.user.profile.lastname || ''}`.trim()
      : 'Customer');
    const paymentDate = formatDate(payment.date);
    const amount = formatCurrency(Number(payment.amount));
    const paymentMethod = payment.paymentMethod?.name || 'Payment';

    return `This is to acknowledge the receipt of payment from ${customerName} on ${paymentDate} in the amount of ${amount} via ${paymentMethod}. We have distributed it to the items below.`;
  }

  private formatPaymentContent(
    acknowledgment: string,
    invoicesPaid: any[],
    lessonsPaid: any[],
    groupLessonsPaid: any[],
    paymentsUsed: any[],
    hstNumber: string | null,
  ): PaymentContentDto {
    // Build content in the correct order matching PHP: acknowledgment, lessons, groupLessons, invoices, paymentsUsed, hstNumber
    const content: any = {
      acknowledgment,
    };

    if (lessonsPaid && lessonsPaid.length > 0) {
      content.lessons = this.formatLessonsPaid(lessonsPaid);
    }

    if (groupLessonsPaid && groupLessonsPaid.length > 0) {
      content.groupLessons = this.formatLessonsPaid(groupLessonsPaid);
    }

    if (invoicesPaid && invoicesPaid.length > 0) {
      content.invoices = this.formatInvoicesPaid(invoicesPaid);
    }

    content.paymentsUsed = paymentsUsed;
    content.hstNumber = hstNumber;

    return content;
  }

  private formatInvoicesPaid(invoicesPaid: any[]): InvoicePaidDto[] {
    return invoicesPaid.map(invoice => ({
      date: formatDate(invoice.date),
      number: invoice.invoiceNumber,
      amount: formatCurrency(Number(invoice.total)),
      payment: formatCurrency(Number(invoice.amountPaid)),
      balance: this.formatBalance(invoice.balance),
    }));
  }

  private formatLessonsPaid(lessonsPaid: any[]): LessonPaidDto[] {
    return lessonsPaid.map(lesson => ({
      originalDate: formatDateWithTime(lesson.originalDate),
      date: formatDateWithTime(lesson.date),
      student: lesson.studentName,
      program: lesson.programName,
      teacher: lesson.teacherName,
      amount: formatCurrency(Number(lesson.total)),
      payment: formatCurrency(Number(lesson.amountPaid)),
      balance: formatCurrency(Number(lesson.balance)),
    }));
  }

  private formatBalance(balance: number): string {
    const balanceNum = Number(balance);
    if ((balanceNum > 0 && balanceNum <= 0.09) || (balanceNum < 0 && balanceNum >= -0.09)) {
      return formatCurrency(0);
    }
    return formatCurrency(balanceNum);
  }

  private formatEmailTemplate(
    emailTemplate: EmailTemplate | null,
    emails: string[],
    reminderNotes: string | null,
  ): PaymentEmailTemplateDto {
    const customerEmail = emails.length > 0 ? emails[0] : '';

    if (emailTemplate) {
      // For payment emails, strip out reminder notes from footer
      // Keep only the "Thank you" part before any policy text
      let cleanFooter = emailTemplate.footer || '';
      
      // Remove reminder notes that start with "Just a friendly reminder"
      if (cleanFooter.includes('Just a friendly reminder')) {
        const parts = cleanFooter.split('Just a friendly reminder');
        cleanFooter = parts[0].trim();
      }
      
      // Remove any policy sections (Late Payment Policy, Cancelation Policy, Termination Policy)
      cleanFooter = cleanFooter.replace(/<p[^>]*>.*?(Late Payment Policy|Cancelation Policy|Termination of Lessons Policy).*?<\/p>/gis, '');
      
      // Clean up any trailing whitespace or empty paragraphs
      cleanFooter = cleanFooter.replace(/<p[^>]*>\s*(&nbsp;|\s)*\s*<\/p>/gi, '').trim();

      return {
        id: emailTemplate.id,
        to: customerEmail,
        subject: emailTemplate.subject,
        header: emailTemplate.header || '',
        footer: cleanFooter,
      };
    }

    const defaultFooter = '<p>Thank you,</p>\r\n\r\n<p>Arcadia Academy of Music Team</p>';

    return {
      id: 0,
      to: customerEmail,
      subject: 'Payment from Arcadia Academy of Music',
      header: '<p>Please find the Payment below</p>',
      footer: defaultFooter,
    };
  }
}
